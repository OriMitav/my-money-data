import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CashflowRow {
  id: string;
  user_id: string;
  property_id: string;
  entry_date: string;
  subject: string;
  amount: number;
  source: string;
  source_ref: string | null;
}

const fmtILS = (n: number) =>
  n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

export default function PropertyCashflowTab({ propertyId }: { propertyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [date, setDate] = useState<Date>(new Date());
  const [subject, setSubject] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["property_cashflow", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_cashflow")
        .select("*")
        .eq("property_id", propertyId)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data as CashflowRow[];
    },
    enabled: !!user,
  });

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    rows.forEach((r) => {
      const a = Number(r.amount) || 0;
      if (a >= 0) income += a; else expense += a;
    });
    return { income, expense: Math.abs(expense), balance: income + expense };
  }, [rows]);

  const subjectSuggestions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.subject && set.add(r.subject));
    return Array.from(set).sort();
  }, [rows]);

  const reset = () => {
    setDate(new Date());
    setSubject("");
    setAmount("");
    setKind("expense");
    setEditingId(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amt = Math.abs(Number(amount));
      if (!amt || !subject.trim()) throw new Error("מלא נושא וסכום");
      const signed = kind === "expense" ? -amt : amt;
      if (editingId) {
        const { error } = await supabase
          .from("property_cashflow")
          .update({
            entry_date: format(date, "yyyy-MM-dd"),
            subject: subject.trim(),
            amount: signed,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("property_cashflow").insert({
          user_id: user!.id,
          property_id: propertyId,
          entry_date: format(date, "yyyy-MM-dd"),
          subject: subject.trim(),
          amount: signed,
          source: "manual",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_cashflow", propertyId] });
      toast.success(editingId ? "עודכן" : "נוסף");
      reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("property_cashflow").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_cashflow", propertyId] });
      toast.success("נמחק");
    },
  });

  const startEdit = (r: CashflowRow) => {
    setEditingId(r.id);
    setDate(new Date(r.entry_date));
    setSubject(r.subject);
    setAmount(String(Math.abs(Number(r.amount))));
    setKind(Number(r.amount) >= 0 ? "income" : "expense");
  };

  return (
    <div dir="rtl" className="space-y-4">
      {/* Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{editingId ? "עריכת תנועה" : "הוספת תנועה"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">תאריך</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-right font-normal">
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {format(date, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="min-h-[340px] min-w-[280px]">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => d && setDate(d)}
                      initialFocus
                      dir="rtl"
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">נושא</Label>
              <Input
                list={`subject-suggestions-${propertyId}`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="למשל: שכירות, ארנונה..."
              />
              <datalist id={`subject-suggestions-${propertyId}`}>
                {subjectSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">סכום</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">סוג</Label>
              <ToggleGroup
                type="single"
                value={kind}
                onValueChange={(v) => v && setKind(v as "income" | "expense")}
                className="justify-start"
              >
                <ToggleGroupItem value="income" className="data-[state=on]:bg-green-500/15 data-[state=on]:text-green-600">
                  הכנסה
                </ToggleGroupItem>
                <ToggleGroupItem value="expense" className="data-[state=on]:bg-red-500/15 data-[state=on]:text-red-600">
                  הוצאה
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <><Plus className="h-4 w-4 ml-1" />{editingId ? "עדכן" : "הוסף"}</>
                )}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={reset}>ביטול</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">תנועות</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">אין תנועות עדיין</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">נושא</TableHead>
                    <TableHead className="text-center">סכום</TableHead>
                    <TableHead className="text-center">מקור</TableHead>
                    <TableHead className="text-center w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const a = Number(r.amount) || 0;
                    const isIncome = a >= 0;
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => startEdit(r)}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {format(new Date(r.entry_date), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right">{r.subject}</TableCell>
                        <TableCell className={cn("text-center font-semibold whitespace-nowrap", isIncome ? "text-green-600" : "text-red-600")}>
                          {fmtILS(a)}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {r.source === "mortgage" ? "משכנתא" : "ידני"}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => { if (confirm("למחוק תנועה?")) deleteMutation.mutate(r.id); }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
