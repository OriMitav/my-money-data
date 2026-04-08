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
import { Plus, Trash2, PiggyBank, Lock, Unlock, Settings2 } from "lucide-react";
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
  deposit_fee_pct: number;
  accumulation_fee_pct: number;
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
  management_fees: number;
  monthly_growth: number;
  monthly_return: number;
}

const fmt = (n: number) => n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const pct = (n: number) => (n * 100).toFixed(2) + "%";

export default function PensionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState("summary");
  const [selectedFund, setSelectedFund] = useState<string | null>(null);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [fundName, setFundName] = useState("");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsFundId, setSettingsFundId] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState({ employer: "", fund_name: "", deposit_fee_pct: 0, accumulation_fee_pct: 0 });
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({
    year: new Date().getFullYear(), month: new Date().getMonth() + 1,
    employer: "", fund_name: "",
    employee: 0, employerC: 0, compensation: 0, closing: 0,
    management_fees: 0,
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

  const createFund = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pension_funds").insert({
        name: fundName, user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_funds"] });
      setFundDialogOpen(false);
      setFundName("");
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

  const saveFundSettings = useMutation({
    mutationFn: async () => {
      if (!settingsFundId) return;
      const { error } = await supabase.from("pension_funds").update({
        employer: settingsForm.employer,
        fund_name: settingsForm.fund_name,
        deposit_fee_pct: settingsForm.deposit_fee_pct,
        accumulation_fee_pct: settingsForm.accumulation_fee_pct,
      }).eq("id", settingsFundId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_funds"] });
      setSettingsDialogOpen(false);
      toast.success("הגדרות הקרן נשמרו");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertEntry = useMutation({
    mutationFn: async () => {
      if (!selectedFund) return;
      const fund = funds.find(f => f.id === selectedFund);
      const fundEntries = getEntriesSorted(selectedFund);

      // Calculate management fees
      const prevEntry = fundEntries.find((e, i) => {
        const next = fundEntries[i + 1];
        if (editEntryId) return next?.id === editEntryId || (!next && e.id !== editEntryId);
        return i === fundEntries.length - 1;
      });
      const prevBalance = editEntryId
        ? (fundEntries.findIndex(e => e.id === editEntryId) > 0
          ? Number(fundEntries[fundEntries.findIndex(e => e.id === editEntryId) - 1].closing_balance)
          : 0)
        : (fundEntries.length > 0 ? Number(fundEntries[fundEntries.length - 1].closing_balance) : 0);

      const totalDeposit = entryForm.employee + entryForm.employerC + entryForm.compensation;
      const depositFee = (fund?.deposit_fee_pct || 0) / 100 * totalDeposit;
      const accumFee = (fund?.accumulation_fee_pct || 0) / 100 / 12 * prevBalance;
      const calcFees = entryForm.management_fees || (depositFee + accumFee);
      const monthlyGrowth = entryForm.closing - prevBalance;
      const profit = entryForm.closing - (prevBalance + totalDeposit - calcFees);
      const monthlyReturn = prevBalance > 0 ? profit / prevBalance : 0;

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
        management_fees: calcFees,
        monthly_growth: monthlyGrowth,
        monthly_return: monthlyReturn,
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

  const openFundSettings = (fund: PensionFund) => {
    setSettingsFundId(fund.id);
    setSettingsForm({
      employer: fund.employer,
      fund_name: fund.fund_name,
      deposit_fee_pct: Number(fund.deposit_fee_pct),
      accumulation_fee_pct: Number(fund.accumulation_fee_pct),
    });
    setSettingsDialogOpen(true);
  };

  const openNewEntry = (fundId: string) => {
    const fund = funds.find(f => f.id === fundId);
    setSelectedFund(fundId);
    setEditEntryId(null);
    setEntryForm({
      year: new Date().getFullYear(), month: new Date().getMonth() + 1,
      employer: fund?.employer || "",
      fund_name: fund?.fund_name || "",
      employee: 0, employerC: 0, compensation: 0, closing: 0,
      management_fees: 0,
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
      management_fees: Number(entry.management_fees),
    });
    setEntryDialogOpen(true);
  };

  const getEntriesSorted = (fundId: string) =>
    entries.filter(e => e.fund_id === fundId).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  const getLatestBalance = (fundId: string) => {
    const sorted = getEntriesSorted(fundId);
    return sorted.length > 0 ? Number(sorted[sorted.length - 1].closing_balance) : 0;
  };

  // Return summaries for a fund
  const getReturnSummary = (fundId: string) => {
    const sorted = getEntriesSorted(fundId);
    if (sorted.length < 2) return { y1: null, y3: null, y5: null };

    const now = sorted[sorted.length - 1];
    const nowDate = new Date(now.year, now.month - 1);

    const findEntryAt = (monthsBack: number) => {
      const target = new Date(nowDate);
      target.setMonth(target.getMonth() - monthsBack);
      return sorted.find(e => e.year === target.getFullYear() && e.month === target.getMonth() + 1);
    };

    const calcReturn = (monthsBack: number) => {
      const start = findEntryAt(monthsBack);
      if (!start) return null;
      const startBal = Number(start.closing_balance);
      if (startBal <= 0) return null;
      const endBal = Number(now.closing_balance);
      // Sum deposits between start and end
      const relevantEntries = sorted.filter(e => {
        const eDate = new Date(e.year, e.month - 1);
        const sDate = new Date(start.year, start.month - 1);
        return eDate > sDate && eDate <= nowDate;
      });
      const totalDeposits = relevantEntries.reduce((s, e) =>
        s + Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation), 0);
      const totalFees = relevantEntries.reduce((s, e) => s + Number(e.management_fees), 0);
      const profit = endBal - startBal - totalDeposits + totalFees;
      return profit / startBal;
    };

    return {
      y1: calcReturn(12),
      y3: calcReturn(36),
      y5: calcReturn(60),
    };
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
                const returnSummary = getReturnSummary(fund.id);

                return (
                  <TabsContent key={fund.id} value={fund.id} className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h2 className="text-lg font-semibold">{fund.name}</h2>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openFundSettings(fund)}>
                          <Settings2 className="ml-1 h-4 w-4" /> הגדרות קרן
                        </Button>
                        <Button size="sm" onClick={() => openNewEntry(fund.id)}>
                          <Plus className="ml-1 h-4 w-4" /> הוסף חודש
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteFund.mutate(fund.id)}>
                          <Trash2 className="ml-1 h-4 w-4" /> מחק קרן
                        </Button>
                      </div>
                    </div>

                    {/* Return Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: "תשואה שנה אחרונה", val: returnSummary.y1 },
                        { label: "תשואה 3 שנים", val: returnSummary.y3 },
                        { label: "תשואה 5 שנים", val: returnSummary.y5 },
                      ].map(({ label, val }) => (
                        <Card key={label}>
                          <CardContent className="p-4 text-center">
                            <p className="text-xs text-muted-foreground mb-1">{label}</p>
                            {val !== null ? (
                              <p className={`text-lg font-bold ${val >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {pct(val)}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">אין מספיק נתונים</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
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
                              <TableHead>גידול חודשי</TableHead>
                              <TableHead>תשואה חודשית</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fundEntries.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                                  אין נתונים עדיין. לחץ "הוסף חודש" כדי להתחיל.
                                </TableCell>
                              </TableRow>
                            ) : (
                              fundEntries.map((entry, idx) => {
                                const prevBalance = idx === 0 ? 0 : Number(fundEntries[idx - 1].closing_balance);
                                const totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution) + Number(entry.compensation);
                                const fees = Number(entry.management_fees);
                                const profit = Number(entry.closing_balance) - (prevBalance + totalDeposit - fees);
                                const monthlyReturn = Number(entry.monthly_return);
                                const monthlyGrowth = Number(entry.monthly_growth) || (Number(entry.closing_balance) - prevBalance);

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
                                    <TableCell className={`text-sm ${monthlyGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {fmt(monthlyGrowth)}
                                    </TableCell>
                                    <TableCell className={`text-sm font-medium ${monthlyReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {pct(monthlyReturn)}
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

      {/* Add Fund Dialog - only name */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>הוסף קרן פנסיה</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם הקרן</Label>
              <Input value={fundName} onChange={(e) => setFundName(e.target.value)} placeholder="לדוגמה: מגדל" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => { if (fundName.trim()) createFund.mutate(); }} disabled={createFund.isPending}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fund Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>הגדרות קרן</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>מעסיק</Label>
                <Input value={settingsForm.employer} onChange={(e) => setSettingsForm({ ...settingsForm, employer: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>שם קרן הפנסיה</Label>
                <Input value={settingsForm.fund_name} onChange={(e) => setSettingsForm({ ...settingsForm, fund_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>דמי ניהול מהפקדה (%)</Label>
                <Input type="number" step="0.01" value={settingsForm.deposit_fee_pct} onChange={(e) => setSettingsForm({ ...settingsForm, deposit_fee_pct: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>דמי ניהול מצבירה (%)</Label>
                <Input type="number" step="0.01" value={settingsForm.accumulation_fee_pct} onChange={(e) => setSettingsForm({ ...settingsForm, accumulation_fee_pct: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => saveFundSettings.mutate()} disabled={saveFundSettings.isPending}>שמור</Button>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>דמי ניהול וביטוחים</Label>
                <Input type="number" step="0.01" value={entryForm.management_fees} onChange={(e) => setEntryForm({ ...entryForm, management_fees: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>יתרת סגירה</Label>
                <Input type="number" value={entryForm.closing} onChange={(e) => setEntryForm({ ...entryForm, closing: Number(e.target.value) })} />
              </div>
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
