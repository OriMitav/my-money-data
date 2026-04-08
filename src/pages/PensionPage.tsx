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
import { Plus, Trash2, PiggyBank, Lock, Unlock, Settings2, Baby, GraduationCap, TrendingUp, Layers } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

type FundType = "pension" | "child_savings" | "hishtalmut" | "self_trading" | "other";

interface PensionFund {
  id: string;
  user_id: string;
  name: string;
  employer: string;
  fund_name: string;
  accessible: boolean;
  deposit_fee_pct: number;
  accumulation_fee_pct: number;
  type: FundType;
  parent_matching: boolean;
  state_deposit_amount: number;
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

const TAB_CONFIG: { type: FundType; label: string; icon: React.ReactNode; createLabel: string }[] = [
  { type: "pension", label: "פנסיות", icon: <PiggyBank className="h-4 w-4" />, createLabel: "הוסף קרן פנסיה" },
  { type: "child_savings", label: "חיסכון לכל ילד", icon: <Baby className="h-4 w-4" />, createLabel: "הוסף קופת חיסכון" },
  { type: "hishtalmut", label: "קרן השתלמות", icon: <GraduationCap className="h-4 w-4" />, createLabel: "הוסף קרן השתלמות" },
  { type: "self_trading", label: "מסחר עצמי", icon: <TrendingUp className="h-4 w-4" />, createLabel: "הוסף תיק מסחר" },
  { type: "other", label: "קרנות נוספות", icon: <Layers className="h-4 w-4" />, createLabel: "הוסף קרן" },
];

export default function PensionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState("summary");
  const [selectedFund, setSelectedFund] = useState<string | null>(null);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [fundDialogType, setFundDialogType] = useState<FundType>("pension");
  const [fundName, setFundName] = useState("");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsFundId, setSettingsFundId] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    employer: "", fund_name: "", deposit_fee_pct: 0, accumulation_fee_pct: 0,
    parent_matching: false, state_deposit_amount: 0,
  });
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

  const getFundsByType = (type: FundType) => funds.filter(f => f.type === type);

  const createFund = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pension_funds").insert({
        name: fundName, user_id: user!.id, type: fundDialogType,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_funds"] });
      setFundDialogOpen(false);
      setFundName("");
      toast.success("קרן נוספה");
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
      toast.success("קרן נמחקה");
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
      const fund = funds.find(f => f.id === settingsFundId);
      const updatePayload: any = {};
      if (fund?.type === "pension") {
        updatePayload.employer = settingsForm.employer;
        updatePayload.fund_name = settingsForm.fund_name;
        updatePayload.deposit_fee_pct = settingsForm.deposit_fee_pct;
        updatePayload.accumulation_fee_pct = settingsForm.accumulation_fee_pct;
      } else if (fund?.type === "child_savings") {
        updatePayload.parent_matching = settingsForm.parent_matching;
        updatePayload.state_deposit_amount = settingsForm.state_deposit_amount;
      } else if (fund?.type === "hishtalmut") {
        updatePayload.employer = settingsForm.employer;
        updatePayload.fund_name = settingsForm.fund_name;
        updatePayload.deposit_fee_pct = settingsForm.deposit_fee_pct;
        updatePayload.accumulation_fee_pct = settingsForm.accumulation_fee_pct;
      }
      // self_trading and other have no special settings
      const { error } = await supabase.from("pension_funds").update(updatePayload).eq("id", settingsFundId);
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

      const prevBalance = editEntryId
        ? (fundEntries.findIndex(e => e.id === editEntryId) > 0
          ? Number(fundEntries[fundEntries.findIndex(e => e.id === editEntryId) - 1].closing_balance)
          : 0)
        : (fundEntries.length > 0 ? Number(fundEntries[fundEntries.length - 1].closing_balance) : 0);

      let totalDeposit = 0;
      if (fund?.type === "child_savings") {
        totalDeposit = entryForm.employee + entryForm.employerC; // deposit + parent match
      } else if (fund?.type === "other") {
        totalDeposit = entryForm.employee; // just deposit
      } else {
        totalDeposit = entryForm.employee + entryForm.employerC + entryForm.compensation;
      }

      let calcFees = entryForm.management_fees;
      if (!calcFees && fund?.type !== "child_savings" && fund?.type !== "other") {
        const depositFee = (fund?.deposit_fee_pct || 0) / 100 * totalDeposit;
        const accumFee = (fund?.accumulation_fee_pct || 0) / 100 / 12 * prevBalance;
        calcFees = depositFee + accumFee;
      }

      const monthlyGrowth = entryForm.closing - prevBalance;
      const profit = entryForm.closing - (prevBalance + totalDeposit - calcFees);
      const monthlyReturn = prevBalance > 0 ? profit / prevBalance : 0;

      const payload: any = {
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
      parent_matching: fund.parent_matching,
      state_deposit_amount: Number(fund.state_deposit_amount),
    });
    setSettingsDialogOpen(true);
  };

  const openNewEntry = (fundId: string) => {
    const fund = funds.find(f => f.id === fundId);
    setSelectedFund(fundId);
    setEditEntryId(null);
    const stateAmount = fund?.type === "child_savings" ? Number(fund.state_deposit_amount) : 0;
    const parentMatch = fund?.type === "child_savings" && fund.parent_matching ? stateAmount : 0;
    setEntryForm({
      year: new Date().getFullYear(), month: new Date().getMonth() + 1,
      employer: fund?.employer || "",
      fund_name: fund?.fund_name || "",
      employee: stateAmount || 0,
      employerC: parentMatch,
      compensation: 0, closing: 0,
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

  // Fixed: find closest entry to target date instead of exact match
  const getReturnSummary = (fundId: string) => {
    const sorted = getEntriesSorted(fundId);
    if (sorted.length < 2) return { y1: null, y3: null, y5: null, p1: null, p3: null, p5: null };

    const now = sorted[sorted.length - 1];
    const nowDate = new Date(now.year, now.month - 1);

    const findClosestEntry = (monthsBack: number) => {
      const target = new Date(nowDate);
      target.setMonth(target.getMonth() - monthsBack);
      const targetTime = target.getTime();
      let closest: PensionEntry | null = null;
      let closestDist = Infinity;
      for (const e of sorted) {
        const eDate = new Date(e.year, e.month - 1);
        if (eDate >= nowDate) continue;
        const dist = Math.abs(eDate.getTime() - targetTime);
        if (dist < closestDist) { closestDist = dist; closest = e; }
      }
      // Only accept if within 2 months of target
      if (closest && closestDist <= 62 * 24 * 60 * 60 * 1000) return closest;
      return null;
    };

    const calcReturn = (monthsBack: number) => {
      const start = findClosestEntry(monthsBack);
      if (!start) return { ret: null, profit: null };
      const startBal = Number(start.closing_balance);
      if (startBal <= 0) return { ret: null, profit: null };
      const endBal = Number(now.closing_balance);
      const sDate = new Date(start.year, start.month - 1);
      const relevantEntries = sorted.filter(e => {
        const eDate = new Date(e.year, e.month - 1);
        return eDate > sDate && eDate <= nowDate;
      });
      const totalDeposits = relevantEntries.reduce((s, e) =>
        s + Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation), 0);
      const totalFees = relevantEntries.reduce((s, e) => s + Number(e.management_fees), 0);
      const profit = endBal - startBal - totalDeposits + totalFees;
      return { ret: profit / startBal, profit };
    };

    const r1 = calcReturn(12);
    const r3 = calcReturn(36);
    const r5 = calcReturn(60);

    return {
      y1: r1.ret, y3: r3.ret, y5: r5.ret,
      p1: r1.profit, p3: r3.profit, p5: r5.profit,
    };
  };

  const openCreateDialog = (type: FundType) => {
    setFundDialogType(type);
    setFundName("");
    setFundDialogOpen(true);
  };

  const totalAccessible = funds.filter(f => f.accessible).reduce((s, f) => s + getLatestBalance(f.id), 0);
  const grandTotal = funds.reduce((s, f) => s + getLatestBalance(f.id), 0);

  const currentFundType = selectedFund ? funds.find(f => f.id === selectedFund)?.type : undefined;
  const settingsFund = settingsFundId ? funds.find(f => f.id === settingsFundId) : null;

  // Render return summary cards
  const renderReturnCards = (fundId: string) => {
    const rs = getReturnSummary(fundId);
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "תשואה שנה", val: rs.y1 },
          { label: "תשואה 3 שנים", val: rs.y3 },
          { label: "תשואה 5 שנים", val: rs.y5 },
          { label: "רווח שנה", val: rs.p1, isMoney: true },
          { label: "רווח 3 שנים", val: rs.p3, isMoney: true },
          { label: "רווח 5 שנים", val: rs.p5, isMoney: true },
        ].map(({ label, val, isMoney }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              {val !== null && val !== undefined ? (
                <p className={`text-sm font-bold ${val >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {isMoney ? fmt(val) : pct(val)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">אין נתונים</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  // Render fund tab content based on type
  const renderFundContent = (fund: PensionFund) => {
    const fundEntries = getEntriesSorted(fund.id);
    const showSettings = fund.type !== "self_trading" && fund.type !== "other";

    return (
      <TabsContent key={fund.id} value={fund.id} className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">{fund.name}</h2>
          <div className="flex gap-2 flex-wrap">
            {showSettings && (
              <Button size="sm" variant="outline" onClick={() => openFundSettings(fund)}>
                <Settings2 className="ml-1 h-4 w-4" /> הגדרות
              </Button>
            )}
            <Button size="sm" onClick={() => openNewEntry(fund.id)}>
              <Plus className="ml-1 h-4 w-4" /> הוסף חודש
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteFund.mutate(fund.id)}>
              <Trash2 className="ml-1 h-4 w-4" /> מחק
            </Button>
          </div>
        </div>

        {renderReturnCards(fund.id)}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>חודש</TableHead>
                  {fund.type === "pension" && <TableHead>מעסיק</TableHead>}
                  {fund.type === "pension" && <TableHead>קרן הפנסיה</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead>מעסיק</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead>קרן</TableHead>}
                  {fund.type === "pension" && <TableHead>תגמולי עובד</TableHead>}
                  {fund.type === "pension" && <TableHead>תגמולי מעסיק</TableHead>}
                  {fund.type === "pension" && <TableHead>פיצויים</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead>הפקדת עובד</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead>הפקדת מעסיק</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead>פיצויים</TableHead>}
                  {fund.type === "child_savings" && <TableHead>הפקדת מדינה</TableHead>}
                  {fund.type === "child_savings" && fund.parent_matching && <TableHead>הפקדת הורים</TableHead>}
                  {fund.type === "other" && <TableHead>הפקדה</TableHead>}
                  <TableHead>סה״כ הפקדה</TableHead>
                  {(fund.type === "pension" || fund.type === "hishtalmut") && <TableHead>דמי ניהול</TableHead>}
                  <TableHead>רווח חודשי</TableHead>
                  {fund.type === "other" ? <TableHead>שווי</TableHead> : <TableHead>יתרת סגירה</TableHead>}
                  <TableHead>תשואה חודשית</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fundEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center text-muted-foreground py-8">
                      אין נתונים עדיין. לחץ "הוסף חודש" כדי להתחיל.
                    </TableCell>
                  </TableRow>
                ) : (
                  fundEntries.map((entry, idx) => {
                    const prevBalance = idx === 0 ? 0 : Number(fundEntries[idx - 1].closing_balance);
                    let totalDeposit: number;
                    if (fund.type === "child_savings") {
                      totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution);
                    } else if (fund.type === "other") {
                      totalDeposit = Number(entry.employee_contribution);
                    } else {
                      totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution) + Number(entry.compensation);
                    }
                    const fees = Number(entry.management_fees);
                    const profit = Number(entry.closing_balance) - (prevBalance + totalDeposit - fees);
                    const monthlyReturn = Number(entry.monthly_return);

                    return (
                      <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditEntry(entry)}>
                        <TableCell className="whitespace-nowrap font-medium text-sm">
                          {MONTHS[entry.month - 1]} {entry.year}
                        </TableCell>
                        {fund.type === "pension" && <TableCell className="text-sm">{entry.employer || "-"}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-sm">{entry.fund_name || "-"}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-sm">{entry.employer || "-"}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-sm">{entry.fund_name || "-"}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-sm">{fmt(Number(entry.employer_contribution))}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-sm">{fmt(Number(entry.compensation))}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-sm">{fmt(Number(entry.employer_contribution))}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-sm">{fmt(Number(entry.compensation))}</TableCell>}
                        {fund.type === "child_savings" && <TableCell className="text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {fund.type === "child_savings" && fund.parent_matching && <TableCell className="text-sm">{fmt(Number(entry.employer_contribution))}</TableCell>}
                        {fund.type === "other" && <TableCell className="text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        <TableCell className="text-sm font-medium">{fmt(totalDeposit)}</TableCell>
                        {(fund.type === "pension" || fund.type === "hishtalmut") && <TableCell className="text-sm">{fmt(fees)}</TableCell>}
                        <TableCell className={`text-sm font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(profit)}
                        </TableCell>
                        <TableCell className="text-sm font-bold">{fmt(Number(entry.closing_balance))}</TableCell>
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
  };

  // Render a section for a fund type
  const renderTypeSection = (type: FundType) => {
    const typeFunds = getFundsByType(type);
    const config = TAB_CONFIG.find(t => t.type === type)!;

    return (
      <TabsContent value={type} className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => openCreateDialog(type)}>
            <Plus className="ml-1 h-4 w-4" /> {config.createLabel}
          </Button>
        </div>

        {type === "self_trading" && typeFunds.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold text-lg mb-1">מסחר עצמי</h3>
              <p className="text-muted-foreground text-sm">הוסף תיק מסחר כדי להתחיל לעקוב</p>
            </CardContent>
          </Card>
        )}

        {typeFunds.length === 0 && type !== "self_trading" ? (
          <Card>
            <CardContent className="p-12 text-center">
              {config.icon && <div className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4 flex items-center justify-center">{config.icon}</div>}
              <h3 className="font-semibold text-lg mb-1">אין קרנות עדיין</h3>
              <p className="text-muted-foreground text-sm">לחץ על "{config.createLabel}" כדי להתחיל</p>
            </CardContent>
          </Card>
        ) : typeFunds.length > 0 && (
          <Tabs value={selectedFund && typeFunds.some(f => f.id === selectedFund) ? selectedFund : typeFunds[0]?.id || ""} onValueChange={setSelectedFund} dir="rtl">
            <TabsList className="flex-wrap h-auto">
              {typeFunds.map(f => (
                <TabsTrigger key={f.id} value={f.id}>{f.name}</TabsTrigger>
              ))}
            </TabsList>
            {typeFunds.map(fund => renderFundContent(fund))}
          </Tabs>
        )}
      </TabsContent>
    );
  };

  // Entry dialog fields based on fund type
  const renderEntryFormFields = () => {
    const fund = selectedFund ? funds.find(f => f.id === selectedFund) : null;
    const type = fund?.type || "pension";

    return (
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

        {(type === "pension" || type === "hishtalmut") && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>מעסיק</Label>
              <Input value={entryForm.employer} onChange={(e) => setEntryForm({ ...entryForm, employer: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{type === "pension" ? "קרן הפנסיה" : "שם הקרן"}</Label>
              <Input value={entryForm.fund_name} onChange={(e) => setEntryForm({ ...entryForm, fund_name: e.target.value })} />
            </div>
          </div>
        )}

        {type === "pension" && (
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
        )}

        {type === "hishtalmut" && (
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>הפקדת עובד</Label>
              <Input type="number" value={entryForm.employee} onChange={(e) => setEntryForm({ ...entryForm, employee: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>הפקדת מעסיק</Label>
              <Input type="number" value={entryForm.employerC} onChange={(e) => setEntryForm({ ...entryForm, employerC: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>פיצויים</Label>
              <Input type="number" value={entryForm.compensation} onChange={(e) => setEntryForm({ ...entryForm, compensation: Number(e.target.value) })} />
            </div>
          </div>
        )}

        {type === "child_savings" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>הפקדת מדינה</Label>
              <Input type="number" value={entryForm.employee} onChange={(e) => {
                const val = Number(e.target.value);
                const parentMatch = fund?.parent_matching ? val : entryForm.employerC;
                setEntryForm({ ...entryForm, employee: val, employerC: parentMatch });
              }} />
            </div>
            {fund?.parent_matching && (
              <div className="space-y-2">
                <Label>הפקדת הורים</Label>
                <Input type="number" value={entryForm.employerC} onChange={(e) => setEntryForm({ ...entryForm, employerC: Number(e.target.value) })} />
              </div>
            )}
          </div>
        )}

        {type === "other" && (
          <div className="space-y-2">
            <Label>הפקדה</Label>
            <Input type="number" value={entryForm.employee} onChange={(e) => setEntryForm({ ...entryForm, employee: Number(e.target.value) })} />
          </div>
        )}

        {(type === "pension" || type === "hishtalmut") && (
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
        )}

        {(type === "child_savings" || type === "self_trading" || type === "other") && (
          <div className="space-y-2">
            <Label>{type === "other" ? "שווי" : "יתרת סגירה"}</Label>
            <Input type="number" value={entryForm.closing} onChange={(e) => setEntryForm({ ...entryForm, closing: Number(e.target.value) })} />
          </div>
        )}
      </div>
    );
  };

  // Settings dialog content based on fund type
  const renderSettingsFields = () => {
    if (!settingsFund) return null;
    const type = settingsFund.type;

    if (type === "pension" || type === "hishtalmut") {
      return (
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>מעסיק</Label>
              <Input value={settingsForm.employer} onChange={(e) => setSettingsForm({ ...settingsForm, employer: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>שם הקרן</Label>
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
      );
    }

    if (type === "child_savings") {
      return (
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>סכום הפקדת מדינה חודשית</Label>
            <Input type="number" value={settingsForm.state_deposit_amount} onChange={(e) => setSettingsForm({ ...settingsForm, state_deposit_amount: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={settingsForm.parent_matching} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, parent_matching: v })} />
            <Label>הכפלת הורים</Label>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">פנסיה וחסכונות</h1>

      <Tabs value={mainTab} onValueChange={setMainTab} dir="rtl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="summary">סיכום</TabsTrigger>
          {TAB_CONFIG.map(t => (
            <TabsTrigger key={t.type} value={t.type} className="flex items-center gap-1">
              {t.icon} {t.label}
            </TabsTrigger>
          ))}
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
                <p className="text-muted-foreground text-sm">הוסף קרנות בלשוניות השונות</p>
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
                      <TableHead>סוג</TableHead>
                      <TableHead>יתרה נוכחית</TableHead>
                      <TableHead className="text-center">נגישות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funds.map(fund => {
                      const typeLabel = TAB_CONFIG.find(t => t.type === fund.type)?.label || fund.type;
                      return (
                        <TableRow key={fund.id}>
                          <TableCell className="font-medium">{fund.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{typeLabel}</TableCell>
                          <TableCell>{fmt(getLatestBalance(fund.id))}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {fund.accessible ? <Unlock className="h-4 w-4 text-green-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                              <Switch checked={fund.accessible} onCheckedChange={(v) => toggleAccessible.mutate({ id: fund.id, accessible: v })} />
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
        </TabsContent>

        {TAB_CONFIG.map(t => renderTypeSection(t.type))}
      </Tabs>

      {/* Create Fund Dialog */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{TAB_CONFIG.find(t => t.type === fundDialogType)?.createLabel}</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>הגדרות קרן - {settingsFund?.name}</DialogTitle></DialogHeader>
          {renderSettingsFields()}
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
          {renderEntryFormFields()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => upsertEntry.mutate()} disabled={upsertEntry.isPending}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
