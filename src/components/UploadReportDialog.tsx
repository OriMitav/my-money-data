import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseCSV, parseXLSX, applyMapping } from "@/lib/fileParser";
import type { ColumnMapping } from "@/lib/fileParser";
import type { Json } from "@/integrations/supabase/types";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);

function sanitizeStorageFileName(fileName: string) {
  const parts = fileName.split(".");
  const ext = parts.length > 1 ? `.${parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const base = parts.join(".");
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return `${Date.now()}_${safeBase || "upload"}${ext}`;
}

interface UploadReportDialogProps {
  trigger?: React.ReactNode;
}

export function UploadReportDialog({ trigger }: UploadReportDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(currentYear));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: entities = [] } = useQuery({
    queryKey: ["financial_entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_entities").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const resetDialog = () => {
    setFile(null);
    setEntityId("");
    setMonth(String(new Date().getMonth() + 1));
    setYear(String(currentYear));
  };

  const handleUpload = useCallback(async () => {
    if (!file || !entityId || !month || !year) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    setUploading(true);
    try {
      const entity = entities.find((e) => e.id === entityId);
      if (!entity) throw new Error("ישות לא נמצאה");

      const mapping = entity.column_mapping as unknown as ColumnMapping;
      if (!mapping?.date || !mapping?.sourceRecipient) {
        throw new Error("מיפוי העמודות של הישות אינו שלם");
      }
      const hasValue = mapping.value || (mapping.credit && mapping.debit);
      if (!hasValue) {
        throw new Error("מיפוי העמודות חייב לכלול עמודת סכום או עמודות זכות/חובה");
      }

      const isCSV = file.name.toLowerCase().endsWith(".csv");
      const rows = isCSV ? await parseCSV(file) : await parseXLSX(file);
      if (rows.length === 0) throw new Error("הקובץ ריק");

      const parsed = applyMapping(rows, mapping);
      if (parsed.length === 0) throw new Error("לא נמצאו שורות תקינות אחרי עיבוד הקובץ");

      // Dedupe within file
      const seen = new Set<string>();
      const uniqueParsed = parsed.filter((row) => {
        const key = `${row.date}|${row.sourceRecipient.trim()}|${row.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const fileDuplicates = parsed.length - uniqueParsed.length;

      // Dedupe vs DB
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("date, source_recipient, value")
        .eq("entity_id", entityId);
      const existingKeys = new Set(
        (existingTx || []).map((t) => `${t.date}|${(t.source_recipient || "").trim()}|${Number(t.value)}`)
      );
      const finalParsed = uniqueParsed.filter(
        (row) => !existingKeys.has(`${row.date}|${row.sourceRecipient.trim()}|${row.value}`)
      );
      const dbDuplicates = uniqueParsed.length - finalParsed.length;

      if (finalParsed.length === 0) {
        throw new Error(`כל ${parsed.length} השורות בקובץ כבר קיימות במערכת — הועלה דוח כפול`);
      }

      // Auto-categorize: load existing recipient -> category mapping
      const { data: existingMappings } = await supabase
        .from("recipient_categories")
        .select("recipient_name, category_id")
        .eq("user_id", user!.id);
      const mapByName = new Map<string, string | null>();
      (existingMappings || []).forEach((m) => mapByName.set(m.recipient_name.trim(), m.category_id));

      // Find unmapped recipient names
      const unknownRecipients = new Map<string, boolean>(); // name -> isIncome
      for (const row of finalParsed) {
        const name = row.sourceRecipient.trim();
        if (!name) continue;
        if (!mapByName.has(name) && !unknownRecipients.has(name)) {
          unknownRecipients.set(name, row.value > 0);
        }
      }

      if (unknownRecipients.size > 0) {
        const { data: cats } = await supabase
          .from("categories")
          .select("id, name, type, parent_id")
          .eq("user_id", user!.id);
        const catList = (cats || []).map((c) => {
          const parent = c.parent_id ? (cats || []).find((p) => p.id === c.parent_id) : null;
          return { id: c.id, name: c.name, parent_name: parent?.name || null, type: c.type as "income" | "expense" };
        });

        if (catList.length > 0) {
          try {
            const { data: aiResult } = await supabase.functions.invoke("categorize-recipients", {
              body: {
                recipients: Array.from(unknownRecipients.entries()).map(([name, isIncome]) => ({ name, isIncome })),
                categories: catList,
              },
            });
            const results = (aiResult?.results || []) as { recipient: string; category_id: string | null }[];
            const validIds = new Set(catList.map((c) => c.id));
            const inserts = results
              .filter((r) => r.category_id === null || validIds.has(r.category_id))
              .map((r) => ({
                user_id: user!.id,
                recipient_name: r.recipient.trim(),
                category_id: r.category_id,
              }));
            if (inserts.length > 0) {
              await supabase.from("recipient_categories").upsert(inserts, { onConflict: "user_id,recipient_name" });
              inserts.forEach((i) => mapByName.set(i.recipient_name, i.category_id));
            }
          } catch (aiErr) {
            console.error("AI categorization failed", aiErr);
          }
        }
      }

      // Upload file to storage
      const safeFileName = sanitizeStorageFileName(file.name);
      const storagePath = `${user!.id}/${safeFileName}`;
      const { error: storageError } = await supabase.storage.from("reports").upload(storagePath, file);
      if (storageError) throw storageError;

      const { data: uploadRecord, error: uploadError } = await supabase
        .from("uploads")
        .insert({
          user_id: user!.id,
          entity_id: entityId,
          file_name: file.name,
          storage_path: storagePath,
          month: parseInt(month),
          year: parseInt(year),
          transaction_count: finalParsed.length,
        })
        .select()
        .single();
      if (uploadError) throw uploadError;

      const BATCH_SIZE = 500;
      for (let i = 0; i < finalParsed.length; i += BATCH_SIZE) {
        const batch = finalParsed.slice(i, i + BATCH_SIZE).map((row) => ({
          user_id: user!.id,
          entity_id: entityId,
          upload_id: uploadRecord.id,
          date: row.date,
          source_recipient: row.sourceRecipient,
          value: row.value,
          category_id: mapByName.get(row.sourceRecipient.trim()) ?? null,
          raw_data: row.rawData as unknown as Json,
        }));
        const { error: txError } = await supabase.from("transactions").insert(batch);
        if (txError) throw txError;
      }

      const skipped = fileDuplicates + dbDuplicates;
      toast.success(
        skipped > 0
          ? `${finalParsed.length} תנועות יובאו, ${skipped} כפילויות דולגו`
          : `${finalParsed.length} תנועות יובאו בהצלחה`
      );

      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recipient_categories"] });
      setOpen(false);
      resetDialog();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעלאה");
    } finally {
      setUploading(false);
    }
  }, [file, entityId, month, year, entities, user, queryClient]);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Upload className="ml-2 h-4 w-4" />
            העלה דוח
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>העלאת דוח חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>ישות פיננסית</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger>
                <SelectValue placeholder="בחר ישות..." />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>חודש</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue placeholder="בחר חודש..." /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>שנה</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>קובץ (CSV / XLSX)</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => document.getElementById("upload-dialog-file-input")?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
              ) : (
                <div>
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">לחץ לבחירת קובץ</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">CSV, XLSX</p>
                </div>
              )}
            </div>
            <input
              id="upload-dialog-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
          <Button onClick={handleUpload} disabled={uploading || !file || !entityId || !month}>
            {uploading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            {uploading ? "מעלה..." : "העלה ועבד"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
