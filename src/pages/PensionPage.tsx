import { useState, useMemo } from "react";
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
import { Plus, Trash2, PiggyBank, Lock, Unlock, Settings2, Baby, GraduationCap, TrendingUp, Layers, EyeOff, Eye, Wallet } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  relevant: boolean;
  deposit_fee_pct: number;
  accumulation_fee_pct: number;
  type: FundType;
  parent_matching: boolean;
  state_deposit_amount: number;
  birth_date: string | null;
  retirement_age: number;
  end_savings_age: number;
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
  const [selfTradingSubtype, setSelfTradingSubtype] = useState<"stocks" | "dividend">("stocks");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsFundId, setSettingsFundId] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    employer: "", fund_name: "", deposit_fee_pct: 0, accumulation_fee_pct: 0,
    parent_matching: false, state_deposit_amount: 0,
    birth_date: "", retirement_age: 67, end_savings_age: 18,
  });
  const [checkingBalance, setCheckingBalance] = useState(0);
  const [editingChecking, setEditingChecking] = useState(false);
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
      return data as unknown as PensionFund[];
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

  // Fetch pension settings for checking balance
  const { data: pensionSettings } = useQuery({
    queryKey: ["pension_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pension_settings").select("*").maybeSingle();
      if (error) throw error;
      if (data) setCheckingBalance(Number((data as any).checking_balance) || 0);
      return data;
    },
  });

  const saveCheckingBalance = useMutation({
    mutationFn: async (val: number) => {
      const existing = await supabase.from("pension_settings").select("id").maybeSingle();
      if (existing.data) {
        const { error } = await supabase.from("pension_settings").update({ checking_balance: val } as any).eq("id", existing.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pension_settings").insert({ user_id: user!.id, checking_balance: val } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_settings"] });
      setEditingChecking(false);
      toast.success("יתרת עו״ש נשמרה");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getFundsByType = (type: FundType) => funds.filter(f => f.type === type);
  const isDividendFund = (fund: PensionFund) => fund.type === "self_trading" && fund.fund_name === "dividend";

  const createFund = useMutation({
    mutationFn: async () => {
      const payload: any = { name: fundName, user_id: user!.id, type: fundDialogType };
      if (fundDialogType === "self_trading") {
        payload.fund_name = selfTradingSubtype;
      }
      const { error } = await supabase.from("pension_funds").insert(payload);
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

  const toggleRelevant = useMutation({
    mutationFn: async ({ id, relevant }: { id: string; relevant: boolean }) => {
      const { error } = await supabase.from("pension_funds").update({ relevant } as any).eq("id", id);
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
      if (fund?.type === "pension" || fund?.type === "hishtalmut") {
        updatePayload.employer = settingsForm.employer;
        updatePayload.fund_name = settingsForm.fund_name;
        updatePayload.deposit_fee_pct = settingsForm.deposit_fee_pct;
        updatePayload.accumulation_fee_pct = settingsForm.accumulation_fee_pct;
        updatePayload.birth_date = settingsForm.birth_date || null;
        updatePayload.retirement_age = settingsForm.retirement_age;
      } else if (fund?.type === "child_savings") {
        updatePayload.parent_matching = settingsForm.parent_matching;
        updatePayload.state_deposit_amount = settingsForm.state_deposit_amount;
        updatePayload.birth_date = settingsForm.birth_date || null;
        updatePayload.end_savings_age = settingsForm.end_savings_age;
      }
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
        totalDeposit = entryForm.employee + entryForm.employerC;
      } else if (fund?.type === "other" || fund?.type === "self_trading") {
        totalDeposit = entryForm.employee;
      } else {
        totalDeposit = entryForm.employee + entryForm.employerC + entryForm.compensation;
      }

      let calcFees = entryForm.management_fees;
      if (!calcFees && (fund?.type === "pension" || fund?.type === "hishtalmut")) {
        const depositFee = (fund?.deposit_fee_pct || 0) / 100 * totalDeposit;
        const accumFee = (fund?.accumulation_fee_pct || 0) / 100 / 12 * prevBalance;
        calcFees = depositFee + accumFee;
      }

      const monthlyGrowth = entryForm.closing - prevBalance;
      const profit = entryForm.closing - (prevBalance + totalDeposit - calcFees);
      const monthlyReturn = prevBalance > 0 ? profit / prevBalance : 0;

      const compensationVal = entryForm.compensation;

      const payload: any = {
        user_id: user!.id,
        fund_id: selectedFund,
        year: entryForm.year,
        month: entryForm.month,
        employer: entryForm.employer,
        fund_name: entryForm.fund_name,
        employee_contribution: entryForm.employee,
        employer_contribution: entryForm.employerC,
        compensation: compensationVal,
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
      birth_date: fund.birth_date || "",
      retirement_age: fund.retirement_age || 67,
      end_savings_age: fund.end_savings_age || 18,
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

  // COMPOUND yield calculation: multiplicative, not additive
  const getReturnSummary = (fundId: string) => {
    const sorted = getEntriesSorted(fundId);
    if (sorted.length < 2) return { y1: null, y3: null, y5: null, p1: null, p3: null, p5: null };

    const now = sorted[sorted.length - 1];
    const nowDate = new Date(now.year, now.month - 1);

    const calcCompoundReturn = (monthsBack: number) => {
      const targetDate = new Date(nowDate);
      targetDate.setMonth(targetDate.getMonth() - monthsBack);

      // Find entries within the period
      const periodEntries = sorted.filter(e => {
        const eDate = new Date(e.year, e.month - 1);
        return eDate > targetDate && eDate <= nowDate;
      });

      if (periodEntries.length < 1) return { ret: null, profit: null };

      // Check we have data going back far enough (within 2 months tolerance)
      const firstEntryDate = new Date(periodEntries[0].year, periodEntries[0].month - 1);
      const expectedStart = new Date(targetDate);
      expectedStart.setMonth(expectedStart.getMonth() + 1);
      const diffMs = Math.abs(firstEntryDate.getTime() - expectedStart.getTime());
      if (diffMs > 62 * 24 * 60 * 60 * 1000) return { ret: null, profit: null };

      // Compound: multiply (1 + monthly_return) for each month
      let compoundFactor = 1;
      for (const e of periodEntries) {
        compoundFactor *= (1 + Number(e.monthly_return));
      }
      const totalReturn = compoundFactor - 1;

      // Profit: sum of monthly profits
      const startIdx = sorted.indexOf(periodEntries[0]);
      const totalProfit = periodEntries.reduce((sum, e, i) => {
        const idx = sorted.indexOf(e);
        const prevBal = idx > 0 ? Number(sorted[idx - 1].closing_balance) : 0;
        let dep = Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation);
        const fees = Number(e.management_fees);
        return sum + (Number(e.closing_balance) - prevBal - dep + fees);
      }, 0);

      return { ret: totalReturn, profit: totalProfit };
    };

    const r1 = calcCompoundReturn(12);
    const r3 = calcCompoundReturn(36);
    const r5 = calcCompoundReturn(60);

    return {
      y1: r1.ret, y3: r3.ret, y5: r5.ret,
      p1: r1.profit, p3: r3.profit, p5: r5.profit,
    };
  };

  const openCreateDialog = (type: FundType) => {
    setFundDialogType(type);
    setFundName("");
    setSelfTradingSubtype("stocks");
    setFundDialogOpen(true);
  };

  // Only count relevant funds in totals
  const relevantFunds = funds.filter(f => f.relevant !== false);
  const totalAccessible = relevantFunds.filter(f => f.accessible).reduce((s, f) => s + getLatestBalance(f.id), 0) + checkingBalance;
  const grandTotal = relevantFunds.reduce((s, f) => s + getLatestBalance(f.id), 0) + checkingBalance;
  const nonChildFunds = funds.filter(f => f.type !== "child_savings");
  const childFunds = funds.filter(f => f.type === "child_savings");

  const currentFundType = selectedFund ? funds.find(f => f.id === selectedFund)?.type : undefined;
  const settingsFund = settingsFundId ? funds.find(f => f.id === settingsFundId) : null;

  const renderReturnCards = (fundId: string) => {
    const rs = getReturnSummary(fundId);
    const balance = getLatestBalance(fundId);
    return (
      <div className="space-y-4">
        {/* Total balance */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">סה״כ חיסכון בקופה</p>
            <p className="text-2xl sm:text-3xl font-bold">{fmt(balance)}</p>
          </CardContent>
        </Card>

        {/* Yields section */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">📈 תשואות</h4>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "שנה", val: rs.y1 },
              { label: "3 שנים", val: rs.y3 },
              { label: "5 שנים", val: rs.y5 },
            ].map(({ label, val }) => (
              <Card key={label}>
                <CardContent className="p-2 sm:p-3 text-center">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">{label}</p>
                  {val !== null && val !== undefined ? (
                    <p className={`text-xs sm:text-sm font-bold ${val >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {pct(val)}
                    </p>
                  ) : (
                    <p className="text-[10px] sm:text-xs text-muted-foreground">אין נתונים</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Profits section */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">💰 רווחים</h4>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "שנה", val: rs.p1 },
              { label: "3 שנים", val: rs.p3 },
              { label: "5 שנים", val: rs.p5 },
            ].map(({ label, val }) => (
              <Card key={label}>
                <CardContent className="p-2 sm:p-3 text-center">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">{label}</p>
                  {val !== null && val !== undefined ? (
                    <p className={`text-xs sm:text-sm font-bold ${val >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmt(val)}
                    </p>
                  ) : (
                    <p className="text-[10px] sm:text-xs text-muted-foreground">אין נתונים</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFundContent = (fund: PensionFund) => {
    const fundEntries = getEntriesSorted(fund.id);
    const displayEntries = [...fundEntries].reverse();
    const showSettings = fund.type !== "self_trading" && fund.type !== "other";
    const isDividend = isDividendFund(fund);

    return (
      <TabsContent key={fund.id} value={fund.id} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{fund.name}</h2>
          <div className="flex gap-2 flex-wrap">
            {showSettings && (
              <Button size="sm" variant="outline" onClick={() => openFundSettings(fund)}>
                <Settings2 className="ml-1 h-4 w-4" /> <span className="hidden sm:inline">הגדרות</span>
              </Button>
            )}
            <Button size="sm" onClick={() => openNewEntry(fund.id)}>
              <Plus className="ml-1 h-4 w-4" /> <span className="hidden sm:inline">הוסף חודש</span><span className="sm:hidden">הוסף</span>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteFund.mutate(fund.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {renderReturnCards(fund.id)}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">חודש</TableHead>
                  {fund.type === "pension" && <TableHead className="whitespace-nowrap">מעסיק</TableHead>}
                  {fund.type === "pension" && <TableHead className="whitespace-nowrap">קרן</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead className="whitespace-nowrap">מעסיק</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead className="whitespace-nowrap">קרן</TableHead>}
                  {fund.type === "pension" && <TableHead className="whitespace-nowrap">עובד</TableHead>}
                  {fund.type === "pension" && <TableHead className="whitespace-nowrap">מעסיק</TableHead>}
                  {fund.type === "pension" && <TableHead className="whitespace-nowrap">פיצויים</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead className="whitespace-nowrap">עובד</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead className="whitespace-nowrap">מעסיק</TableHead>}
                  {fund.type === "hishtalmut" && <TableHead className="whitespace-nowrap">פיצויים</TableHead>}
                  {fund.type === "child_savings" && <TableHead className="whitespace-nowrap">מדינה</TableHead>}
                  {fund.type === "child_savings" && fund.parent_matching && <TableHead className="whitespace-nowrap">הורים</TableHead>}
                  {fund.type === "self_trading" && <TableHead className="whitespace-nowrap">הפקדה</TableHead>}
                  {isDividend && <TableHead className="whitespace-nowrap">דיבידנד</TableHead>}
                  {fund.type === "other" && <TableHead className="whitespace-nowrap">הפקדה</TableHead>}
                  {(fund.type !== "self_trading" || !isDividend) && fund.type !== "other" && <TableHead className="whitespace-nowrap">סה״כ</TableHead>}
                  {(fund.type === "pension" || fund.type === "hishtalmut") && <TableHead className="whitespace-nowrap">דמ״נ</TableHead>}
                  <TableHead className="whitespace-nowrap">רווח</TableHead>
                  <TableHead className="whitespace-nowrap">שווי</TableHead>
                  <TableHead className="whitespace-nowrap">תשואה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fundEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center text-muted-foreground py-8">
                      אין נתונים עדיין. לחץ &quot;הוסף חודש&quot; כדי להתחיל.
                    </TableCell>
                  </TableRow>
                ) : (
                  fundEntries.map((entry, idx) => {
                    const prevBalance = idx === 0 ? 0 : Number(fundEntries[idx - 1].closing_balance);
                    let totalDeposit: number;
                    if (fund.type === "child_savings") {
                      totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution);
                    } else if (fund.type === "other" || fund.type === "self_trading") {
                      totalDeposit = Number(entry.employee_contribution);
                    } else {
                      totalDeposit = Number(entry.employee_contribution) + Number(entry.employer_contribution) + Number(entry.compensation);
                    }
                    const fees = Number(entry.management_fees);
                    const profit = Number(entry.closing_balance) - (prevBalance + totalDeposit - fees);
                    const monthlyReturn = Number(entry.monthly_return);

                    return (
                      <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditEntry(entry)}>
                        <TableCell className="whitespace-nowrap font-medium text-xs sm:text-sm">
                          {MONTHS[entry.month - 1]} {entry.year}
                        </TableCell>
                        {fund.type === "pension" && <TableCell className="text-xs sm:text-sm">{entry.employer || "-"}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-xs sm:text-sm">{entry.fund_name || "-"}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-xs sm:text-sm">{entry.employer || "-"}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-xs sm:text-sm">{entry.fund_name || "-"}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employer_contribution))}</TableCell>}
                        {fund.type === "pension" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.compensation))}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employer_contribution))}</TableCell>}
                        {fund.type === "hishtalmut" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.compensation))}</TableCell>}
                        {fund.type === "child_savings" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {fund.type === "child_savings" && fund.parent_matching && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employer_contribution))}</TableCell>}
                        {fund.type === "self_trading" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {isDividend && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.compensation))}</TableCell>}
                        {fund.type === "other" && <TableCell className="text-xs sm:text-sm">{fmt(Number(entry.employee_contribution))}</TableCell>}
                        {(fund.type !== "self_trading" || !isDividend) && fund.type !== "other" && (
                          <TableCell className="text-xs sm:text-sm font-medium">{fmt(totalDeposit)}</TableCell>
                        )}
                        {(fund.type === "pension" || fund.type === "hishtalmut") && <TableCell className="text-xs sm:text-sm">{fmt(fees)}</TableCell>}
                        <TableCell className={`text-xs sm:text-sm font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(profit)}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm font-bold">{fmt(Number(entry.closing_balance))}</TableCell>
                        <TableCell className={`text-xs sm:text-sm font-medium ${monthlyReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
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

        {typeFunds.length === 0 ? (
          <Card>
            <CardContent className="p-8 sm:p-12 text-center">
              <div className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4 flex items-center justify-center">{config.icon}</div>
              <h3 className="font-semibold text-lg mb-1">אין קרנות עדיין</h3>
              <p className="text-muted-foreground text-sm">לחץ על &quot;{config.createLabel}&quot; כדי להתחיל</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={selectedFund && typeFunds.some(f => f.id === selectedFund) ? selectedFund : typeFunds[0]?.id || ""} onValueChange={setSelectedFund} dir="rtl">
            <TabsList className="flex-wrap h-auto">
              {typeFunds.map(f => (
                <TabsTrigger key={f.id} value={f.id} className="text-xs sm:text-sm">{f.name}</TabsTrigger>
              ))}
            </TabsList>
            {typeFunds.map(fund => renderFundContent(fund))}
          </Tabs>
        )}
      </TabsContent>
    );
  };

  const renderEntryFormFields = () => {
    const fund = selectedFund ? funds.find(f => f.id === selectedFund) : null;
    const type = fund?.type || "pension";
    const isDividend = fund ? isDividendFund(fund) : false;

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
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">תגמולי עובד</Label>
              <Input type="number" value={entryForm.employee} onChange={(e) => setEntryForm({ ...entryForm, employee: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">תגמולי מעסיק</Label>
              <Input type="number" value={entryForm.employerC} onChange={(e) => setEntryForm({ ...entryForm, employerC: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">פיצויים</Label>
              <Input type="number" value={entryForm.compensation} onChange={(e) => setEntryForm({ ...entryForm, compensation: Number(e.target.value) })} />
            </div>
          </div>
        )}

        {type === "hishtalmut" && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">הפקדת עובד</Label>
              <Input type="number" value={entryForm.employee} onChange={(e) => setEntryForm({ ...entryForm, employee: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">הפקדת מעסיק</Label>
              <Input type="number" value={entryForm.employerC} onChange={(e) => setEntryForm({ ...entryForm, employerC: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">פיצויים</Label>
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

        {type === "self_trading" && (
          <div className={`grid ${isDividend ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
            <div className="space-y-2">
              <Label>הפקדה</Label>
              <Input type="number" value={entryForm.employee} onChange={(e) => setEntryForm({ ...entryForm, employee: Number(e.target.value) })} />
            </div>
            {isDividend && (
              <div className="space-y-2">
                <Label>דיבידנד</Label>
                <Input type="number" value={entryForm.compensation} onChange={(e) => setEntryForm({ ...entryForm, compensation: Number(e.target.value) })} />
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
            <Label>{type === "other" ? "שווי" : "שווי תיק"}</Label>
            <Input type="number" value={entryForm.closing} onChange={(e) => setEntryForm({ ...entryForm, closing: Number(e.target.value) })} />
          </div>
        )}
      </div>
    );
  };

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
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">פנסיה וחסכונות</h1>

      <Tabs value={mainTab} onValueChange={setMainTab} dir="rtl">
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="flex-wrap h-auto min-w-max sm:min-w-0">
            <TabsTrigger value="summary" className="text-xs sm:text-sm">סיכום</TabsTrigger>
            {TAB_CONFIG.map(t => (
              <TabsTrigger key={t.type} value={t.type} className="flex items-center gap-1 text-xs sm:text-sm">
                {t.icon} <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.label.split(" ")[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Unlock className="h-4 w-4" /> כסף נגיש
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <p className="text-lg sm:text-2xl font-bold text-green-600">{fmt(totalAccessible)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <PiggyBank className="h-4 w-4" /> סה״כ הון
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <p className="text-lg sm:text-2xl font-bold">{fmt(grandTotal)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Main funds summary table (excluding child_savings) */}
          {nonChildFunds.length > 0 && (
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">סיכום קרנות</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">שם הקרן</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">סוג</TableHead>
                      <TableHead className="text-right">יתרה</TableHead>
                      <TableHead className="text-center">נגישות</TableHead>
                      <TableHead className="text-center">רלוונטי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nonChildFunds.map(fund => {
                      const typeLabel = TAB_CONFIG.find(t => t.type === fund.type)?.label || fund.type;
                      const isRelevant = fund.relevant !== false;
                      return (
                        <TableRow key={fund.id} className={!isRelevant ? "opacity-50" : ""}>
                          <TableCell className="text-right font-medium text-xs sm:text-sm">{fund.name}</TableCell>
                          <TableCell className="text-right text-xs sm:text-sm text-muted-foreground hidden sm:table-cell">{typeLabel}</TableCell>
                          <TableCell className="text-right text-xs sm:text-sm">{fmt(getLatestBalance(fund.id))}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1 sm:gap-2">
                              {fund.accessible ? <Unlock className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" /> : <Lock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />}
                              <Switch checked={fund.accessible} onCheckedChange={(v) => toggleAccessible.mutate({ id: fund.id, accessible: v })} />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1 sm:gap-2">
                              {isRelevant ? <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-primary" /> : <EyeOff className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />}
                              <Switch checked={isRelevant} onCheckedChange={(v) => toggleRelevant.mutate({ id: fund.id, relevant: v })} />
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

          {/* Child savings separate section */}
          {childFunds.length > 0 && (
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Baby className="h-5 w-5" /> חיסכון לכל ילד
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {childFunds.map(fund => {
                    const isRelevant = fund.relevant !== false;
                    return (
                      <Card key={fund.id} className={`bg-muted/30 border ${!isRelevant ? "opacity-50" : ""}`}>
                        <CardContent className="p-3 sm:p-4 text-center space-y-2">
                          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{fund.name}</p>
                          <p className="text-lg sm:text-2xl font-bold">{fmt(getLatestBalance(fund.id))}</p>
                          <div className="flex items-center justify-center gap-2 text-xs">
                            {fund.accessible ? (
                              <span className="flex items-center gap-1 text-green-600"><Unlock className="h-3 w-3" /> נגיש</span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" /> נעול</span>
                            )}
                            <Switch className="scale-75" checked={fund.accessible} onCheckedChange={(v) => toggleAccessible.mutate({ id: fund.id, accessible: v })} />
                          </div>
                          <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs">
                            <span className={isRelevant ? "text-primary" : "text-muted-foreground"}>
                              {isRelevant ? "נספר בהון" : "לא נספר"}
                            </span>
                            <Switch className="scale-[0.6]" checked={isRelevant} onCheckedChange={(v) => toggleRelevant.mutate({ id: fund.id, relevant: v })} />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {funds.length === 0 && (
            <Card>
              <CardContent className="p-8 sm:p-12 text-center">
                <PiggyBank className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="font-semibold text-lg mb-1">אין קרנות עדיין</h3>
                <p className="text-muted-foreground text-sm">הוסף קרנות בלשוניות השונות</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {TAB_CONFIG.map(t => renderTypeSection(t.type))}
      </Tabs>

      {/* Create Fund Dialog */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent className="sm:max-w-sm max-w-[95vw]">
          <DialogHeader><DialogTitle>{TAB_CONFIG.find(t => t.type === fundDialogType)?.createLabel}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם הקרן</Label>
              <Input value={fundName} onChange={(e) => setFundName(e.target.value)} placeholder="לדוגמה: מגדל" />
            </div>
            {fundDialogType === "self_trading" && (
              <div className="space-y-2">
                <Label>סוג תיק</Label>
                <Select value={selfTradingSubtype} onValueChange={(v) => setSelfTradingSubtype(v as "stocks" | "dividend")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stocks">תיק מניות</SelectItem>
                    <SelectItem value="dividend">תיק דיבידנד</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setFundDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => { if (fundName.trim()) createFund.mutate(); }} disabled={createFund.isPending}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fund Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw]">
          <DialogHeader><DialogTitle>הגדרות קרן - {settingsFund?.name}</DialogTitle></DialogHeader>
          {renderSettingsFields()}
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => saveFundSettings.mutate()} disabled={saveFundSettings.isPending}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editEntryId ? "עריכת נתונים" : "הוסף חודש"}</DialogTitle></DialogHeader>
          {renderEntryFormFields()}
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => upsertEntry.mutate()} disabled={upsertEntry.isPending}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
