import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from "recharts";
import {
  Wallet, Calendar, TrendingUp, AlertCircle, FileJson, Trash2, Loader2, Activity,
  TrendingDown, Flame, Info, AlertTriangle
} from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

// =================== Types ===================
interface MortgageTrack {
  track_code?: string | number;
  track_name?: string;
  track_type?: string;
  balance?: number;
  balance_with_fees?: number;
  // Real schema field names from bank reports
  track_balance_without_fees?: number;
  track_balance_with_fees?: number;
  interest_rate?: number;
  first_payment_date?: string;
  end_date?: string;
  original_amount?: number;
  monthly_payment?: number;
  // Extended schema
  interest_rate_percent?: number | null;
  comparison_interest_rate?: number | null;
  linkage_differences?: number | null;
  capitalization_fee?: number | null;
  accumulated_unbilled_interest?: number | null;
  non_advance_notice_fee?: number | null;
  arrears_debt?: number | null;
}

interface MortgageLoan {
  loan_account_number?: string | number;
  bank?: string;
  loan_type?: string;
  loan_balance_without_fees?: number;
  loan_balance_with_fees?: number;
  tracks?: MortgageTrack[];
}

interface MortgagePayload {
  report_date: string;
  total_mortgage_balance_without_fees: number;
  total_mortgage_balance_with_fees: number;
  loans: MortgageLoan[];
}

interface MortgageSnapshot {
  id: string;
  property_id: string;
  report_date: string;
  total_balance_without_fees: number;
  total_balance_with_fees: number;
  payload: MortgagePayload;
  created_at: string;
}

// =================== Helpers ===================
const fmtNum = (n: number) =>
  (Math.round(n || 0)).toLocaleString("en-US");
const fmtILS = (n: number) => "₪" + fmtNum(n);
const fmtPct = (n: number | null | undefined) =>
  (n == null ? 0 : n).toFixed(2) + "%";

// Robust date parser: handles "01.04.2024", "01/04/2024", "4/5/2026", "2026-05-04"
const parseDate = (input?: string | null): Date | null => {
  if (!input) return null;
  const s = String(input).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.exec(s);
  if (dmy) {
    let y = +dmy[3];
    if (y < 100) y += 2000;
    return new Date(y, +dmy[2] - 1, +dmy[1]);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const getTrackBalance = (t: MortgageTrack): number =>
  Number(t.track_balance_with_fees ?? t.balance_with_fees ?? t.track_balance_without_fees ?? t.balance ?? 0);

// Mock daily market data
const MARKET_DATA = {
  primeRate: 6.0,
  cpiAnnual: 2.8,
  fixedAvgRate: 4.8,
  variableAvgRate: 5.2,
  fetchedAt: new Date().toISOString(),
};

const classifyTrack = (track: MortgageTrack): "prime" | "fixed" | "variable" | "cpi" => {
  const blob = `${track.track_type || ""} ${track.track_name || ""} ${track.track_code || ""}`.toLowerCase();
  if (blob.includes("prime") || blob.includes("פריים") || blob.includes("1078")) return "prime";
  if (blob.includes("variable") || blob.includes("משתנה") || blob.includes("6085")) return "variable";
  if (blob.includes("cpi") || blob.includes("מדד") || blob.includes("צמוד")) return "cpi";
  return "fixed";
};

const getRateForTrack = (track: MortgageTrack): number => {
  const r1 = track.interest_rate_percent;
  if (typeof r1 === "number" && r1 > 0) return r1;
  const r2 = track.interest_rate;
  if (typeof r2 === "number" && r2 > 0) return r2;
  const cat = classifyTrack(track);
  if (cat === "prime") return MARKET_DATA.primeRate;
  if (cat === "variable") return MARKET_DATA.variableAvgRate;
  if (cat === "cpi") return MARKET_DATA.fixedAvgRate;
  return MARKET_DATA.fixedAvgRate;
};

const trackPenalties = (t: MortgageTrack): number =>
  (t.capitalization_fee || 0) + (t.accumulated_unbilled_interest || 0) + (t.non_advance_notice_fee || 0);

const getMarketCompare = (t: MortgageTrack): number => {
  const cat = classifyTrack(t);
  if (cat === "prime") return MARKET_DATA.primeRate;
  if (cat === "variable") return MARKET_DATA.variableAvgRate;
  if (cat === "cpi") return MARKET_DATA.fixedAvgRate;
  return MARKET_DATA.fixedAvgRate;
};

const monthsBetween = (from: Date, to: Date): number => {
  const m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, m);
};

// Spitzer payment
const spitzerPMT = (balance: number, annualRatePct: number, months: number) => {
  if (months <= 0 || balance <= 0) return 0;
  const r = (annualRatePct / 100) / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
};

// =================== Component ===================
export default function PropertyMortgageTab({ propertyId }: { propertyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["mortgage_snapshots", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mortgage_snapshots")
        .select("*")
        .eq("property_id", propertyId)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return data as unknown as MortgageSnapshot[];
    },
    enabled: !!user,
  });

  const insertMutation = useMutation({
    mutationFn: async (payload: MortgagePayload) => {
      // Normalize report_date to ISO yyyy-mm-dd for DB storage
      const reportDateObj = parseDate(payload.report_date) || new Date();
      const isoDate = reportDateObj.toISOString().slice(0, 10);
      // Compute totals as fallback if missing/0
      let totalWith = Number(payload.total_mortgage_balance_with_fees) || 0;
      let totalWithout = Number(payload.total_mortgage_balance_without_fees) || 0;
      if (!totalWith || !totalWithout) {
        let sw = 0, swo = 0;
        for (const loan of payload.loans || []) {
          sw += Number(loan.loan_balance_with_fees) || 0;
          swo += Number(loan.loan_balance_without_fees) || 0;
          for (const t of loan.tracks || []) {
            if (!loan.loan_balance_with_fees) sw += getTrackBalance(t);
            if (!loan.loan_balance_without_fees) swo += Number(t.track_balance_without_fees ?? t.balance ?? 0);
          }
        }
        totalWith = totalWith || sw;
        totalWithout = totalWithout || swo;
      }
      const { error } = await supabase.from("mortgage_snapshots").insert({
        user_id: user!.id,
        property_id: propertyId,
        report_date: isoDate,
        total_balance_without_fees: totalWithout,
        total_balance_with_fees: totalWith,
        payload: payload as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mortgage_snapshots", propertyId] });
      setOpenDialog(false);
      setJsonText("");
      toast.success("נתוני המשכנתא נשמרו");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mortgage_snapshots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mortgage_snapshots", propertyId] });
      toast.success("נמחק");
    },
  });

  const handleSubmitJson = () => {
    let parsed: MortgagePayload;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      toast.error("JSON לא תקין: " + e.message);
      return;
    }
    if (!parsed.report_date || !Array.isArray(parsed.loans)) {
      toast.error("ה-JSON חייב לכלול report_date ומערך loans");
      return;
    }
    insertMutation.mutate(parsed);
  };

  const latest = snapshots[0];
  const payload = latest?.payload;

  // ============ Derived calculations ============
  const tracksEnriched = useMemo(() => {
    if (!payload) return [] as Array<MortgageTrack & { _loanId: string; _loanType: string; _pmt: number; _months: number; _rate: number; _category: string; _balance: number }>;
    const today = parseDate(payload.report_date) || new Date();
    const out: any[] = [];
    for (const loan of payload.loans || []) {
      for (const t of loan.tracks || []) {
        const end = parseDate(t.end_date);
        const months = end ? monthsBetween(today, end) : 0;
        const rate = getRateForTrack(t);
        const balance = getTrackBalance(t);
        const pmt = spitzerPMT(balance, rate, months);
        out.push({
          ...t,
          _loanId: String(loan.loan_account_number || ""),
          _loanType: loan.loan_type || "",
          _pmt: pmt,
          _months: months,
          _rate: rate,
          _category: classifyTrack(t),
          _balance: balance,
        });
      }
    }
    return out;
  }, [payload]);

  const totalPMT = tracksEnriched.reduce((s, t) => s + t._pmt, 0);

  // Risk & Refinancing aggregates
  const riskAgg = useMemo(() => {
    let linkage = 0, capFee = 0, unbilled = 0, nonAdvance = 0, arrears = 0;
    tracksEnriched.forEach(t => {
      linkage += t.linkage_differences || 0;
      capFee += t.capitalization_fee || 0;
      unbilled += t.accumulated_unbilled_interest || 0;
      nonAdvance += t.non_advance_notice_fee || 0;
      arrears += t.arrears_debt || 0;
    });
    return {
      linkage,
      capFee,
      unbilled,
      nonAdvance,
      arrears,
      hiddenFees: capFee + unbilled + nonAdvance,
    };
  }, [tracksEnriched]);

  const exposure = useMemo(() => {
    const buckets: Record<string, number> = { prime: 0, cpi: 0, fixed: 0, variable: 0 };
    tracksEnriched.forEach(t => {
      buckets[t._category] = (buckets[t._category] || 0) + t._balance;
    });
    const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
    return {
      buckets,
      pcts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, (v / total) * 100])),
      total,
    };
  }, [tracksEnriched]);

  // Next exit point: closest 5y-anniversary of any variable track's first_payment_date
  const nextExit = useMemo(() => {
    const today = new Date();
    let best: Date | null = null;
    tracksEnriched.forEach(t => {
      if (t._category !== "variable") return;
      const start = parseDate(t.first_payment_date);
      if (!start) return;
      const candidate = new Date(start);
      while (candidate <= today) {
        candidate.setFullYear(candidate.getFullYear() + 5);
      }
      if (!best || candidate < best) best = candidate;
    });
    return best as Date | null;
  }, [tracksEnriched]);

  // Forecast amortization
  const amortization = useMemo(() => {
    if (!payload) return [] as { year: number; balance: number; type: "history" | "forecast" }[];
    // Historical
    const hist = [...snapshots]
      .slice()
      .reverse()
      .map(s => {
        const d = parseDate(s.report_date) || new Date();
        return {
          year: d.getFullYear() + d.getMonth() / 12,
          balance: Number(s.total_balance_with_fees) || 0,
          type: "history" as const,
        };
      });

    const today = parseDate(payload.report_date) || new Date();
    const horizonEnd = new Date(2055, 11, 31);
    const totalMonths = monthsBetween(today, horizonEnd);
    const trackStates = tracksEnriched.map(t => ({
      balance: t._balance,
      rate: t._rate,
      monthsLeft: t._months,
      pmt: t._pmt,
    }));
    const forecast: { year: number; balance: number; type: "forecast" }[] = [];
    // Always include t=0 anchor so chart starts at current balance
    forecast.push({
      year: today.getFullYear() + today.getMonth() / 12,
      balance: trackStates.reduce((s, ts) => s + ts.balance, 0),
      type: "forecast",
    });
    for (let m = 1; m <= totalMonths; m++) {
      let totalBal = 0;
      trackStates.forEach(ts => {
        if (ts.monthsLeft > 0 && ts.balance > 0) {
          const r = (ts.rate / 100) / 12;
          const interest = ts.balance * r;
          const principal = Math.max(0, Math.min(ts.balance, ts.pmt - interest));
          ts.balance = Math.max(0, ts.balance - principal);
          ts.monthsLeft--;
        }
        totalBal += ts.balance;
      });
      if (m % 6 === 0) {
        const d = new Date(today);
        d.setMonth(d.getMonth() + m);
        forecast.push({
          year: d.getFullYear() + d.getMonth() / 12,
          balance: totalBal,
          type: "forecast",
        });
      }
    }
    return [...hist, ...forecast];
  }, [payload, snapshots, tracksEnriched]);

  // Stacked monthly payment over years (per track)
  const paymentTimeline = useMemo(() => {
    if (!payload) return { rows: [] as any[], keys: [] as string[] };
    const today = parseDate(payload.report_date) || new Date();
    const horizon = 2055;
    const rows: Record<number, any> = {};
    const keys: string[] = [];
    // Bucket tracks by friendly name to keep legend short
    tracksEnriched.forEach((t, i) => {
      const baseName = t.track_name || `מסלול ${i + 1}`;
      const key = `${baseName} #${i + 1}`;
      keys.push(key);
      const end = parseDate(t.end_date);
      const startY = today.getFullYear();
      const endY = end ? end.getFullYear() : startY;
      for (let y = startY; y <= horizon; y++) {
        if (!rows[y]) rows[y] = { year: y };
        rows[y][key] = y <= endY ? Math.round(t._pmt) : 0;
      }
    });
    return {
      rows: Object.values(rows).sort((a: any, b: any) => a.year - b.year),
      keys,
    };
  }, [payload, tracksEnriched]);

  // ============ Track Mix donut data ============
  const COLORS = {
    prime: "hsl(15, 85%, 55%)",     // warm orange-red
    variable: "hsl(35, 90%, 55%)",  // warm orange
    cpi: "hsl(280, 60%, 55%)",      // purple
    fixed: "hsl(200, 75%, 50%)",    // cool blue
  };
  const mixData = Object.entries(exposure.buckets)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      name: k === "prime" ? "פריים" : k === "cpi" ? "צמוד מדד" : k === "variable" ? "משתנה" : "קבועה",
      value: v,
      color: COLORS[k as keyof typeof COLORS],
    }));

  // ============ Render ============
  return (
    <div dir="rtl" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">המשכנתא</h2>
          {latest && (
            <p className="text-xs text-muted-foreground">
              עודכן לאחרונה: {(parseDate(latest.report_date) || new Date()).toLocaleDateString("he-IL")} • {snapshots.length} תמונות מצב
            </p>
          )}
        </div>
        <Button onClick={() => setOpenDialog(true)} className="gap-2">
          <FileJson className="h-4 w-4" /> עדכון נתוני משכנתא (JSON)
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !payload ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Wallet className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין נתוני משכנתא</h3>
            <p className="text-muted-foreground text-sm mb-4">העלה קובץ JSON מבנק ישראל / האפליקציה הבנקאית כדי להתחיל</p>
            <Button onClick={() => setOpenDialog(true)} variant="outline">
              <FileJson className="h-4 w-4 ml-1" /> הדבק JSON
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ===== Section A: KPI Cards ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              icon={<Wallet className="h-4 w-4" />}
              label="סך יתרה לסילוק"
              value={fmtILS(latest.total_balance_with_fees)}
              sub={`ללא קנסות: ${fmtILS(latest.total_balance_without_fees)}`}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="החזר חודשי משוער"
              value={fmtILS(totalPMT)}
              sub={`${tracksEnriched.length} מסלולים פעילים`}
            />
            <KpiCard
              icon={<Calendar className="h-4 w-4" />}
              label="נקודת יציאה קרובה"
              value={nextExit ? nextExit.toLocaleDateString("he-IL") : "—"}
              sub={nextExit ? "תחנת יציאה משתנה" : "אין מסלולים משתנים"}
            />
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="חשיפה לפריים / מדד"
              value={`${(exposure.pcts.prime || 0).toFixed(0)}% / ${(exposure.pcts.cpi || 0).toFixed(0)}%`}
              sub={`קבועה: ${(exposure.pcts.fixed || 0).toFixed(0)}% • משתנה: ${(exposure.pcts.variable || 0).toFixed(0)}%`}
            />
          </div>

          {/* Penalty alert */}
          {(latest.total_balance_with_fees - latest.total_balance_without_fees) > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <div className="text-sm">
                  <span className="font-semibold">קנס פירעון מוקדם:</span>{" "}
                  <span className="text-amber-700 dark:text-amber-400 font-bold">
                    {fmtILS(latest.total_balance_with_fees - latest.total_balance_without_fees)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ===== Section A2: Refinancing & Risk ===== */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                מחזור וסיכונים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Linkage Impact */}
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-red-600" /> מד ההצמדה
                  </div>
                  <div className="text-xl font-bold text-red-600 dark:text-red-400">
                    {fmtILS(riskAgg.linkage)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">חוב שנוסף מהצמדה למדד</div>
                </div>

                {/* Hidden Fees */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <AlertCircle className="h-3.5 w-3.5" /> קנסות ועמלות חבויות
                  </div>
                  <div className="text-xl font-bold">{fmtILS(riskAgg.hiddenFees)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    היוון: {fmtILS(riskAgg.capFee)} • ריבית שלא חויבה: {fmtILS(riskAgg.unbilled)} • אי-הודעה: {fmtILS(riskAgg.nonAdvance)}
                  </div>
                </div>

                {/* Arrears */}
                <div className={`rounded-lg border p-3 ${riskAgg.arrears > 0 ? "border-red-600 bg-red-600/10" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    {riskAgg.arrears > 0 ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 animate-pulse" />
                    ) : (
                      <Activity className="h-3.5 w-3.5" />
                    )}
                    חוב פיגורים
                  </div>
                  <div className={`text-xl font-bold ${riskAgg.arrears > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                    {fmtILS(riskAgg.arrears)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {riskAgg.arrears > 0 ? "דרושה התייחסות מיידית!" : "אין חוב פיגורים"}
                  </div>
                </div>
              </div>

              {/* Refinance indicator per track */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">אינדיקטור כדאיות מחזור (לפי מסלול)</div>
                <div className="flex flex-wrap gap-2">
                  {tracksEnriched.filter(t => typeof t.comparison_interest_rate === "number").length === 0 && (
                    <span className="text-xs text-muted-foreground">אין נתוני ריבית להשוואה במסלולים</span>
                  )}
                  {tracksEnriched.map((t, i) => {
                    if (typeof t.comparison_interest_rate !== "number") return null;
                    const market = getMarketCompare(t);
                    const diff = t.comparison_interest_rate - market;
                    // diff > 0 → existing comparison rate is higher than current market → refinance attractive
                    const profitable = diff > 0.3;
                    const neutral = Math.abs(diff) <= 0.3;
                    const variant = profitable ? "default" : neutral ? "secondary" : "outline";
                    const Icon = profitable ? TrendingDown : neutral ? Info : TrendingUp;
                    return (
                      <Badge key={i} variant={variant} className="gap-1 text-[11px]">
                        <Icon className="h-3 w-3" />
                        {t.track_name || `מסלול ${i + 1}`}: {fmtPct(t.comparison_interest_rate)} vs שוק {fmtPct(market)}
                        {profitable && <span className="ml-1">— מחזור משתלם</span>}
                        {neutral && <span className="ml-1">— ניטרלי</span>}
                        {!profitable && !neutral && <span className="ml-1">— לא משתלם</span>}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>


          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">התפלגות חוב ותחזית סילוק</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={amortization}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v.toFixed(0)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                      <RTooltip formatter={(v: number) => fmtILS(v)} labelFormatter={(v: number) => `שנה ${v.toFixed(1)}`} />
                      <Line
                        type="monotone"
                        dataKey={(d: any) => d.type === "history" ? d.balance : null}
                        name="היסטוריה"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey={(d: any) => d.type === "forecast" ? d.balance : null}
                        name="תחזית"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-center">קו רציף = היסטוריה • מקטע לעתיד = תחזית</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">תמהיל מסלולים וסיכונים</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={mixData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {mixData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RTooltip formatter={(v: number) => fmtILS(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">צפי החזר חודשי לאורך השנים</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={paymentTimeline.rows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                    <RTooltip formatter={(v: number) => fmtILS(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {paymentTimeline.keys.map((k, i) => {
                      const palette = ["hsl(200,75%,50%)", "hsl(15,85%,55%)", "hsl(280,60%,55%)", "hsl(35,90%,55%)", "hsl(150,60%,45%)", "hsl(340,70%,55%)"];
                      return <Bar key={k} dataKey={k} stackId="pmt" fill={palette[i % palette.length]} />;
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ===== Section C: Loans Accordion ===== */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">פירוט הלוואות ומסלולים</CardTitle></CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {(payload.loans || []).map((loan, idx) => {
                  const loanTracks = tracksEnriched.filter(t => t._loanId === String(loan.loan_account_number || ""));
                  const totBal = loanTracks.reduce((s, t) => s + (t._balance || 0), 0);
                  const totPMT = loanTracks.reduce((s, t) => s + t._pmt, 0);
                  return (
                    <AccordionItem key={idx} value={`loan-${idx}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-1 items-center justify-between gap-4 pl-2">
                          <div className="text-right">
                            <div className="font-semibold flex items-center gap-2">
                              הלוואה {loan.loan_account_number}
                              {loan.loan_type && (
                                <Badge variant="secondary" className="text-[10px] font-normal">{loan.loan_type}</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{loan.bank || ""} • {(loan.tracks || []).length} מסלולים</div>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div className="text-left">
                              <div className="text-xs text-muted-foreground">יתרה</div>
                              <div className="font-bold">{fmtILS(totBal)}</div>
                            </div>
                            <div className="text-left">
                              <div className="text-xs text-muted-foreground">החזר/חודש</div>
                              <div className="font-bold">{fmtILS(totPMT)}</div>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <TooltipProvider delayDuration={150}>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-right whitespace-nowrap">שם מסלול</TableHead>
                                  <TableHead className="text-center">קוד</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">תאריך סיום</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">יתרה מתואמת</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">ריבית מתואמת</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">ריבית להשוואה</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">הפרשי הצמדה</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">סך קנסות</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">החזר משוער</TableHead>
                                  <TableHead className="text-center w-32">התקדמות</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {loanTracks.map((t, i) => {
                                  const start = parseDate(t.first_payment_date);
                                  const end = parseDate(t.end_date);
                                  const today = new Date();
                                  const totalMo = start && end ? monthsBetween(start, end) : 0;
                                  const elapsed = start ? monthsBetween(start, today) : 0;
                                  const progress = totalMo > 0 ? Math.min(100, (elapsed / totalMo) * 100) : 0;
                                  const penalties = trackPenalties(t);
                                  const hasArrears = (t.arrears_debt || 0) > 0;
                                  return (
                                    <TableRow key={i} className={hasArrears ? "bg-red-500/5" : ""}>
                                      <TableCell className="font-medium whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                          {hasArrears && (
                                            <UITooltip>
                                              <TooltipTrigger asChild>
                                                <AlertTriangle className="h-3.5 w-3.5 text-red-600 animate-pulse" />
                                              </TooltipTrigger>
                                              <TooltipContent>חוב פיגורים: {fmtILS(t.arrears_debt || 0)}</TooltipContent>
                                            </UITooltip>
                                          )}
                                          <span>{t.track_name || "—"}</span>
                                          <Badge variant="outline" className="mr-1 text-[10px]" style={{ borderColor: COLORS[t._category as keyof typeof COLORS] }}>
                                            {t._category === "prime" ? "פריים" : t._category === "cpi" ? "מדד" : t._category === "variable" ? "משתנה" : "קבועה"}
                                          </Badge>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center text-xs">{t.track_code ?? "—"}</TableCell>
                                      <TableCell className="text-center text-xs whitespace-nowrap">
                                        {end ? end.toLocaleDateString("he-IL") : "—"}
                                      </TableCell>
                                      <TableCell className="text-center font-medium whitespace-nowrap">{fmtILS(t.balance_with_fees ?? t.balance ?? 0)}</TableCell>
                                      <TableCell className="text-center whitespace-nowrap">
                                        {typeof t.interest_rate_percent === "number"
                                          ? fmtPct(t.interest_rate_percent)
                                          : fmtPct(t._rate)}
                                      </TableCell>
                                      <TableCell className="text-center whitespace-nowrap text-muted-foreground">
                                        {typeof t.comparison_interest_rate === "number" ? fmtPct(t.comparison_interest_rate) : "—"}
                                      </TableCell>
                                      <TableCell className={`text-center whitespace-nowrap ${(t.linkage_differences || 0) > 0 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                                        {fmtILS(t.linkage_differences || 0)}
                                      </TableCell>
                                      <TableCell className="text-center whitespace-nowrap">
                                        <UITooltip>
                                          <TooltipTrigger asChild>
                                            <span className={penalties > 0 ? "font-medium cursor-help underline decoration-dotted" : "text-muted-foreground"}>
                                              {fmtILS(penalties)}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div className="text-xs space-y-0.5">
                                              <div>היוון: {fmtILS(t.capitalization_fee || 0)}</div>
                                              <div>ריבית שלא חויבה: {fmtILS(t.accumulated_unbilled_interest || 0)}</div>
                                              <div>אי-הודעה מראש: {fmtILS(t.non_advance_notice_fee || 0)}</div>
                                            </div>
                                          </TooltipContent>
                                        </UITooltip>
                                      </TableCell>
                                      <TableCell className="text-center font-semibold whitespace-nowrap">{fmtILS(t._pmt)}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <Progress value={progress} className="h-2" />
                                          <span className="text-[10px] text-muted-foreground w-8">{progress.toFixed(0)}%</span>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </TooltipProvider>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>

          {/* History */}
          {snapshots.length > 1 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">היסטוריית תמונות מצב</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">תאריך דוח</TableHead>
                      <TableHead className="text-center">יתרה (ללא קנס)</TableHead>
                      <TableHead className="text-center">יתרה (כולל קנס)</TableHead>
                      <TableHead className="text-center w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map(s => (
                      <TableRow key={s.id}>
                        <TableCell>{new Date(s.report_date).toLocaleDateString("he-IL")}</TableCell>
                        <TableCell className="text-center">{fmtILS(s.total_balance_without_fees)}</TableCell>
                        <TableCell className="text-center">{fmtILS(s.total_balance_with_fees)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="icon" variant="ghost" onClick={() => { if (confirm("למחוק את התמונה?")) deleteMutation.mutate(s.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* JSON Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>עדכון נתוני משכנתא</DialogTitle>
            <DialogDescription>
              הדבק את נתוני המשכנתא בפורמט JSON. נדרש: report_date, total_mortgage_balance_without_fees, total_mortgage_balance_with_fees, loans[]
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            className="font-mono text-xs h-[400px]"
            dir="ltr"
            placeholder='{\n  "report_date": "2026-05-01",\n  "total_mortgage_balance_without_fees": 850000,\n  "total_mortgage_balance_with_fees": 862000,\n  "loans": [\n    {\n      "loan_account_number": "12345",\n      "bank": "הפועלים",\n      "tracks": [\n        {\n          "track_code": "6085",\n          "track_name": "משתנה כל 5",\n          "track_type": "variable",\n          "balance": 200000,\n          "balance_with_fees": 205000,\n          "interest_rate": 5.1,\n          "first_payment_date": "2022-01-01",\n          "end_date": "2047-01-01"\n        }\n      ]\n    }\n  ]\n}'
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>ביטול</Button>
            <Button onClick={handleSubmitJson} disabled={insertMutation.isPending || !jsonText.trim()}>
              {insertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמור תמונת מצב"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          {icon}<span>{label}</span>
        </div>
        <div className="text-lg sm:text-xl font-bold tracking-tight truncate">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
      </CardContent>
    </Card>
  );
}
