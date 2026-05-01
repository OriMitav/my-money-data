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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, PiggyBank, Lock, Unlock, Settings2, Baby, GraduationCap, TrendingUp, Layers, EyeOff, Eye, Wallet, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from "recharts";

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
  life_expectancy_age: number;
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

// Forecast chart sub-component
function ForecastChart({ fund, buildForecastData }: {
  fund: PensionFund;
  buildForecastData: (fund: PensionFund, scenario: "y1" | "y3" | "y5", noDeposits?: boolean) => { label: string; historyBalance: number | null; forecastBalance: number | null }[];
}) {
  const [scenario, setScenario] = useState<"y1" | "y3" | "y5">("y1");
  const [noDeposits, setNoDeposits] = useState(false);
  const showNoDeposits = fund.type === "pension";
  const data = useMemo(() => buildForecastData(fund, scenario, showNoDeposits ? noDeposits : false), [fund, scenario, noDeposits, showNoDeposits, buildForecastData]);

  if (data.length < 2) return null;

  const scenarioLabels = { y1: "תשואה שנה", y3: "תשואה 3 שנים", y5: "תשואה 5 שנים" };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-4 pb-1">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-base">📊 גרף גידול ותחזית</CardTitle>
          <div className="flex gap-1 flex-wrap">
            {(["y1", "y3", "y5"] as const).map(s => (
              <Button key={s} size="sm" variant={scenario === s ? "default" : "outline"}
                className="text-[10px] sm:text-xs px-2 py-1 h-7"
                onClick={() => setScenario(s)}>
                {scenarioLabels[s]}
              </Button>
            ))}
          </div>
        </div>
        {showNoDeposits && (
          <div className="flex items-center gap-2 mt-2">
            <Switch checked={noDeposits} onCheckedChange={setNoDeposits} />
            <Label className="text-xs">ללא הפקדות עתידיות</Label>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-2 sm:p-4 pt-0">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 8))} />
            <YAxis tickFormatter={(v: number) => `₪${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
            <RTooltip formatter={(v: number) => fmt(v)} />
            <Legend />
            <Line type="monotone" dataKey="historyBalance" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="היסטוריה" connectNulls={false} />
            <Line type="monotone" dataKey="forecastBalance" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" dot={false} name="תחזית" connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

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
    birth_date: "", retirement_age: 67, end_savings_age: 18, life_expectancy_age: 85,
  });
  const [showAllInvestment, setShowAllInvestment] = useState(false);
  const [showAllGrowth, setShowAllGrowth] = useState(false);
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
        updatePayload.life_expectancy_age = settingsForm.life_expectancy_age;
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
      birth_date: fund.birth_date || "",
      retirement_age: fund.retirement_age || 67,
      end_savings_age: fund.end_savings_age || 18,
      life_expectancy_age: fund.life_expectancy_age || 85,
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

  const getReturnSummary = (fundId: string) => {
    const sorted = getEntriesSorted(fundId);
    if (sorted.length < 2) return { y1: null, y3: null, y5: null, p1: null, p3: null, p5: null };

    const now = sorted[sorted.length - 1];
    const nowDate = new Date(now.year, now.month - 1);

    const calcCompoundReturn = (monthsBack: number) => {
      const targetDate = new Date(nowDate);
      targetDate.setMonth(targetDate.getMonth() - monthsBack);

      const periodEntries = sorted.filter(e => {
        const eDate = new Date(e.year, e.month - 1);
        return eDate > targetDate && eDate <= nowDate;
      });

      if (periodEntries.length < 1) return { ret: null, profit: null };

      const firstEntryDate = new Date(periodEntries[0].year, periodEntries[0].month - 1);
      const expectedStart = new Date(targetDate);
      expectedStart.setMonth(expectedStart.getMonth() + 1);
      const diffMs = Math.abs(firstEntryDate.getTime() - expectedStart.getTime());
      if (diffMs > 62 * 24 * 60 * 60 * 1000) return { ret: null, profit: null };

      let compoundFactor = 1;
      for (const e of periodEntries) {
        compoundFactor *= (1 + Number(e.monthly_return));
      }
      const totalReturn = compoundFactor - 1;

      const totalProfit = periodEntries.reduce((sum, e) => {
        const idx = sorted.indexOf(e);
        const prevBal = idx > 0 ? Number(sorted[idx - 1].closing_balance) : 0;
        const dep = Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation);
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

  const relevantFunds = funds.filter(f => f.relevant !== false);
  const totalAccessible = relevantFunds.filter(f => f.accessible).reduce((s, f) => s + getLatestBalance(f.id), 0) + checkingBalance;
  const grandTotal = relevantFunds.reduce((s, f) => s + getLatestBalance(f.id), 0) + checkingBalance;
  const nonChildFunds = funds.filter(f => f.type !== "child_savings");
  const childFunds = funds.filter(f => f.type === "child_savings");

  const settingsFund = settingsFundId ? funds.find(f => f.id === settingsFundId) : null;

  const buildForecastData = (fund: PensionFund, yieldScenario: "y1" | "y3" | "y5", noDeposits = false): { label: string; historyBalance: number | null; forecastBalance: number | null }[] => {
    const sorted = getEntriesSorted(fund.id);
    if (sorted.length < 2) return [];

    const histData: { label: string; historyBalance: number | null; forecastBalance: number | null }[] = sorted.map(e => ({
      label: `${MONTHS[e.month - 1]} ${e.year}`,
      historyBalance: Number(e.closing_balance),
      forecastBalance: null,
    }));

    const last12 = sorted.slice(-12);
    const avgDeposit = noDeposits ? 0 : last12.reduce((s, e) => s + Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation), 0) / last12.length;

    const rs = getReturnSummary(fund.id);
    let annualYield = 0;
    if (yieldScenario === "y1" && rs.y1 != null) annualYield = rs.y1;
    else if (yieldScenario === "y3" && rs.y3 != null) annualYield = Math.pow(1 + rs.y3, 1 / 3) - 1;
    else if (yieldScenario === "y5" && rs.y5 != null) annualYield = Math.pow(1 + rs.y5, 1 / 5) - 1;
    const monthlyYield = Math.pow(1 + annualYield, 1 / 12) - 1;

    let forecastMonths = 60;
    if (fund.type === "pension" && fund.birth_date) {
      const birthDate = new Date(fund.birth_date);
      const retireAge = fund.retirement_age || 67;
      const retireDate = new Date(birthDate.getFullYear() + retireAge, birthDate.getMonth());
      const lastEntry = sorted[sorted.length - 1];
      const lastDate = new Date(lastEntry.year, lastEntry.month - 1);
      forecastMonths = Math.max(0, Math.round((retireDate.getTime() - lastDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    } else if (fund.type === "child_savings" && fund.birth_date) {
      const birthDate = new Date(fund.birth_date);
      const endAge = fund.end_savings_age || 18;
      const endDate = new Date(birthDate.getFullYear() + endAge, birthDate.getMonth());
      const lastEntry = sorted[sorted.length - 1];
      const lastDate = new Date(lastEntry.year, lastEntry.month - 1);
      forecastMonths = Math.max(0, Math.round((endDate.getTime() - lastDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    }
    forecastMonths = Math.min(forecastMonths, 600);

    const step = forecastMonths > 120 ? 12 : forecastMonths > 60 ? 6 : 1;
    let balance = sorted.length > 0 ? Number(sorted[sorted.length - 1].closing_balance) : 0;
    const lastEntry = sorted[sorted.length - 1];
    let curMonth = lastEntry.month;
    let curYear = lastEntry.year;

    const forecastData: { label: string; historyBalance: null; forecastBalance: number }[] = [];
    const depositFee = (fund.deposit_fee_pct || 0) / 100;
    const accumFee = (fund.accumulation_fee_pct || 0) / 100 / 12;

    for (let i = 1; i <= forecastMonths; i++) {
      curMonth++;
      if (curMonth > 12) { curMonth = 1; curYear++; }
      const fees = avgDeposit * depositFee + balance * accumFee;
      balance = balance * (1 + monthlyYield) + avgDeposit - fees;
      if (i % step === 0 || i === forecastMonths) {
        forecastData.push({
          label: `${MONTHS[curMonth - 1]} ${curYear}`,
          historyBalance: null,
          forecastBalance: Math.round(balance),
        });
      }
    }

    const histStep = histData.length > 60 ? 12 : histData.length > 24 ? 3 : 1;
    const thinnedHist = histData.filter((_, i) => i % histStep === 0 || i === histData.length - 1);

    if (thinnedHist.length > 0 && forecastData.length > 0) {
      thinnedHist[thinnedHist.length - 1].forecastBalance = thinnedHist[thinnedHist.length - 1].historyBalance;
    }

    return [...thinnedHist, ...forecastData];
  };

  const buildPensionProjection = (fund: PensionFund) => {
    const sorted = getEntriesSorted(fund.id);
    if (sorted.length < 2 || !fund.birth_date) return null;

    const rs = getReturnSummary(fund.id);
    const last12 = sorted.slice(-12);
    const avgDeposit = last12.reduce((s, e) => s + Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation), 0) / last12.length;

    const birthDate = new Date(fund.birth_date);
    const retireAge = fund.retirement_age || 67;
    const retireDate = new Date(birthDate.getFullYear() + retireAge, birthDate.getMonth());
    const lastEntry = sorted[sorted.length - 1];
    const lastDate = new Date(lastEntry.year, lastEntry.month - 1);
    const forecastMonths = Math.max(0, Math.round((retireDate.getTime() - lastDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));

    const depositFee = (fund.deposit_fee_pct || 0) / 100;
    const accumFee = (fund.accumulation_fee_pct || 0) / 100 / 12;
    const currentBalance = Number(lastEntry.closing_balance);

    const lifeExpectancy = fund.life_expectancy_age || 85;
    const monthsInRetirement = Math.max(1, (lifeExpectancy - retireAge) * 12);

    const scenarios = [
      { key: "y1", label: "תשואה שנה", yieldVal: rs.y1 },
      { key: "y3", label: "תשואה 3 שנים", yieldVal: rs.y3 != null ? Math.pow(1 + rs.y3, 1 / 3) - 1 : null },
      { key: "y5", label: "תשואה 5 שנים", yieldVal: rs.y5 != null ? Math.pow(1 + rs.y5, 1 / 5) - 1 : null },
    ];

    return scenarios.map(s => {
      if (s.yieldVal == null) return { ...s, withDeposits: null, withoutDeposits: null, pensionWithDeposits: null, pensionWithout: null };
      const monthlyYield = Math.pow(1 + s.yieldVal, 1 / 12) - 1;

      let bal = currentBalance;
      for (let i = 0; i < forecastMonths; i++) {
        const fees = avgDeposit * depositFee + bal * accumFee;
        bal = bal * (1 + monthlyYield) + avgDeposit - fees;
      }
      const withDeposits = bal;

      bal = currentBalance;
      for (let i = 0; i < forecastMonths; i++) {
        const fees = bal * accumFee;
        bal = bal * (1 + monthlyYield) - fees;
      }
      const withoutDeposits = bal;

      return {
        ...s,
        withDeposits,
        withoutDeposits,
        pensionWithDeposits: withDeposits / monthsInRetirement,
        pensionWithout: withoutDeposits / monthsInRetirement,
      };
    });
  };

  const buildHishtalmutProjection = (fund: PensionFund) => {
    const sorted = getEntriesSorted(fund.id);
    if (sorted.length < 2) return null;

    const rs = getReturnSummary(fund.id);
    const last12 = sorted.slice(-12);
    const avgDeposit = last12.reduce((s, e) => s + Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation), 0) / last12.length;

    const depositFee = (fund.deposit_fee_pct || 0) / 100;
    const accumFee = (fund.accumulation_fee_pct || 0) / 100 / 12;
    const currentBalance = Number(sorted[sorted.length - 1].closing_balance);

    const scenarios = [
      { key: "y1", label: "תשואה שנה", yieldVal: rs.y1 },
      { key: "y3", label: "תשואה 3 שנים", yieldVal: rs.y3 != null ? Math.pow(1 + rs.y3, 1 / 3) - 1 : null },
      { key: "y5", label: "תשואה 5 שנים", yieldVal: rs.y5 != null ? Math.pow(1 + rs.y5, 1 / 5) - 1 : null },
    ];

    return scenarios.map(s => {
      if (s.yieldVal == null) return { ...s, projections: [null, null, null, null, null] as (number | null)[] };
      const monthlyYield = Math.pow(1 + s.yieldVal, 1 / 12) - 1;
      const projections: number[] = [];
      let bal = currentBalance;
      for (let yr = 1; yr <= 5; yr++) {
        for (let m = 0; m < 12; m++) {
          const fees = avgDeposit * depositFee + bal * accumFee;
          bal = bal * (1 + monthlyYield) + avgDeposit - fees;
        }
        projections.push(Math.round(bal));
      }
      return { ...s, projections };
    });
  };

  const renderReturnCards = (fundId: string) => {
    const rs = getReturnSummary(fundId);
    const balance = getLatestBalance(fundId);
    const fund = funds.find(f => f.id === fundId);
    const showForecast = fund && (fund.type === "pension" || fund.type === "child_savings" || fund.type === "hishtalmut");

    const pensionProjection = fund?.type === "pension" ? buildPensionProjection(fund) : null;
    const hishtalmutProjection = fund?.type === "hishtalmut" ? buildHishtalmutProjection(fund) : null;

    return (
      <div className="space-y-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">סה״כ חיסכון בקופה</p>
            <p className="text-2xl sm:text-3xl font-bold">{fmt(balance)}</p>
          </CardContent>
        </Card>

        {pensionProjection && (
          <Card>
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-sm">📋 תחזית חיסכון עד גיל פרישה</CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-4 pt-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs">תרחיש</TableHead>
                    <TableHead className="text-right text-xs">עם הפקדות</TableHead>
                    <TableHead className="text-right text-xs">ללא הפקדות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pensionProjection.map(s => (
                    <TableRow key={s.key}>
                      <TableCell className="text-xs font-medium">{s.label}</TableCell>
                      <TableCell className="text-xs">
                        {s.withDeposits != null ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dashed border-muted-foreground/50">{fmt(s.withDeposits)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">קצבה חודשית מוערכת: {s.pensionWithDeposits != null ? fmt(s.pensionWithDeposits) : "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : "אין נתונים"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.withoutDeposits != null ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dashed border-muted-foreground/50">{fmt(s.withoutDeposits)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">קצבה חודשית מוערכת: {s.pensionWithout != null ? fmt(s.pensionWithout) : "-"}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : "אין נתונים"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {hishtalmutProjection && (
          <Card>
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-sm">📋 תחזית חיסכון 1-5 שנים קדימה</CardTitle>
            </CardHeader>
            <CardContent className="p-2 sm:p-4 pt-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs">תרחיש</TableHead>
                    {[1, 2, 3, 4, 5].map(yr => (
                      <TableHead key={yr} className="text-right text-xs">{yr} {yr === 1 ? "שנה" : "שנים"}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hishtalmutProjection.map(s => (
                    <TableRow key={s.key}>
                      <TableCell className="text-xs font-medium">{s.label}</TableCell>
                      {s.projections.map((p, i) => (
                        <TableCell key={i} className="text-xs">{p != null ? fmt(p) : "אין נתונים"}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {showForecast && <ForecastChart fund={fund} buildForecastData={buildForecastData} />}

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
                    <p className={`text-xs sm:text-sm font-bold ${val >= 0 ? "text-green-600" : "text-red-600"}`}>{pct(val)}</p>
                  ) : (
                    <p className="text-[10px] sm:text-xs text-muted-foreground">אין נתונים</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

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
                    <p className={`text-xs sm:text-sm font-bold ${val >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(val)}</p>
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
          <h3 className="text-base sm:text-lg font-semibold">{fund.name}</h3>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
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
                  displayEntries.map((entry) => {
                    const chronIdx = fundEntries.indexOf(entry);
                    const prevBalance = chronIdx === 0 ? 0 : Number(fundEntries[chronIdx - 1].closing_balance);
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>תאריך לידה</Label>
              <Input type="date" value={settingsForm.birth_date} onChange={(e) => setSettingsForm({ ...settingsForm, birth_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>גיל פרישה</Label>
              <Input type="number" value={settingsForm.retirement_age} onChange={(e) => setSettingsForm({ ...settingsForm, retirement_age: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>גיל תוחלת חיים</Label>
            <Input type="number" value={settingsForm.life_expectancy_age} onChange={(e) => setSettingsForm({ ...settingsForm, life_expectancy_age: Number(e.target.value) })} />
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>תאריך לידה של הילד</Label>
              <Input type="date" value={settingsForm.birth_date} onChange={(e) => setSettingsForm({ ...settingsForm, birth_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>גיל סיום חיסכון</Label>
              <Input type="number" value={settingsForm.end_savings_age} onChange={(e) => setSettingsForm({ ...settingsForm, end_savings_age: Number(e.target.value) })} />
            </div>
          </div>
        </div>
      );
    }

    return null;
  };


  // Investment summary computation - includes carry-forward for the current calendar month
  // so any update (e.g. updating עו"ש on the 1st of a new month) immediately produces a new row
  const monthlyInvestmentSummary = useMemo(() => {
    const relFundIds = new Set(relevantFunds.map(f => f.id));
    const monthSet = new Set<string>();
    for (const e of entries) {
      if (!relFundIds.has(e.fund_id)) continue;
      monthSet.add(`${e.year}-${String(e.month).padStart(2, '0')}`);
    }
    // Always ensure the current calendar month is present (auto snapshot when month rolls over)
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (relevantFunds.length > 0) monthSet.add(currentKey);

    const sortedMonths = [...monthSet].sort();
    let prevTotalValue = 0;
    const result: { label: string; value: number; deposits: number; profit: number; yieldPct: number }[] = [];
    for (const mk of sortedMonths) {
      const [yr, mn] = mk.split('-').map(Number);
      let totalValue = 0, totalDeposits = 0, totalProfit = 0;
      for (const fund of relevantFunds) {
        const fe = getEntriesSorted(fund.id);
        const entry = fe.find(e => e.year === yr && e.month === mn);
        if (entry) {
          const idx = fe.indexOf(entry);
          const prevBal = idx > 0 ? Number(fe[idx - 1].closing_balance) : 0;
          const dep = Number(entry.employee_contribution) + Number(entry.employer_contribution) + Number(entry.compensation);
          const fees = Number(entry.management_fees);
          totalValue += Number(entry.closing_balance);
          totalDeposits += dep;
          totalProfit += (Number(entry.closing_balance) - prevBal - dep + fees);
        } else {
          // No entry for this month — carry forward the latest known balance up to this month
          const prior = [...fe].reverse().find(e => e.year < yr || (e.year === yr && e.month < mn));
          if (prior) totalValue += Number(prior.closing_balance);
        }
      }
      const yieldPct = prevTotalValue > 0 ? totalProfit / prevTotalValue : 0;
      result.push({ label: `${MONTHS[mn - 1]} ${yr}`, value: totalValue, deposits: totalDeposits, profit: totalProfit, yieldPct });
      prevTotalValue = totalValue;
    }
    return result.reverse();
  }, [entries, relevantFunds]);

  const monthlyCapitalGrowth = useMemo(() => {
    return monthlyInvestmentSummary.map((row, i) => {
      const totalCapital = row.value + checkingBalance;
      const prevRow = i < monthlyInvestmentSummary.length - 1 ? monthlyInvestmentSummary[i + 1] : null;
      const prevCapital = prevRow ? prevRow.value + checkingBalance : 0;
      const growth = prevCapital > 0 ? totalCapital - prevCapital : 0;
      const growthPct = prevCapital > 0 ? growth / prevCapital : 0;
      return { label: row.label, totalCapital, growth, growthPct };
    });
  }, [monthlyInvestmentSummary, checkingBalance]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">פנסיה וחסכונות</h1>

      <Tabs value={mainTab} onValueChange={setMainTab} dir="rtl">
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="flex-wrap h-auto min-w-max sm:min-w-0">
            <TabsTrigger value="summary" className="text-xs sm:text-sm font-bold bg-primary/10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              📊 סיכום
            </TabsTrigger>
            {TAB_CONFIG.map(t => (
              <TabsTrigger key={t.type} value={t.type} className="flex items-center gap-1 text-xs sm:text-sm">
                {t.icon} <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.label.split(" ")[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4 sm:space-y-6">
          {/* Checking account balance */}
          <Card className="border-dashed">
            <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">יתרת עו״ש</span>
              </div>
              {editingChecking ? (
                <div className="flex items-center gap-2">
                  <Input type="number" className="w-32 h-8 text-sm" value={checkingBalance}
                    onChange={(e) => setCheckingBalance(Number(e.target.value))} />
                  <Button size="sm" className="h-8" onClick={() => saveCheckingBalance.mutate(checkingBalance)}>שמור</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setEditingChecking(false)}>ביטול</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditingChecking(true)}>
                  <span className="text-lg font-bold">{fmt(checkingBalance)}</span>
                  <span className="text-xs text-muted-foreground">(לחץ לעריכה)</span>
                </div>
              )}
            </CardContent>
          </Card>

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

          {/* Investment Summary & Capital Growth Matrices */}
          {monthlyInvestmentSummary.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <Card>
                <CardHeader className="p-3 sm:p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm sm:text-base">סיכום השקעות</CardTitle>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => qc.invalidateQueries({ queryKey: ["pension_entries"] })}>
                      <RefreshCw className="h-3 w-3 ml-1" /> רענון
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right text-xs">חודש</TableHead>
                        <TableHead className="text-right text-xs">שווי נוכחי</TableHead>
                        <TableHead className="text-right text-xs">הפקדה</TableHead>
                        <TableHead className="text-right text-xs">רווח</TableHead>
                        <TableHead className="text-right text-xs">תשואה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(showAllInvestment ? monthlyInvestmentSummary : monthlyInvestmentSummary.slice(0, 5)).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs whitespace-nowrap">{row.label}</TableCell>
                          <TableCell className="text-xs">{fmt(row.value)}</TableCell>
                          <TableCell className="text-xs">{fmt(row.deposits)}</TableCell>
                          <TableCell className={`text-xs ${row.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(row.profit)}</TableCell>
                          <TableCell className={`text-xs ${row.yieldPct >= 0 ? "text-green-600" : "text-red-600"}`}>{pct(row.yieldPct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {monthlyInvestmentSummary.length > 5 && (
                    <div className="p-2 text-center">
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowAllInvestment(!showAllInvestment)}>
                        {showAllInvestment ? "הצג פחות" : "הצג הכל"} <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${showAllInvestment ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 sm:p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm sm:text-base">גידול הון</CardTitle>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => qc.invalidateQueries({ queryKey: ["pension_entries"] })}>
                      <RefreshCw className="h-3 w-3 ml-1" /> רענון
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right text-xs">חודש</TableHead>
                        <TableHead className="text-right text-xs">סה״כ הון</TableHead>
                        <TableHead className="text-right text-xs">גידול</TableHead>
                        <TableHead className="text-right text-xs">שיעור גידול</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(showAllGrowth ? monthlyCapitalGrowth : monthlyCapitalGrowth.slice(0, 5)).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs whitespace-nowrap">{row.label}</TableCell>
                          <TableCell className="text-xs">{fmt(row.totalCapital)}</TableCell>
                          <TableCell className={`text-xs ${row.growth >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(row.growth)}</TableCell>
                          <TableCell className={`text-xs ${row.growthPct >= 0 ? "text-green-600" : "text-red-600"}`}>{pct(row.growthPct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {monthlyCapitalGrowth.length > 5 && (
                    <div className="p-2 text-center">
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowAllGrowth(!showAllGrowth)}>
                        {showAllGrowth ? "הצג פחות" : "הצג הכל"} <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${showAllGrowth ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Main funds summary table */}
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
                        <TableRow key={fund.id}>
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

          {/* Child savings */}
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
                      <Card key={fund.id} className="bg-muted/30 border">
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
