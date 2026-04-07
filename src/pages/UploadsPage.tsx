import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Upload, Download, Trash2, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseCSV, parseXLSX, applyMapping } from "@/lib/fileParser";
import type { Json } from "@/integrations/supabase/types";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);

export default function UploadsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(String(currentYear));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: entities = [] } = useQuery({
    queryKey: ["financial_entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_entities")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: uploads = [], isLoading } = useQuery({
    queryKey: ["uploads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploads")
        .select("*, financial_entities(name, type)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (upload: { id: string; storage_path: string }) => {
      // Delete file from storage
      await supabase.storage.from("reports").remove([upload.storage_path]);
      // Delete upload record (cascade deletes transactions)
      const { error } = await supabase.from("uploads").delete().eq("id", upload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("הדוח נמחק בהצלחה");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDownload = async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("reports").download(storagePath);
    if (error) {
      toast.error("שגיאה בהורדת הקובץ");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = useCallback(async () => {
    if (!file || !entityId || !month || !year) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    setUploading(true);
    try {
      // Find entity and its mapping
      const entity = entities.find((e) => e.id === entityId);
      if (!entity) throw new Error("ישות לא נמצאה");

      const mapping = entity.column_mapping as unknown as {
        date: string;
        sourceRecipient: string;
        value: string;
      };
      if (!mapping?.date || !mapping?.sourceRecipient || !mapping?.value) {
        throw new Error("מיפוי העמודות של הישות אינו שלם");
      }

      // Parse file
      const isCSV = file.name.toLowerCase().endsWith(".csv");
      const rows = isCSV ? await parseCSV(file) : await parseXLSX(file);

      if (rows.length === 0) throw new Error("הקובץ ריק");

      // Apply mapping
      const parsed = applyMapping(rows, mapping);
      if (parsed.length === 0) throw new Error("לא נמצאו שורות תקינות אחרי עיבוד הקובץ");

      // Upload file to storage
      const storagePath = `${user!.id}/${Date.now()}_${file.name}`;
      const { error: storageError } = await supabase.storage
        .from("reports")
        .upload(storagePath, file);
      if (storageError) throw storageError;

      // Create upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from("uploads")
        .insert({
          user_id: user!.id,
          entity_id: entityId,
          file_name: file.name,
          storage_path: storagePath,
          month: parseInt(month),
          year: parseInt(year),
          transaction_count: parsed.length,
        })
        .select()
        .single();
      if (uploadError) throw uploadError;

      // Insert transactions in batches
      const BATCH_SIZE = 500;
      for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
        const batch = parsed.slice(i, i + BATCH_SIZE).map((row) => ({
          user_id: user!.id,
          entity_id: entityId,
          upload_id: uploadRecord.id,
          date: row.date,
          source_recipient: row.sourceRecipient,
          value: row.value,
          raw_data: row.rawData as unknown as Json,
        }));
        const { error: txError } = await supabase.from("transactions").insert(batch);
        if (txError) throw txError;
      }

      toast.success(`${parsed.length} תנועות יובאו בהצלחה`);
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setOpen(false);
      setFile(null);
      setEntityId("");
      setMonth("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעלאה");
    } finally {
      setUploading(false);
    }
  }, [file, entityId, month, year, entities, user, queryClient]);

  const resetDialog = () => {
    setFile(null);
    setEntityId("");
    setMonth("");
    setYear(String(currentYear));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">העלאת דוחות</h1>
          <p className="text-muted-foreground">העלה קבצי CSV/XLSX לייבוא תנועות</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="ml-2 h-4 w-4" />
              העלה דוח
            </Button>
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
                    <SelectTrigger>
                      <SelectValue placeholder="בחר חודש..." />
                    </SelectTrigger>
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => document.getElementById("file-input")?.click()}
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
                  id="file-input"
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
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">טוען...</CardContent></Card>
      ) : uploads.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין דוחות עדיין</h3>
            <p className="text-muted-foreground text-sm">העלה את הדוח הראשון שלך כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">הדוחות שלך</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם קובץ</TableHead>
                  <TableHead>ישות</TableHead>
                  <TableHead>תקופה</TableHead>
                  <TableHead>תנועות</TableHead>
                  <TableHead className="w-28">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((upload) => {
                  const entity = upload.financial_entities as unknown as { name: string; type: string } | null;
                  return (
                    <TableRow key={upload.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          {upload.file_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{entity?.name ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>{MONTHS[upload.month - 1]} {upload.year}</TableCell>
                      <TableCell>{upload.transaction_count}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(upload.storage_path, upload.file_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate({ id: upload.id, storage_path: upload.storage_path })}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}