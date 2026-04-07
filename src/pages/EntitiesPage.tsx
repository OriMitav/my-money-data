import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Pencil, Trash2, Building2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { ColumnMapping } from "@/lib/fileParser";

type ValueMode = "single" | "dual";

interface EntityForm {
  name: string;
  type: "bank" | "credit_card";
  valueMode: ValueMode;
  columnMapping: ColumnMapping;
}

const emptyForm: EntityForm = {
  name: "",
  type: "bank",
  valueMode: "single",
  columnMapping: { date: "", sourceRecipient: "", value: "" },
};

export default function EntitiesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EntityForm>(emptyForm);

  const { data: entities = [], isLoading } = useQuery({
    queryKey: ["financial_entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_entities")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (entity: EntityForm & { id?: string }) => {
      const mapping: ColumnMapping = {
        date: entity.columnMapping.date,
        sourceRecipient: entity.columnMapping.sourceRecipient,
      };
      if (entity.valueMode === "dual") {
        mapping.credit = entity.columnMapping.credit || "";
        mapping.debit = entity.columnMapping.debit || "";
      } else {
        mapping.value = entity.columnMapping.value || "";
      }

      const payload = {
        name: entity.name,
        type: entity.type,
        column_mapping: mapping as unknown as Json,
        user_id: user!.id,
      };
      if (entity.id) {
        const { error } = await supabase
          .from("financial_entities")
          .update(payload)
          .eq("id", entity.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_entities")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_entities"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
      toast.success(editId ? "הישות עודכנה" : "הישות נוצרה");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_entities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_entities"] });
      toast.success("הישות נמחקה");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (entity: typeof entities[0]) => {
    const mapping = entity.column_mapping as unknown as ColumnMapping;
    const valueMode: ValueMode = mapping?.credit || mapping?.debit ? "dual" : "single";
    setForm({
      name: entity.name,
      type: entity.type as "bank" | "credit_card",
      valueMode,
      columnMapping: mapping || emptyForm.columnMapping,
    });
    setEditId(entity.id);
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("שם הישות הוא שדה חובה");
    upsertMutation.mutate({ ...form, id: editId ?? undefined });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ישויות פיננסיות</h1>
          <p className="text-muted-foreground">ניהול חשבונות בנק וכרטיסי אשראי</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              הוסף ישות
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? "עריכת ישות" : "ישות חדשה"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>שם הישות</Label>
                <Input
                  placeholder="לדוגמה: בנק לאומי"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>סוג</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "bank" | "credit_card" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">בנק</SelectItem>
                    <SelectItem value="credit_card">כרטיס אשראי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-semibold">מיפוי עמודות</Label>
                <p className="text-xs text-muted-foreground">
                  מפה את שמות העמודות מקובץ ה-CSV/XLSX לשדות המערכת
                </p>
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">עמודת תאריך</Label>
                    <Input
                      placeholder='לדוגמה: תאריך'
                      value={form.columnMapping.date}
                      onChange={(e) => setForm({ ...form, columnMapping: { ...form.columnMapping, date: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">עמודת מקור/מוטב</Label>
                    <Input
                      placeholder='לדוגמה: תיאור'
                      value={form.columnMapping.sourceRecipient}
                      onChange={(e) => setForm({ ...form, columnMapping: { ...form.columnMapping, sourceRecipient: e.target.value } })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">סוג עמודת ערך</Label>
                    <RadioGroup
                      value={form.valueMode}
                      onValueChange={(v) => setForm({ ...form, valueMode: v as ValueMode })}
                      className="flex gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="single" id="val-single" />
                        <Label htmlFor="val-single" className="text-xs cursor-pointer">עמודה אחת (סכום)</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="dual" id="val-dual" />
                        <Label htmlFor="val-dual" className="text-xs cursor-pointer">שתי עמודות (זכות/חובה)</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {form.valueMode === "single" ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">עמודת סכום</Label>
                      <Input
                        placeholder='לדוגמה: סכום'
                        value={form.columnMapping.value || ""}
                        onChange={(e) => setForm({ ...form, columnMapping: { ...form.columnMapping, value: e.target.value } })}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">עמודת זכות (הכנסה)</Label>
                        <Input
                          placeholder='לדוגמה: זכות'
                          value={form.columnMapping.credit || ""}
                          onChange={(e) => setForm({ ...form, columnMapping: { ...form.columnMapping, credit: e.target.value } })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">עמודת חובה (הוצאה)</Label>
                        <Input
                          placeholder='לדוגמה: חובה'
                          value={form.columnMapping.debit || ""}
                          onChange={(e) => setForm({ ...form, columnMapping: { ...form.columnMapping, debit: e.target.value } })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
              <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
                {editId ? "עדכן" : "צור"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">טוען...</CardContent></Card>
      ) : entities.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין ישויות עדיין</h3>
            <p className="text-muted-foreground text-sm">הוסף את חשבון הבנק או כרטיס האשראי הראשון שלך</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">הישויות שלך</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>מיפוי עמודות</TableHead>
                  <TableHead className="w-24">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.map((entity) => {
                  const mapping = entity.column_mapping as unknown as ColumnMapping;
                  return (
                    <TableRow key={entity.id}>
                      <TableCell className="font-medium">{entity.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          {entity.type === "bank" ? <Building2 className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
                          {entity.type === "bank" ? "בנק" : "כרטיס אשראי"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {mapping?.date && <div>תאריך ← {mapping.date}</div>}
                          {mapping?.sourceRecipient && <div>מקור ← {mapping.sourceRecipient}</div>}
                          {mapping?.value && <div>סכום ← {mapping.value}</div>}
                          {mapping?.credit && <div>זכות ← {mapping.credit}</div>}
                          {mapping?.debit && <div>חובה ← {mapping.debit}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(entity)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(entity.id)}>
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
