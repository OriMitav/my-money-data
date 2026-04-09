import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Edit, CreditCard } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const fmt = (n: number) => n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

interface Debt {
  id: string;
  user_id: string;
  name: string;
  total_amount: number;
  debtor_name: string;
  is_zero_interest: boolean;
  fixed_payment_amount: number;
}

interface DebtEntry {
  id: string;
  debt_id: string;
  year: number;
  month: number;
  interest_paid: number;
  principal_paid: number;
  total_paid: number;
  remaining_balance: number;
}

export default function DebtsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [debtDialogOpen, setDebtDialogOpen] = useState(false);
  const [editDebtId, setEditDebtId] = useState<string | null>(null);
  const [debtForm, setDebtForm] = useState({ name: "", total_amount: 0, debtor_name: "", is_zero_interest: false, fixed_payment_amount: 0 });
  const [selectedDebt, setSelectedDebt] = useState<string | null>(null);
  const [debtEntryDialogOpen, setDebtEntryDialogOpen] = useState(false);
  const [editDebtEntryId, setEditDebtEntryId] = useState<string | null>(null);
  const [debtEntryForm, setDebtEntryForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, interest_paid: 0, total_paid: 0, remaining_balance: 0 });

  const { data: debts = [] } = useQuery({
    queryKey: ["debts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("debts").select("*").order("created_at");
      if (error) throw error;
      return data as unknown as Debt[];
    },
  });

  const { data: debtEntries = [] } = useQuery({
    queryKey: ["debt_entries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("debt_entries").select("*").order("year").order("month");
      if (error) throw error;
      return data as unknown as DebtEntry[];
    },
  });

  const createDebt = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("debts").insert({
        user_id: user!.id,
        name: debtForm.name,
        total_amount: debtForm.total_amount,
        debtor_name: debtForm.debtor_name,
        is_zero_interest: debtForm.is_zero_interest,
        fixed_payment_amount: debtForm.fixed_payment_amount,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      setDebtDialogOpen(false);
      setEditDebtId(null);
      toast.success("חוב נוסף");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDebt = useMutation({
    mutationFn: async () => {
      if (!editDebtId) return;
      const { error } = await supabase.from("debts").update({
        name: debtForm.name,
        total_amount: debtForm.total_amount,
        debtor_name: debtForm.debtor_name,
        is_zero_interest: debtForm.is_zero_interest,
        fixed_payment_amount: debtForm.fixed_payment_amount,
      } as any).eq("id", editDebtId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      setDebtDialogOpen(false);
      setEditDebtId(null);
      toast.success("חוב עודכן");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDebt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      qc.invalidateQueries({ queryKey: ["debt_entries"] });
      toast.success("חוב נמחק");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertDebtEntry = useMutation({
    mutationFn: async () => {
      if (!selectedDebt) return;
      const principalPaid = debtEntryForm.total_paid - debtEntryForm.interest_paid;
      const payload: any = {
        user_id: user!.id,
        debt_id: selectedDebt,
        year: debtEntryForm.year,
        month: debtEntryForm.month,
        interest_paid: debtEntryForm.interest_paid,
        principal_paid: principalPaid,
        total_paid: debtEntryForm.total_paid,
        remaining_balance: debtEntryForm.remaining_balance,
      };
      if (editDebtEntryId) {
        const { error } = await supabase.from("debt_entries").update(payload).eq("id", editDebtEntryId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("debt_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debt_entries"] });
      setDebtEntryDialogOpen(false);
      setEditDebtEntryId(null);
      toast.success("נשמר");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getDebtEntriesSorted = (debtId: string) =>
    debtEntries.filter(e => e.debt_id === debtId).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  const getDebtRemainingBalance = (debtId: string) => {
    const sorted = getDebtEntriesSorted(debtId);
    return sorted.length > 0 ? Number(sorted[sorted.length - 1].remaining_balance) : Number(debts.find(d => d.id === debtId)?.total_amount || 0);
  };

  const totalDebtBalance = debts.reduce((s, d) => s + getDebtRemainingBalance(d.id), 0);

  const openNewDebtEntry = (debtId: string) => {
    const debt = debts.find(d => d.id === debtId);
    setSelectedDebt(debtId);
    setEditDebtEntryId(null);
    const lastEntries = getDebtEntriesSorted(debtId);
    const lastBalance = lastEntries.length > 0 ? Number(lastEntries[lastEntries.length - 1].remaining_balance) : Number(debt?.total_amount || 0);
    if (debt?.is_zero_interest && debt.fixed_payment_amount > 0) {
      const payment = Math.min(Number(debt.fixed_payment_amount), lastBalance);
      setDebtEntryForm({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, interest_paid: 0, total_paid: payment, remaining_balance: lastBalance - payment });
    } else {
      setDebtEntryForm({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, interest_paid: 0, total_paid: 0, remaining_balance: lastBalance });
    }
    setDebtEntryDialogOpen(true);
  };

  const openEditDebtEntry = (entry: DebtEntry) => {
    setSelectedDebt(entry.debt_id);
    setEditDebtEntryId(entry.id);
    setDebtEntryForm({ year: entry.year, month: entry.month, interest_paid: Number(entry.interest_paid), total_paid: Number(entry.total_paid), remaining_balance: Number(entry.remaining_balance) });
    setDebtEntryDialogOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">חובות</h1>

      {/* Debt Summary */}
      <Card className="bg-destructive/5 border-destructive/20">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground mb-1">סך יתרת חובות</p>
          <p className="text-2xl sm:text-3xl font-bold text-destructive">{fmt(totalDebtBalance)}</p>
        </CardContent>
      </Card>

      {/* Debts summary table */}
      {debts.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg">סיכום חובות</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">שם החוב</TableHead>
                  <TableHead className="text-right">למי</TableHead>
                  <TableHead className="text-right">סכום מקורי</TableHead>
                  <TableHead className="text-right">יתרה</TableHead>
                  <TableHead className="text-right">סוג</TableHead>
                  <TableHead className="text-center">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debts.map(debt => {
                  const remaining = getDebtRemainingBalance(debt.id);
                  return (
                    <TableRow key={debt.id}>
                      <TableCell className="text-xs sm:text-sm font-medium">{debt.name}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{debt.debtor_name || "-"}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{fmt(Number(debt.total_amount))}</TableCell>
                      <TableCell className="text-xs sm:text-sm text-destructive font-medium">{fmt(remaining)}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{debt.is_zero_interest ? "0% ריבית" : "עם ריבית"}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                            setEditDebtId(debt.id);
                            setDebtForm({
                              name: debt.name, total_amount: Number(debt.total_amount), debtor_name: debt.debtor_name,
                              is_zero_interest: debt.is_zero_interest, fixed_payment_amount: Number(debt.fixed_payment_amount),
                            });
                            setDebtDialogOpen(true);
                          }}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteDebt.mutate(debt.id)}>
                            <Trash2 className="h-3 w-3" />
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

      <Button size="sm" onClick={() => {
        setEditDebtId(null);
        setDebtForm({ name: "", total_amount: 0, debtor_name: "", is_zero_interest: false, fixed_payment_amount: 0 });
        setDebtDialogOpen(true);
      }}>
        <Plus className="ml-1 h-4 w-4" /> הוסף חוב
      </Button>

      {/* Per-debt details */}
      {debts.length > 0 && (
        <Tabs value={selectedDebt && debts.some(d => d.id === selectedDebt) ? selectedDebt : debts[0]?.id || ""} onValueChange={setSelectedDebt} dir="rtl">
          <TabsList className="flex-wrap h-auto">
            {debts.map(d => (
              <TabsTrigger key={d.id} value={d.id} className="text-xs sm:text-sm">{d.name}</TabsTrigger>
            ))}
          </TabsList>
          {debts.map(debt => {
            const debtEntriesList = getDebtEntriesSorted(debt.id);
            const displayEntries = [...debtEntriesList].reverse();
            return (
              <TabsContent key={debt.id} value={debt.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{debt.name}</h3>
                  <Button size="sm" onClick={() => openNewDebtEntry(debt.id)}>
                    <Plus className="ml-1 h-4 w-4" /> הוסף תשלום
                  </Button>
                </div>

                <Card className="bg-destructive/5 border-destructive/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-1">יתרת חוב</p>
                    <p className="text-xl sm:text-2xl font-bold text-destructive">{fmt(getDebtRemainingBalance(debt.id))}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap text-right">חודש</TableHead>
                          <TableHead className="whitespace-nowrap text-right">שולם ריבית</TableHead>
                          <TableHead className="whitespace-nowrap text-right">שולם מהקרן</TableHead>
                          <TableHead className="whitespace-nowrap text-right">סה״כ שולם</TableHead>
                          <TableHead className="whitespace-nowrap text-right">יתרה</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {debtEntriesList.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              אין תשלומים עדיין
                            </TableCell>
                          </TableRow>
                        ) : displayEntries.map(entry => (
                          <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditDebtEntry(entry)}>
                            <TableCell className="text-xs sm:text-sm whitespace-nowrap">{MONTHS[entry.month - 1]} {entry.year}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.interest_paid))}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.principal_paid))}</TableCell>
                            <TableCell className="text-xs sm:text-sm font-medium">{fmt(Number(entry.total_paid))}</TableCell>
                            <TableCell className="text-xs sm:text-sm text-destructive font-medium">{fmt(Number(entry.remaining_balance))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {debts.length === 0 && (
        <Card>
          <CardContent className="p-8 sm:p-12 text-center">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין חובות</h3>
            <p className="text-muted-foreground text-sm">הוסף חוב ראשון כדי להתחיל</p>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Debt Dialog */}
      <Dialog open={debtDialogOpen} onOpenChange={setDebtDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw]">
          <DialogHeader><DialogTitle>{editDebtId ? "עריכת חוב" : "הוסף חוב"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם החוב</Label>
              <Input value={debtForm.name} onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>סכום החוב</Label>
              <Input type="number" value={debtForm.total_amount} onChange={(e) => setDebtForm({ ...debtForm, total_amount: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>עבור מי</Label>
              <Input value={debtForm.debtor_name} onChange={(e) => setDebtForm({ ...debtForm, debtor_name: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={debtForm.is_zero_interest} onCheckedChange={(v) => setDebtForm({ ...debtForm, is_zero_interest: v })} />
              <Label>0% ריבית - תשלום קבוע</Label>
            </div>
            {debtForm.is_zero_interest && (
              <div className="space-y-2">
                <Label>סכום תשלום קבוע</Label>
                <Input type="number" value={debtForm.fixed_payment_amount} onChange={(e) => setDebtForm({ ...debtForm, fixed_payment_amount: Number(e.target.value) })} />
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setDebtDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => editDebtId ? updateDebt.mutate() : createDebt.mutate()} disabled={createDebt.isPending || updateDebt.isPending}>
              {editDebtId ? "עדכן" : "צור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Debt Entry Dialog */}
      <Dialog open={debtEntryDialogOpen} onOpenChange={setDebtEntryDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw]">
          <DialogHeader><DialogTitle>{editDebtEntryId ? "עריכת תשלום" : "הוסף תשלום"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שנה</Label>
                <Input type="number" value={debtEntryForm.year} onChange={(e) => setDebtEntryForm({ ...debtEntryForm, year: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>חודש</Label>
                <Select value={String(debtEntryForm.month)} onValueChange={(v) => setDebtEntryForm({ ...debtEntryForm, month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>שולם ריבית</Label>
              <Input type="number" step="0.01" value={debtEntryForm.interest_paid} onChange={(e) => setDebtEntryForm({ ...debtEntryForm, interest_paid: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>סה״כ שולם</Label>
              <Input type="number" step="0.01" value={debtEntryForm.total_paid} onChange={(e) => setDebtEntryForm({ ...debtEntryForm, total_paid: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>יתרה</Label>
              <Input type="number" step="0.01" value={debtEntryForm.remaining_balance} onChange={(e) => setDebtEntryForm({ ...debtEntryForm, remaining_balance: Number(e.target.value) })} />
            </div>
            <p className="text-xs text-muted-foreground">שולם מהקרן: {fmt(debtEntryForm.total_paid - debtEntryForm.interest_paid)}</p>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setDebtEntryDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => upsertDebtEntry.mutate()} disabled={upsertDebtEntry.isPending}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
