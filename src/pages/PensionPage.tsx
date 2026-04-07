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
import { Plus, Trash2, PiggyBank, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

interface PensionFund {
  id: string;
  user_id: string;
  name: string;
  employer: string;
  fund_name: string;
  accessible: boolean;
}

interface PensionEntry {
  id: string;
  fund_id: string;
  year: number;
  month: number;
  employer: string;
  fund_name: string;
  employee_contribution: number;
  employer_contribution: number;
  compensation: number;
  closing_balance: number;
}

interface PensionSettings {
  id: string;
  default_employer: string;
  default_fund_name: string;
  deposit_fee_pct: number;
  accumulation_fee_pct: number;
}

const fmt = (n: number) => n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

export default function PensionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState("summary");
  const [selectedFund, setSelectedFund] = useState<string | null>(null);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [fundForm, setFundForm] = useState({ name: "", employer: "", fund_name: "" });
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({
    year: new Date().getFullYear(), month: new Date().getMonth() + 1,
    employer: "", fund_name: "",
    employee: 0, employerC: 0, compensation: 0, closing: 0,
  });

  const { data: funds = [] } = useQuery({
    queryKey: ["pension_funds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pension_funds").select("*").order("created_at");
      if (error) throw error;
      return data as PensionFund[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["pension_entries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pension_entries").select("*").order("year").order("month");
      if (error) throw error;
      return data as PensionEntry[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["pension_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pension_settings").select("*").maybeSingle();
      if (error) throw error;
      return data as PensionSettings | null;
    },
  });

  const createFund = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pension_funds").insert({
        name: fundForm.name,
        employer: fundForm.employer,
        fund_name: fundForm.fund_name,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_funds"] });
      setFundDialogOpen(false);
      setFundForm({ name: "", employer: "", fund_name: "" });
      toast.success("קרן פנסיה נוספה");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFund = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pension_funds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_funds"] });
      qc.invalidateQueries({ queryKey: ["pension_entries"] });
      toast.success("קרן פנסיה נמחקה");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAccessible = useMutation({
    mutationFn: async ({ id, accessible }: { id: string; accessible: boolean }) => {
      const { error } = await supabase.from("pension_funds").update({ accessible }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pension_funds"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertEntry = useMutation({
    mutationFn: async () => {
      if (!selectedFund) return;
      const payload = {
        user_id: user!.id,
        fund_id: selectedFund,
        year: entryForm.year,
        month: entryForm.month,
        employer: entryForm.employer,
        fund_name: entryForm.fund_name,
        employee_contribution: entryForm.employee,
        employer_contribution: entryForm.employerC,
        compensation: entryForm.compensation,
        closing_balance: entryForm.closing,
      };
      if (editEntryId) {
        const { error } = await supabase.from("pension_entries").update(payload).eq("id", editEntryId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pension_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_entries"] });
      setEntryDialogOpen(false);
      setEditEntryId(null);
      toast.success("נשמר");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pension_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_entries"] });
      toast.success("נמחק");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNewEntry = (fundId: string) => {
    setSelectedFund(fundId);
    setEditEntryId(null);
    setEntryForm({
      year: new Date().getFullYear(), month: new Date().getMonth() + 1,
      employer: settings?.default_employer || "",
      fund_name: settings?.default_fund_name || "",
      employee: 0, employerC: 0, compensation: 0, closing: 0,
    });
    setEntryDialogOpen(true);
  };

  const openEditEntry = (entry: PensionEntry) => {
    setSelectedFund(entry.fund_id);
    setEditEntryId(entry.id);
    setEntryForm({
      year: entry.year, month: entry.month,
      employer: entry.employer, fund_name: entry.fund_name,
      employee: Number(entry.employee_contribution),
      employerC: Number(entry.employer_contribution),
      compensation: Number(entry.compensation),
      closing: Number(entry.closing_balance),
    });
    setEntryDialogOpen(true);
  };

  // Calculations helpers
  const getEntriesSorted = (fundId: string) =>
    entries.filter(e => e.fund_id === fundId).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  const calcManagementFees = (entry: PensionEntry, prevBalance: number) => {
    const depositPct = settings?.deposit_fee_pct || 0;
    const accumPct = settings?.accumulation_fee_pct || 0;
    const totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution) + Number(entry.compensation);
    return (depositPct / 100) * totalDeposit + (accumPct / 100 / 12) * prevBalance;
  };

  const calcMonthlyProfit = (entry: PensionEntry, prevBalance: number, fees: number) => {
    const totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution) + Number(entry.compensation);
    return Number(entry.closing_balance) - (prevBalance + totalDeposit - fees);
  };

  // Summary calculations
  const getLatestBalance = (fundId: string) => {
    const sorted = getEntriesSorted(fundId);
    return sorted.length > 0 ? Number(sorted[sorted.length - 1].closing_balance) : 0;
  };

  const totalAccessible = funds.filter(f => f.accessible).reduce((s, f) => s + getLatestBalance(f.id), 0);
  const grandTotal = funds.reduce((s, f) => s + getLatestBalance(f.id), 0);

  const activeFundTab = selectedFund || funds[0]?.id || "";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">פנסיה וחסכונות</h1>

      <Tabs value={mainTab} onValueChange={setMainTab} dir="rtl">
        <TabsList>
          <TabsTrigger value="summary">סיכום</TabsTrigger>
          <TabsTrigger value="pensions">פנסיות</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Unlock className="h-4 w-4" /> כסף נגיש
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{fmt(totalAccessible)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <PiggyBank className="h-4 w-4" /> סה״כ הון
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(grandTotal)}</p>
              </CardContent>
            </Card>
          </div>

          {funds.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <PiggyBank className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="font-semibold text-lg mb-1">אין קרנות עדיין</h3>
                <p className="text-muted-foreground text-sm">עבור ללשונית "פנסיות" כדי להוסיף קרן</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">סיכום קרנות</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>שם הקרן</TableHead>
                      <TableHead>יתרה נוכחית</TableHead>
                      <TableHead className="text-center">נגישות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funds.map(fund => (
                      <TableRow key={fund.id}>
                        <TableCell className="font-medium">{fund.name}</TableCell>
                        <TableCell>{fmt(getLatestBalance(fund.id))}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            {fund.accessible ? (
                              <Unlock className="h-4 w-4 text-green-600" />
                            ) : (
                              <Lock className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Switch
                              checked={fund.accessible}
                              onCheckedChange={(v) => toggleAccessible.mutate({ id: fund.id, accessible: v })}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Pensions Tab */}
        <TabsContent value="pensions" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setFundDialogOpen(true)}>
              <Plus className="ml-1 h-4 w-4" /> הוסף קרן פנסיה
            </Button>
          </div>

          {funds.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <PiggyBank className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="font-semibold text-lg mb-1">אין קרנות עדיין</h3>
                <p className="text-muted-foreground text-sm">הוסף קרן פנסיה כדי להתחיל</p>
              </CardContent>
            </Card>
          ) : (
            <Tabs value={activeFundTab} onValueChange={setSelectedFund} dir="rtl">
              <TabsList className="flex-wrap h-auto">
                {funds.map(f => (
                  <TabsTrigger key={f.id} value={f.id}>{f.name}</TabsTrigger>
                ))}
              </TabsList>

              {funds.map(fund => {
                const fundEntries = getEntriesSorted(fund.id);

                return (
                  <TabsContent key={fund.id} value={fund.id} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">{fund.name}</h2>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => openNewEntry(fund.id)}>
                          <Plus className="ml-1 h-4 w-4" /> הוסף חודש
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteFund.mutate(fund.id)}>
                          <Trash2 className="ml-1 h-4 w-4" /> מחק קרן
                        </Button>
                      </div>
                    </div>

                    <Card>
                      <CardContent className="p-0 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>חודש</TableHead>
                              <TableHead>מעסיק</TableHead>
                              <TableHead>קרן הפנסיה</TableHead>
                              <TableHead>תגמולי עובד</TableHead>
                              <TableHead>תגמולי מעסיק</TableHead>
                              <TableHead>פיצויים</TableHead>
                              <TableHead>סה״כ הפקדה</TableHead>
                              <TableHead>דמי ניהול</TableHead>
                              <TableHead>רווח חודשי</TableHead>
                              <TableHead>יתרת סגירה</TableHead>
                              <TableHead className="w-16">פעולות</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fundEntries.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                                  אין נתונים עדיין. לחץ "הוסף חודש" כדי להתחיל.
                                </TableCell>
                              </TableRow>
                            ) : (
                              fundEntries.map((entry, idx) => {
                                const prevBalance = idx === 0 ? 0 : Number(fundEntries[idx - 1].closing_balance);
                                const totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution) + Number(entry.compensation);
                                const fees = calcManagementFees(entry, prevBalance);
                                const profit = calcMonthlyProfit(entry, prevBalance, fees);

                                return (
                                  <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditEntry(entry)}>
                                    <TableCell className="whitespace-nowrap font-medium">
                                      {MONTHS[entry.month - 1]} {entry.year}
                                    </TableCell>
                                    <TableCell className="text-sm">{entry.employer || "-"}</TableCell>
                                    <TableCell className="text-sm">{entry.fund_name || "-"}</TableCell>
                                    <TableCell className="text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>
                                    <TableCell className="text-sm">{fmt(Number(entry.employer_contribution))}</TableCell>
                                    <TableCell className="text-sm">{fmt(Number(entry.compensation))}</TableCell>
                                    <TableCell className="text-sm font-medium">{fmt(totalDeposit)}</TableCell>
                                    <TableCell className="text-sm">{fmt(fees)}</TableCell>
                                    <TableCell className={`text-sm font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {fmt(profit)}
                                    </TableCell>
                                    <TableCell className="text-sm font-bold">{fmt(Number(entry.closing_balance))}</TableCell>
                                    <TableCell>
                                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteEntry.mutate(entry.id); }}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Fund Dialog */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>הוסף קרן פנסיה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם הקרן</Label>
              <Input value={fundForm.name} onChange={(e) => setFundForm({ ...fundForm, name: e.target.value })} placeholder="לדוגמה: מגדל" />
            </div>
            <div className="space-y-2">
              <Label>מעסיק</Label>
              <Input value={fundForm.employer} onChange={(e) => setFundForm({ ...fundForm, employer: e.target.value })} placeholder="שם המעסיק" />
            </div>
            <div className="space-y-2">
              <Label>שם קרן הפנסיה</Label>
              <Input value={fundForm.fund_name} onChange={(e) => setFundForm({ ...fundForm, fund_name: e.target.value })} placeholder="לדוגמה: מגדל מקפת" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => { if (fundForm.name.trim()) createFund.mutate(); }} disabled={createFund.isPending}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editEntryId ? "עריכת נתונים" : "הוסף חודש"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שנה</Label>
                <Input type="number" value={entryForm.year} onChange={(e) => setEntryForm({ ...entryForm, year: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>חודש</Label>
                <Select value={String(entryForm.month)} onValueChange={(v) => setEntryForm({ ...entryForm, month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מעסיק</Label>
                <Input value={entryForm.employer} onChange={(e) => setEntryForm({ ...entryForm, employer: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>קרן הפנסיה</Label>
                <Input value={entryForm.fund_name} onChange={(e) => setEntryForm({ ...entryForm, fund_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>תגמולי עובד</Label>
                <Input type="number" value={entryForm.employee} onChange={(e) => setEntryForm({ ...entryForm, employee: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>תגמולי מעסיק</Label>
                <Input type="number" value={entryForm.employerC} onChange={(e) => setEntryForm({ ...entryForm, employerC: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>פיצויים</Label>
                <Input type="number" value={entryForm.compensation} onChange={(e) => setEntryForm({ ...entryForm, compensation: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>יתרת סגירה</Label>
              <Input type="number" value={entryForm.closing} onChange={(e) => setEntryForm({ ...entryForm, closing: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => upsertEntry.mutate()} disabled={upsertEntry.isPending}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
