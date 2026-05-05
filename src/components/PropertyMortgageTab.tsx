import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar, LabelList, AreaChart, Area
} from "recharts";
import {
  Wallet, Calendar, TrendingUp, AlertCircle, FileJson, Trash2, Loader2, Activity,
  TrendingDown, Flame, Info, AlertTriangle, ChevronDown, ChevronLeft
} from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useMarketData } from "@/lib/marketData";

// =================== Types ===================
interface MortgageTrack {
  track_code?: string | number;
  track_number?: string | number;
  track_name?: string;
  track_type?: string;
  balance?: number;
  balance_with_fees?: number;
  // Real schema field names from bank reports
  track_balance_without_fees?: number;
  track_balance_with_fees?: number;
  track_balance?: number;
  track_original_amount?: number;
  track_end_date?: string;
  annual_interest_rate_percent?: number;
  annual_interest_rate_string?: string;
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

interface RecentPayment {
  month?: string;
  amount?: number;
}

interface BalanceBreakdown {
  principal_balance?: number;
  total_linkage_differences?: number;
  interest_for_clearance?: number;
  total_early_repayment_fees?: number;
}

interface MortgageLoan {
  loan_account_number?: string | number;
  loan_number?: string | number;
  bank?: string;
  loan_type?: string;
  loan_balance_without_fees?: number;
  loan_balance_with_fees?: number;
  total_balance_with_fees?: number;
  original_loan_amount?: number;
  start_date?: string;
  end_date?: string;
  // flat (per new JSON) — also supported as nested balance_breakdown
  principal_balance?: number;
  total_linkage_differences?: number;
  interest_for_clearance?: number;
  total_early_repayment_fees?: number;
  balance_breakdown?: BalanceBreakdown;
  recent_payments?: RecentPayment[];
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
  Number(
    t.track_balance_with_fees ??
    t.balance_with_fees ??
    t.track_balance ??
    t.track_balance_without_fees ??
    t.balance ??
    0
  );

// Mock daily market data
const MARKET_DATA = {
  primeRate: 6.0,
  cpiAnnual: 2.8,
  fixedAvgRate: 4.8,
  variableAvgRate: 5.2,
  fetchedAt: new Date().toISOString(),
};

const classifyTrack = (track: MortgageTrack): "prime" | "fixed" | "variable" | "cpi" => {
  const blob = `${track.track_type || ""} ${track.track_name || ""} ${track.annual_interest_rate_string || ""} ${track.track_code || ""}`.toLowerCase();
  if (blob.includes("prime") || blob.includes("פריים") || blob.includes("1078")) return "prime";
  if (blob.includes("variable") || blob.includes("משתנה") || blob.includes("עוגן") || blob.includes("6085")) return "variable";
  if (blob.includes("cpi") || blob.includes("מדד") || blob.includes("צמוד")) return "cpi";
  return "fixed";
};

// Returns the actual interest rate from the JSON, or null when missing.
// We intentionally do NOT fall back to market rates anymore — the chart and
// PMT calculations should be based strictly on the user's bank data.
const getRateForTrack = (track: MortgageTrack): number | null => {
  const r0 = track.annual_interest_rate_percent;
  if (typeof r0 === "number" && r0 >= 0) return r0;
  const r1 = track.interest_rate_percent;
  if (typeof r1 === "number" && r1 > 0) return r1;
  const r2 = track.interest_rate;
  if (typeof r2 === "number" && r2 > 0) return r2;
  return null;
};

// Normalize a loan from the new bank JSON schema into the canonical shape used
// throughout the component. Maps loan_number→loan_account_number, flattens
// balance_breakdown, and copies new track fields (track_balance, track_end_date,
// annual_interest_rate_percent, track_original_amount) onto the existing keys.
const normalizeLoan = (loan: any): MortgageLoan => {
  const bb: BalanceBreakdown = loan.balance_breakdown || {
    principal_balance: loan.principal_balance,
    total_linkage_differences: loan.total_linkage_differences,
    interest_for_clearance: loan.interest_for_clearance,
    total_early_repayment_fees: loan.total_early_repayment_fees,
  };
  const totalWith = Number(loan.total_balance_with_fees ?? loan.loan_balance_with_fees) || 0;
  const principal = Number(bb.principal_balance) || 0;
  const linkage = Number(bb.total_linkage_differences) || 0;
  const fees = (Number(bb.interest_for_clearance) || 0) + (Number(bb.total_early_repayment_fees) || 0);
  const tracks: MortgageTrack[] = (loan.tracks || []).map((t: any) => ({
    ...t,
    track_code: t.track_code ?? t.track_number,
    end_date: t.end_date || t.track_end_date,
    track_balance_with_fees: t.track_balance_with_fees ?? t.track_balance,
    balance: t.balance ?? t.track_balance,
    original_amount: t.original_amount ?? t.track_original_amount,
    interest_rate_percent: t.interest_rate_percent ?? t.annual_interest_rate_percent,
    first_payment_date: t.first_payment_date || loan.start_date,
  }));
  return {
    ...loan,
    loan_account_number: loan.loan_account_number ?? loan.loan_number,
    loan_balance_with_fees: loan.loan_balance_with_fees ?? totalWith,
    loan_balance_without_fees:
      loan.loan_balance_without_fees ?? Math.max(0, totalWith - fees),
    balance_breakdown: bb,
    principal_balance: principal,
    total_linkage_differences: linkage,
    interest_for_clearance: Number(bb.interest_for_clearance) || 0,
    total_early_repayment_fees: Number(bb.total_early_repayment_fees) || 0,
    recent_payments: Array.isArray(loan.recent_payments) ? loan.recent_payments : [],
    tracks,
  };
};

const normalizePayload = (raw: any): MortgagePayload => {
  const loans = (raw.loans || []).map(normalizeLoan);
  const totalWith =
    Number(raw.total_mortgage_balance_with_fees) ||
    loans.reduce((s, l) => s + (Number(l.loan_balance_with_fees) || 0), 0);
  const totalWithout =
    Number(raw.total_mortgage_balance_without_fees) ||
    loans.reduce((s, l) => s + (Number(l.loan_balance_without_fees) || 0), 0);
  // pick most recent report_date across loans if top-level missing
  let reportDate: string = raw.report_date || "";
  if (!reportDate) {
    for (const l of loans as any[]) {
      if (l.report_date) { reportDate = l.report_date; break; }
    }
  }
  return {
    report_date: reportDate || new Date().toISOString().slice(0, 10),
    total_mortgage_balance_with_fees: totalWith,
    total_mortgage_balance_without_fees: totalWithout,
    loans,
  };
};

// Parse "MM.YYYY" → Date (1st of month)
const parseMonthYear = (s?: string): Date | null => {
  if (!s) return null;
  const m = /^(\d{1,2})[./-](\d{4})$/.exec(s.trim());
  if (!m) return parseDate(s);
  return new Date(+m[2], +m[1] - 1, 1);
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

// Extract fixed margin (e.g. 2.80) from rate strings like "עוגן + % 2.80",
// "עוגן + 2.80%", "Prime + 0.5%", or "פריים - 0.5%".
const extractMargin = (s?: string | null): number | null => {
  if (!s) return null;
  const m = /([+\-])\s*%?\s*(\d+(?:\.\d+)?)\s*%?/.exec(String(s));
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * parseFloat(m[2]);
};

// Walk a single track month-by-month. Optionally apply a rate change at a
// "station" (variable adjustment) date and return per-month interest/principal.
interface TrackStep {
  month: number;          // months since today
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}
const amortizeTrack = (
  startBalance: number,
  initialRate: number | null,
  totalMonths: number,
  initialPmt: number,
  station?: { month: number; newRate: number } | null,
): TrackStep[] => {
  const out: TrackStep[] = [];
  let balance = startBalance;
  let rate = initialRate ?? 0;
  let pmt = initialPmt;
  for (let m = 1; m <= totalMonths; m++) {
    if (station && m === station.month) {
      rate = station.newRate;
      const remaining = totalMonths - m + 1;
      pmt = spitzerPMT(balance, rate, remaining);
    }
    if (balance <= 0 || pmt <= 0) break;
    const r = (rate / 100) / 12;
    const interest = r > 0 ? balance * r : 0;
    const principal = Math.max(0, Math.min(balance, pmt - interest));
    balance = Math.max(0, balance - principal);
    out.push({ month: m, interest, principal, payment: interest + principal, balance });
    if (balance <= 0) break;
  }
  return out;
};

// =================== Component ===================
export default function PropertyMortgageTab({ propertyId }: { propertyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: market } = useMarketData();
  const [openDialog, setOpenDialog] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [marketAnchorRate, setMarketAnchorRate] = useState<number>(3.0);

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
    onSuccess: async (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["mortgage_snapshots", propertyId] });
      setOpenDialog(false);
      setJsonText("");
      toast.success("נתוני המשכנתא נשמרו");
      // Sync recent_payments → property_cashflow (one row per loan/month, dedup via unique index)
      try {
        const rows: any[] = [];
        (variables.loans || []).forEach((loan: any) => {
          const loanId = String(loan.loan_account_number || loan.loan_number || "");
          (loan.recent_payments || []).forEach((rp: RecentPayment) => {
            const d = parseMonthYear(rp.month);
            const amt = Number(rp.amount) || 0;
            if (!d || !amt) return;
            const iso = d.toISOString().slice(0, 10);
            rows.push({
              user_id: user!.id,
              property_id: propertyId,
              entry_date: iso,
              subject: `החזר משכנתא • הלוואה ${loanId.slice(-4)}`,
              amount: -Math.abs(amt),
              source: "mortgage",
              source_ref: `loan-${loanId}-${rp.month}`,
            });
          });
        });
        if (rows.length) {
          const { error } = await supabase
            .from("property_cashflow")
            .upsert(rows, { onConflict: "property_id,source,source_ref", ignoreDuplicates: true });
          if (!error) {
            qc.invalidateQueries({ queryKey: ["property_cashflow", propertyId] });
          }
        }
      } catch { /* non-fatal */ }
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
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      toast.error("JSON לא תקין: " + e.message);
      return;
    }
    if (!Array.isArray(parsed?.loans)) {
      toast.error("ה-JSON חייב לכלול מערך loans");
      return;
    }
    const normalized = normalizePayload(parsed);
    insertMutation.mutate(normalized);
  };

  const latest = snapshots[0];
  // Normalize on read too — supports older snapshots saved before normalization.
  const payload: MortgagePayload | undefined = useMemo(
    () => (latest?.payload ? normalizePayload(latest.payload) : undefined),
    [latest]
  );

  // ============ Derived calculations ============
  const tracksEnriched = useMemo(() => {
    if (!payload) return [] as Array<MortgageTrack & { _loanId: string; _loanType: string; _pmt: number; _months: number; _rate: number | null; _category: string; _balance: number; _hasRate: boolean; _hasReportedPmt: boolean }>;
    const today = parseDate(payload.report_date) || new Date();
    const out: any[] = [];
    for (const loan of payload.loans || []) {
      for (const t of loan.tracks || []) {
        const end = parseDate(t.end_date);
        const months = end ? monthsBetween(today, end) : 0;
        const rate = getRateForTrack(t); // null if not in JSON
        const balance = getTrackBalance(t);
        const reportedPmt = Number(t.monthly_payment) || 0;
        // Strict: use only data that comes from the JSON.
        // 1) Reported monthly_payment wins.
        // 2) Otherwise compute Spitzer ONLY if a real interest rate exists in the JSON.
        // 3) Otherwise 0 (surfaced in UI as "חסר נתון").
        let pmt = 0;
        if (reportedPmt > 0) pmt = reportedPmt;
        else if (rate != null && balance > 0 && months > 0) pmt = spitzerPMT(balance, rate, months);
        out.push({
          ...t,
          _loanId: String(loan.loan_account_number || ""),
          _loanType: loan.loan_type || "",
          _pmt: pmt,
          _months: months,
          _rate: rate,
          _category: classifyTrack(t),
          _balance: balance,
          _hasRate: rate != null,
          _hasReportedPmt: reportedPmt > 0,
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
        const bal = Number(s.total_balance_with_fees) || Number(s.payload?.total_mortgage_balance_with_fees) || 0;
        return {
          year: d.getFullYear() + d.getMonth() / 12,
          balance: bal,
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

  // Stacked monthly payment over years — grouped by category, with predictive
  // ============ Variable-track "station" projections ============
  // For each variable track, locate the next interest-change "station":
  //   • prefer the explicit next_interest_change_date from JSON
  //   • else 5y anniversary of first_payment_date
  // Then derive new rate = current_market_anchor_rate + extracted_margin
  // (margin is parsed out of annual_interest_rate_string e.g. "עוגן + % 2.80").
  const trackProjections = useMemo(() => {
    if (!payload) return new Map<number, { stationDate: Date; stationMonth: number; newRate: number; margin: number; oldRate: number | null }>();
    const today = parseDate(payload.report_date) || new Date();
    const out = new Map<number, { stationDate: Date; stationMonth: number; newRate: number; margin: number; oldRate: number | null }>();
    tracksEnriched.forEach((t, idx) => {
      if (t._category !== "variable") return;
      const explicit = parseDate((t as any).next_interest_change_date);
      let station: Date | null = explicit;
      if (!station) {
        const start = parseDate(t.first_payment_date);
        if (!start) return;
        const c = new Date(start);
        while (c <= today) c.setFullYear(c.getFullYear() + 5);
        station = c;
      }
      if (!station || station <= today) return;
      const margin = extractMargin((t as any).annual_interest_rate_string) ?? 0;
      const newRate = marketAnchorRate + margin;
      out.set(idx, {
        stationDate: station,
        stationMonth: monthsBetween(today, station),
        newRate,
        margin,
        oldRate: t._rate,
      });
    });
    return out;
  }, [payload, tracksEnriched, marketAnchorRate]);

  // ============ Per-track full amortization (with stations applied) ============
  const trackAmortizations = useMemo(() => {
    return tracksEnriched.map((t, idx) => {
      const proj = trackProjections.get(idx);
      const station = proj ? { month: proj.stationMonth, newRate: proj.newRate } : null;
      return amortizeTrack(t._balance, t._rate, t._months, t._pmt, station);
    });
  }, [tracksEnriched, trackProjections]);

  // ============ Stacked monthly payment over years (categories) ============
  const paymentTimeline = useMemo(() => {
    if (!payload) return { rows: [] as any[], keys: [] as string[] };
    const today = parseDate(payload.report_date) || new Date();
    const horizon = 2055;
    const CAT_LABEL: Record<string, string> = {
      prime: "ריבית פריים",
      fixed: "ריבית קבועה",
      variable: "ריבית משתנה",
      cpi: "צמוד מדד",
    };
    const presentSet = new Set<string>();
    tracksEnriched.forEach(t => presentSet.add(t._category));
    const order = ["prime", "fixed", "variable", "cpi"].filter(c => presentSet.has(c));
    const keys = order.map(c => CAT_LABEL[c]);

    const rows: Record<number, any> = {};
    const startY = today.getFullYear();
    for (let y = startY; y <= horizon; y++) {
      rows[y] = { year: y, total: 0, _changes: [] as string[] };
      keys.forEach(k => { rows[y][k] = 0; });
    }
    tracksEnriched.forEach((t, idx) => {
      const end = parseDate(t.end_date);
      const endY = end ? end.getFullYear() : startY;
      const endM = end ? end.getMonth() : 11; // 0-indexed month of end
      const label = CAT_LABEL[t._category] || "אחר";
      const proj = trackProjections.get(idx);
      const stationDate = proj ? proj.stationDate : null;
      const stationY = stationDate ? stationDate.getFullYear() : null;
      const stationM = stationDate ? stationDate.getMonth() : null; // 0-indexed
      const newPmt = proj
        ? spitzerPMT(t._balance, proj.newRate, Math.max(1, t._months - proj.stationMonth))
        : t._pmt;
      for (let y = startY; y <= Math.min(endY, horizon); y++) {
        // Month range within this year that the track is active
        const firstActiveMonth = y === startY ? today.getMonth() : 0;
        const lastActiveMonth = y === endY ? endM : 11;
        let sum = 0;
        for (let m = firstActiveMonth; m <= lastActiveMonth; m++) {
          const usesNew = stationY != null && (y > stationY || (y === stationY && m >= (stationM ?? 0)));
          sum += usesNew ? newPmt : t._pmt;
        }
        const monthsActive = Math.max(0, lastActiveMonth - firstActiveMonth + 1);
        const avg = monthsActive > 0 ? sum / monthsActive : 0;
        rows[y][label] = (rows[y][label] || 0) + avg;
        rows[y].total += avg;
      }
      if (end && endY <= horizon && endY + 1 <= horizon && rows[endY + 1]) {
        rows[endY + 1]._changes.push(`סיום מסלול ${t.track_name || t._category} (${endY})`);
      }
      if (proj && stationY != null && rows[stationY]) {
        rows[stationY]._changes.push(
          `התאמת ריבית משתנה (${t.track_name || ""}) ב-${stationDate!.toLocaleDateString("he-IL")} לפי עוגן ${marketAnchorRate.toFixed(2)}% + מרווח ${proj.margin.toFixed(2)}% = ${proj.newRate.toFixed(2)}%`
        );
      }
    });
    const out = Object.values(rows)
      .sort((a: any, b: any) => a.year - b.year)
      .map((r: any) => {
        const o: any = { year: r.year, total: Math.round(r.total), _changes: r._changes };
        keys.forEach(k => { o[k] = Math.round(r[k] || 0); });
        return o;
      })
      .filter((r: any, _i, arr) => r.total > 0 || arr[0].year === r.year);
    out.forEach((r, i) => {
      const prev = i > 0 ? out[i - 1] : null;
      r._delta = prev ? r.total - prev.total : 0;
      r._flagged = !!prev && r.total !== prev.total;
    });
    return { rows: out, keys };
  }, [payload, tracksEnriched, trackProjections, marketAnchorRate]);


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

  // ============ Rate matrix per category (weighted by balance) ============
  const rateMatrix = useMemo(() => {
    const CAT_LABEL: Record<string, string> = {
      prime: "ריבית פריים",
      fixed: "ריבית קבועה",
      variable: "ריבית משתנה",
      cpi: "צמוד מדד",
    };
    const groups: Record<string, {
      label: string;
      balance: number;
      weightedRateNum: number;   // sum of (rate * balance) where rate exists
      weightedRateDen: number;   // sum of balance where rate exists
      pmt: number;
      tracks: Array<{ name: string; balance: number; rate: number | null; pmt: number; loanId: string }>;
      missingRateBalance: number;
    }> = {};
    tracksEnriched.forEach(t => {
      const cat = t._category;
      if (!groups[cat]) {
        groups[cat] = {
          label: CAT_LABEL[cat] || "אחר",
          balance: 0, weightedRateNum: 0, weightedRateDen: 0, pmt: 0,
          tracks: [], missingRateBalance: 0,
        };
      }
      const g = groups[cat];
      g.balance += t._balance;
      g.pmt += t._pmt;
      if (t._rate != null) {
        g.weightedRateNum += t._rate * t._balance;
        g.weightedRateDen += t._balance;
      } else {
        g.missingRateBalance += t._balance;
      }
      g.tracks.push({
        name: t.track_name || `מסלול`,
        balance: t._balance,
        rate: t._rate,
        pmt: t._pmt,
        loanId: t._loanId,
      });
    });
    return Object.entries(groups)
      .map(([cat, g]) => ({
        category: cat,
        label: g.label,
        balance: g.balance,
        avgRate: g.weightedRateDen > 0 ? g.weightedRateNum / g.weightedRateDen : null,
        marketRate: cat === "prime" ? MARKET_DATA.primeRate
          : cat === "variable" ? MARKET_DATA.variableAvgRate
          : cat === "cpi" ? MARKET_DATA.fixedAvgRate
          : MARKET_DATA.fixedAvgRate,
        pmt: g.pmt,
        tracks: g.tracks.sort((a, b) => b.balance - a.balance),
        missingRateBalance: g.missingRateBalance,
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [tracksEnriched]);

  // Sanity check: tracks missing both rate and reported PMT
  const missingDataTracks = tracksEnriched.filter(t => !t._hasRate && !t._hasReportedPmt && t._balance > 0);

  // ============ Aggregates from new JSON schema ============
  // Sum recent_payments by month across all loans → actuals series
  const paymentHistory = useMemo(() => {
    if (!payload) return [] as { month: string; date: Date; amount: number }[];
    const byMonth = new Map<string, { date: Date; amount: number }>();
    (payload.loans || []).forEach((l: any) => {
      (l.recent_payments || []).forEach((rp: RecentPayment) => {
        const d = parseMonthYear(rp.month);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const cur = byMonth.get(key);
        const amt = Number(rp.amount) || 0;
        if (cur) cur.amount += amt;
        else byMonth.set(key, { date: d, amount: amt });
      });
    });
    return Array.from(byMonth.entries())
      .map(([key, v]) => ({ month: key, date: v.date, amount: v.amount }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [payload]);

  // Last actual monthly payment (sum across loans for the latest month)
  const lastMonthlyPayment = paymentHistory.length
    ? paymentHistory[paymentHistory.length - 1].amount
    : 0;

  // Original loan total vs current balance (with fees)
  const originalTotals = useMemo(() => {
    if (!payload) return { original: 0, current: 0, currentNoFees: 0, paidOff: 0, pctPaid: 0 };
    let original = 0, current = 0, currentNoFees = 0;
    (payload.loans || []).forEach((l: any) => {
      original += Number(l.original_loan_amount) || 0;
      current += Number(l.total_balance_with_fees ?? l.loan_balance_with_fees) || 0;
      currentNoFees += Number(l.loan_balance_without_fees) || 0;
    });
    const paidOff = Math.max(0, original - current);
    const pctPaid = original > 0 ? (paidOff / original) * 100 : 0;
    return { original, current, currentNoFees, paidOff, pctPaid };
  }, [payload]);

  // Total fees & linkage = total_linkage_differences + total_early_repayment_fees + interest_for_clearance
  const feesAndLinkage = useMemo(() => {
    if (!payload) return { linkage: 0, prepayment: 0, clearance: 0, total: 0 };
    let linkage = 0, prepayment = 0, clearance = 0;
    (payload.loans || []).forEach((l: any) => {
      linkage += Number(l.total_linkage_differences) || 0;
      prepayment += Number(l.total_early_repayment_fees) || 0;
      clearance += Number(l.interest_for_clearance) || 0;
    });
    return { linkage, prepayment, clearance, total: linkage + prepayment + clearance };
  }, [payload]);

  // Current balance breakdown for donut chart
  const balanceBreakdownData = useMemo(() => {
    const principal = (payload?.loans || []).reduce((s: number, l: any) => s + (Number(l.principal_balance) || 0), 0);
    const linkage = feesAndLinkage.linkage;
    const interestFees = feesAndLinkage.prepayment + feesAndLinkage.clearance;
    return [
      { name: "קרן", value: Math.max(0, principal), color: "hsl(200, 75%, 50%)" },
      { name: "הפרשי הצמדה", value: Math.max(0, linkage), color: "hsl(280, 60%, 55%)" },
      { name: "ריבית ועמלות", value: Math.max(0, interestFees), color: "hsl(15, 85%, 55%)" },
    ].filter(d => d.value > 0);
  }, [payload, feesAndLinkage]);

  // Payment history (actuals from recent_payments) + 24-month forecast based on current track PMTs
  const paymentHistoryAndForecast = useMemo(() => {
    if (!payload) return [] as { label: string; actual?: number; forecastPrincipal?: number; forecastInterest?: number; forecastTotal?: number }[];
    const today = parseDate(payload.report_date) || new Date();
    const out: { label: string; actual?: number; forecastPrincipal?: number; forecastInterest?: number; forecastTotal?: number }[] = [];
    paymentHistory.forEach(p => {
      out.push({
        label: `${String(p.date.getMonth() + 1).padStart(2, "0")}/${String(p.date.getFullYear()).slice(-2)}`,
        actual: Math.round(p.amount),
      });
    });
    // Forecast 24 months ahead — sum each track's monthly principal/interest
    // from trackAmortizations (which already accounts for station rate changes).
    const last = paymentHistory.length
      ? new Date(paymentHistory[paymentHistory.length - 1].date)
      : new Date(today);
    const offsetMonths = monthsBetween(today, last) + 1; // first forecast month index in trackAmortizations
    for (let i = 0; i < 24; i++) {
      const d = new Date(last);
      d.setMonth(d.getMonth() + i + 1);
      const mIdx = offsetMonths + i; // 1-based month relative to "today"
      let pSum = 0, iSum = 0;
      trackAmortizations.forEach(steps => {
        const step = steps[mIdx - 1];
        if (step) { pSum += step.principal; iSum += step.interest; }
      });
      const total = pSum + iSum;
      out.push({
        label: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`,
        forecastPrincipal: Math.round(pSum),
        forecastInterest: Math.round(iSum),
        forecastTotal: Math.round(total),
      });
    }
    return out;
  }, [payload, paymentHistory, trackAmortizations]);

  // ============ Stacked-area debt amortization series ============
  // For each future month: remaining principal + remaining future interest
  // (sum of all interest payments still to be made). Sampled every 6 months.
  const debtAmortizationSeries = useMemo(() => {
    if (!payload) return [] as { year: number; principal: number; interest: number }[];
    const today = parseDate(payload.report_date) || new Date();
    const maxMonths = Math.max(0, ...trackAmortizations.map(s => s.length));
    if (maxMonths === 0) return [];
    // Pre-compute cumulative-interest-from-end per track for O(1) lookups
    const futureInterestByTrack: number[][] = trackAmortizations.map(steps => {
      const fi = new Array(steps.length + 1).fill(0);
      for (let m = steps.length - 1; m >= 0; m--) fi[m] = fi[m + 1] + steps[m].interest;
      return fi;
    });
    const out: { year: number; principal: number; interest: number }[] = [];
    for (let m = 0; m <= maxMonths; m += 6) {
      let principal = 0, interest = 0;
      trackAmortizations.forEach((steps, idx) => {
        if (steps.length === 0) return;
        const stepIdx = Math.min(m, steps.length) - 1;
        const balance = stepIdx < 0
          ? (tracksEnriched[idx]?._balance || 0)
          : (steps[stepIdx]?.balance || 0);
        principal += balance;
        const fi = futureInterestByTrack[idx];
        interest += fi[Math.min(m, fi.length - 1)] || 0;
      });
      const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
      out.push({
        year: d.getFullYear() + d.getMonth() / 12,
        principal: Math.round(principal),
        interest: Math.round(interest),
      });
      if (principal <= 0 && interest <= 0) break;
    }
    return out;
  }, [payload, trackAmortizations, tracksEnriched]);

  // ============ Monthly amortization schedule (forecast across all tracks) ============
  const amortSchedule = useMemo(() => {
    if (!payload) return [] as { label: string; principal: number; interest: number; payment: number; principalPct: number; balance: number }[];
    const today = parseDate(payload.report_date) || new Date();
    const HE_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
    const out: { label: string; principal: number; interest: number; payment: number; principalPct: number; balance: number }[] = [];
    const maxMonths = Math.max(0, ...trackAmortizations.map(s => s.length));
    for (let m = 1; m <= maxMonths; m++) {
      let interestSum = 0, principalSum = 0, balSum = 0;
      trackAmortizations.forEach(steps => {
        const step = steps[m - 1];
        if (step) {
          interestSum += step.interest;
          principalSum += step.principal;
          balSum += step.balance;
        }
      });
      const payment = interestSum + principalSum;
      if (payment <= 0) break;
      const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
      out.push({
        label: `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        principal: Math.round(principalSum),
        interest: Math.round(interestSum),
        payment: Math.round(payment),
        principalPct: payment > 0 ? (principalSum / payment) * 100 : 0,
        balance: Math.round(balSum),
      });
    }
    return out;
  }, [payload, trackAmortizations]);



  // ============ Personalized rate strings (for macro KPI cards) ============
  const personalRates = useMemo(() => {
    const findByCat = (cat: string) =>
      tracksEnriched.find(t => t._category === cat && t._rate != null);
    const fmtPersonal = (t: any) => {
      const str = (t as any).annual_interest_rate_string;
      const r = t._rate != null ? `${t._rate.toFixed(2)}%` : "—";
      return str ? `${r} (${str})` : r;
    };
    const prime = findByCat("prime");
    const variable = findByCat("variable");
    return {
      prime: prime ? fmtPersonal(prime) : null,
      variable: variable ? fmtPersonal(variable) : null,
    };
  }, [tracksEnriched]);

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
          {(() => {
            const totalWith = Number(latest.total_balance_with_fees) || Number(payload.total_mortgage_balance_with_fees) || tracksEnriched.reduce((s, t) => s + t._balance, 0);
            const totalWithout = Number(latest.total_balance_without_fees) || Number(payload.total_mortgage_balance_without_fees) || totalWith;
            const penalty = Math.max(0, totalWith - totalWithout);
            return (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <KpiCard
                    icon={<Wallet className="h-4 w-4" />}
                    label="סך יתרה לסילוק"
                    value={fmtILS(totalWith)}
                    sub={`ללא קנסות: ${fmtILS(totalWithout)}`}
                  />
                  <KpiCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    label="החזר חודשי אחרון"
                    value={lastMonthlyPayment > 0 ? fmtILS(lastMonthlyPayment) : "—"}
                    sub={
                      paymentHistory.length
                        ? `לחודש ${String(paymentHistory[paymentHistory.length - 1].date.getMonth() + 1).padStart(2, "0")}/${paymentHistory[paymentHistory.length - 1].date.getFullYear()} • משוער: ${fmtILS(totalPMT)}`
                        : `משוער: ${fmtILS(totalPMT)}`
                    }
                  />
                  <KpiCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    label="החזר חודשי משוער (לפי מסלולים)"
                    value={fmtILS(totalPMT)}
                    sub={`${tracksEnriched.length} מסלולים פעילים`}
                  />
                  <KpiCard
                    icon={<Flame className="h-4 w-4" />}
                    label='סה"כ עמלות והצמדה'
                    value={fmtILS(feesAndLinkage.total)}
                    sub={`הצמדה: ${fmtILS(feesAndLinkage.linkage)} • פירעון מוקדם: ${fmtILS(feesAndLinkage.prepayment)}`}
                  />
                </div>

                {/* Live macro-economic data cards (fetched daily) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-3">
                  <MacroCard
                    label="ריבית בנק ישראל"
                    value={market ? `${market.boiRate.toFixed(2)}%` : "…"}
                    sub={market ? `ריבית פריים: ${market.primeRate.toFixed(2)}%` : ""}
                    personal={personalRates.prime ? `המסלול שלך: ${personalRates.prime}` : null}
                    fetchedAt={market?.fetchedAt}
                  />
                  <MacroCard
                    label="מדד המחירים לצרכן"
                    value={market ? `${market.cpi.toFixed(2)}%` : "…"}
                    sub="שינוי שנתי"
                    fetchedAt={market?.fetchedAt}
                  />
                  <MacroCard
                    label='מדד תשואות האג"ח / עוגן'
                    value={market ? `${market.bondYield.toFixed(2)}%` : "…"}
                    sub="תשואה ממוצעת"
                    personal={personalRates.variable ? `המסלול שלך: ${personalRates.variable}` : null}
                    fetchedAt={market?.fetchedAt}
                  />
                </div>

                {/* "What If" simulation control — variable-rate station re-pricing */}
                <Card className="mt-3 border-primary/20 bg-primary/5">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <Label htmlFor="anchor-rate" className="text-sm font-semibold">
                        ריבית עוגן נוכחית בשוק (%)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        מתעדכן ידנית — משפיע על תחזית מסלולים משתנים מהתחנה הקרובה ואילך.
                        החזר חדש = עוגן + מרווח קבוע (מתוך נתוני הבנק).
                      </p>
                    </div>
                    <Input
                      id="anchor-rate"
                      type="number"
                      step="0.05"
                      value={marketAnchorRate}
                      onChange={(e) => setMarketAnchorRate(parseFloat(e.target.value) || 0)}
                      className="w-32 text-center font-mono text-base"
                      dir="ltr"
                    />
                  </CardContent>
                </Card>

                {penalty > 0 && (
                  <Card className="border-amber-500/40 bg-amber-500/5 mt-4">
                    <CardContent className="p-4 flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <div className="text-sm">
                        <span className="font-semibold">קנס פירעון מוקדם:</span>{" "}
                        <span className="text-amber-700 dark:text-amber-400 font-bold">
                          {fmtILS(penalty)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}

          {/* (Refinance & risk section removed per product update) */}

          {/* ===== New: Payment History & Forecast + Balance Breakdown ===== */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">היסטוריית תשלומים ותחזית</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={paymentHistoryAndForecast} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}K`} />
                      <RTooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row: any = payload[0].payload;
                          const total = row.actual ?? row.forecastTotal ?? 0;
                          return (
                            <div dir="rtl" className="rounded-md border bg-background shadow-md p-3 text-xs space-y-1 min-w-[180px]">
                              <div className="font-semibold border-b pb-1">{label}</div>
                              {row.actual != null && (
                                <div className="flex justify-between"><span>בפועל</span><span className="font-mono">{fmtILS(row.actual)}</span></div>
                              )}
                              {row.forecastPrincipal != null && (
                                <>
                                  <div className="flex justify-between"><span style={{ color: "hsl(150, 60%, 40%)" }}>תשלום קרן</span><span className="font-mono">{fmtILS(row.forecastPrincipal)}</span></div>
                                  <div className="flex justify-between"><span style={{ color: "hsl(15, 85%, 55%)" }}>תשלום ריבית</span><span className="font-mono">{fmtILS(row.forecastInterest || 0)}</span></div>
                                </>
                              )}
                              <div className="flex justify-between border-t pt-1 font-semibold"><span>סה"כ החזר</span><span className="font-mono">{fmtILS(total)}</span></div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="actual" stackId="hist" fill="hsl(200, 75%, 50%)" name="בפועל" />
                      <Bar dataKey="forecastPrincipal" stackId="fc" fill="hsl(150, 60%, 40%)" name="תשלום קרן (תחזית)" />
                      <Bar dataKey="forecastInterest" stackId="fc" fill="hsl(15, 85%, 55%)" name="תשלום ריבית (תחזית)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-center">היסטוריה (כחול) • תחזית מפוצלת לקרן (ירוק) וריבית (כתום)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">הרכב היתרה הנוכחית</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {balanceBreakdownData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">אין נתוני פירוק יתרה</div>
                  ) : (
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={balanceBreakdownData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                          {balanceBreakdownData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                        </Pie>
                        <RTooltip formatter={(v: number) => fmtILS(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">התפלגות חוב ותחזית סילוק</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer>
                    <AreaChart data={debtAmortizationSeries}>
                      <defs>
                        <linearGradient id="grad-principal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(200, 75%, 50%)" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="hsl(200, 75%, 50%)" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="grad-interest" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(15, 85%, 55%)" stopOpacity={0.75} />
                          <stop offset="100%" stopColor="hsl(15, 85%, 55%)" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v.toFixed(0)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                      <RTooltip
                        formatter={(v: number, name: string) => [fmtILS(v), name]}
                        labelFormatter={(v: number) => `שנה ${v.toFixed(1)}`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area
                        type="monotone"
                        dataKey="principal"
                        stackId="debt"
                        name="יתרת קרן"
                        stroke="hsl(200, 75%, 50%)"
                        fill="url(#grad-principal)"
                      />
                      <Area
                        type="monotone"
                        dataKey="interest"
                        stackId="debt"
                        name='יתרת ריבית עתידית'
                        stroke="hsl(15, 85%, 55%)"
                        fill="url(#grad-interest)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-center">קרן (תחתון, כחול) + ריבית עתידית (עליון, כתום) — סה"כ עלות ההלוואה לאורך זמן</p>
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
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={paymentTimeline.rows} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                    <RTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row: any = payload[0].payload;
                        const changes: string[] = row?._changes || [];
                        const delta = row?._delta || 0;
                        return (
                          <div dir="rtl" className="rounded-md border bg-background shadow-md p-3 text-xs space-y-1.5 min-w-[220px]">
                            <div className="font-semibold border-b pb-1">{label} • סה"כ {fmtILS(Number(row?.total) || 0)}</div>
                            {payload.map((p: any, i) => p.value > 0 && (
                              <div key={i} className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.fill }} />
                                  {p.name}
                                </span>
                                <span className="font-mono">{fmtILS(Number(p.value))}</span>
                              </div>
                            ))}
                            {row?._flagged && (
                              <div className="border-t pt-1.5 mt-1.5 space-y-0.5">
                                <div className={`font-semibold ${delta > 0 ? "text-red-600" : "text-green-600"}`}>
                                  שינוי: {delta > 0 ? "+" : ""}{fmtILS(delta)}
                                </div>
                                {changes.length > 0 ? changes.map((c, i) => (
                                  <div key={i} className="text-muted-foreground">• {c}</div>
                                )) : (
                                  <div className="text-muted-foreground">סיום של מסלול אחד או יותר</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {paymentTimeline.keys.map((k, i) => {
                      const colorMap: Record<string, string> = {
                        "ריבית פריים": "hsl(15, 85%, 55%)",
                        "ריבית קבועה": "hsl(200, 75%, 50%)",
                        "ריבית משתנה": "hsl(35, 90%, 55%)",
                        "צמוד מדד": "hsl(280, 60%, 55%)",
                      };
                      const isLast = i === paymentTimeline.keys.length - 1;
                      return (
                        <Bar key={k} dataKey={k} stackId="pmt" fill={colorMap[k] || "hsl(150,60%,45%)"}>
                          {isLast && (
                            <LabelList
                              dataKey="total"
                              position="top"
                              content={(props: any) => {
                                const { x, y, width, value, index } = props;
                                const row = paymentTimeline.rows[index];
                                if (!value) return null;
                                const flagged = row?._flagged;
                                return (
                                  <g>
                                    <text
                                      x={x + width / 2}
                                      y={y - 6}
                                      textAnchor="middle"
                                      style={{ fontSize: 10, fill: "hsl(var(--foreground))", fontWeight: 600 }}
                                    >
                                      {fmtNum(Number(value))}
                                    </text>
                                    {flagged && (
                                      <circle cx={x + width / 2} cy={y - 18} r={4} fill="hsl(15, 85%, 55%)" stroke="white" strokeWidth={1.5} />
                                    )}
                                  </g>
                                );
                              }}
                            />
                          )}
                        </Bar>
                      );
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ===== Amortization Schedule ===== */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">לוח סילוקין צפוי</CardTitle>
            </CardHeader>
            <CardContent>
              {amortSchedule.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">לא ניתן לחשב לוח סילוקין (חסרים נתוני ריבית).</p>
              ) : (
                <div className="max-h-[440px] overflow-y-auto overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-right whitespace-nowrap">חודש</TableHead>
                        <TableHead className="text-center whitespace-nowrap">תשלום קרן</TableHead>
                        <TableHead className="text-center whitespace-nowrap">תשלום ריבית</TableHead>
                        <TableHead className="text-center whitespace-nowrap">% קרן בתשלום</TableHead>
                        <TableHead className="text-center whitespace-nowrap">יתרה לסוף החודש</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {amortSchedule.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-right whitespace-nowrap text-xs">{r.label}</TableCell>
                          <TableCell className="text-center whitespace-nowrap">{fmtILS(r.principal)}</TableCell>
                          <TableCell className="text-center whitespace-nowrap">{fmtILS(r.interest)}</TableCell>
                          <TableCell className="text-center whitespace-nowrap">{r.principalPct.toFixed(1)}%</TableCell>
                          <TableCell className="text-center whitespace-nowrap font-medium">{fmtILS(r.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ===== Rate Matrix per category ===== */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                מטריצת ריביות לפי מסלול
                <span className="text-xs font-normal text-muted-foreground">(החזר מבוסס על נתוני ה-JSON בלבד)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {missingDataTracks.length > 0 && (
                <div className="mb-3 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {missingDataTracks.length} מסלולים חסרים גם <b>ריבית</b> וגם <b>monthly_payment</b> ב-JSON, ולכן לא נכללים בהחזר החודשי. סה"כ יתרה לא מחושבת: {fmtILS(missingDataTracks.reduce((s, t) => s + t._balance, 0))}.
                  </span>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מסלול</TableHead>
                      <TableHead className="text-center">סך יתרה</TableHead>
                      <TableHead className="text-center">ריבית ממוצעת (משוקללת)</TableHead>
                      <TableHead className="text-center">ריבית שוק להשוואה</TableHead>
                      <TableHead className="text-center">פער</TableHead>
                      <TableHead className="text-center">החזר חודשי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateMatrix.map(row => {
                      const diff = row.avgRate != null ? row.avgRate - row.marketRate : null;
                      const isOpen = !!expandedCats[row.category];
                      return (
                        <React.Fragment key={row.category}>
                          <TableRow
                            className="font-medium cursor-pointer hover:bg-muted/40"
                            onClick={() => setExpandedCats(s => ({ ...s, [row.category]: !s[row.category] }))}
                          >
                            <TableCell className="text-right">
                              <div className="flex items-center gap-2">
                                {isOpen
                                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  : <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[row.category as keyof typeof COLORS] }} />
                                {row.label}
                                <Badge variant="outline" className="text-[10px]">{row.tracks.length}</Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap">{fmtILS(row.balance)}</TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              {row.avgRate != null ? fmtPct(row.avgRate) : <span className="text-muted-foreground text-xs">חסר</span>}
                              {row.missingRateBalance > 0 && row.avgRate != null && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                  ל-{fmtILS(row.missingRateBalance)} חסרה ריבית
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap text-muted-foreground">{fmtPct(row.marketRate)}</TableCell>
                            <TableCell className="text-center whitespace-nowrap">
                              {diff == null ? "—" : (
                                <Badge variant={diff < 0 ? "default" : "destructive"} className="text-[10px]">
                                  {diff > 0 ? "+" : ""}{diff.toFixed(2)}%
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center whitespace-nowrap font-semibold">{fmtILS(row.pmt)}</TableCell>
                          </TableRow>
                          {isOpen && row.tracks.map((sub, i) => (
                            <TableRow key={`${row.category}-${i}`} className="text-xs text-muted-foreground bg-muted/20">
                              <TableCell className="text-right pr-8">↳ {sub.name} <span className="text-[10px]">(הלוואה {sub.loanId.slice(-4)})</span></TableCell>
                              <TableCell className="text-center">{fmtILS(sub.balance)}</TableCell>
                              <TableCell className="text-center">{sub.rate != null ? fmtPct(sub.rate) : <span className="text-amber-600 dark:text-amber-400">חסר</span>}</TableCell>
                              <TableCell className="text-center">—</TableCell>
                              <TableCell className="text-center">—</TableCell>
                              <TableCell className="text-center">{sub.pmt > 0 ? fmtILS(sub.pmt) : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    <TableRow className="font-bold border-t-2">
                      <TableCell className="text-right">סה"כ</TableCell>
                      <TableCell className="text-center">{fmtILS(rateMatrix.reduce((s, r) => s + r.balance, 0))}</TableCell>
                      <TableCell className="text-center">—</TableCell>
                      <TableCell className="text-center">—</TableCell>
                      <TableCell className="text-center">—</TableCell>
                      <TableCell className="text-center">{fmtILS(rateMatrix.reduce((s, r) => s + r.pmt, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
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
                  const loanLastPmt = (loan.recent_payments || []).length > 0
                    ? Number((loan.recent_payments as RecentPayment[])[0]?.amount) || 0
                    : 0;
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
                            <div className="text-xs text-muted-foreground">
                              {loan.bank || ""}{loan.bank ? " • " : ""}{(loan.tracks || []).length} מסלולים
                              {loan.start_date ? ` • התחלה: ${loan.start_date}` : ""}
                            </div>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div className="text-left">
                              <div className="text-xs text-muted-foreground">יתרה</div>
                              <div className="font-bold">{fmtILS(totBal)}</div>
                            </div>
                            <div className="text-left">
                              <div className="text-xs text-muted-foreground">החזר אחרון</div>
                              <div className="font-bold">{loanLastPmt > 0 ? fmtILS(loanLastPmt) : fmtILS(totPMT)}</div>
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
                                  <TableHead className="text-center whitespace-nowrap">סכום מקורי</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">יתרה נוכחית</TableHead>
                                  <TableHead className="text-right whitespace-nowrap">הרכב הריבית</TableHead>
                                  <TableHead className="text-center whitespace-nowrap">תאריך סיום</TableHead>
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
                                  const origAmt = Number(t.original_amount ?? t.track_original_amount) || 0;
                                  const rateStr = (t as any).annual_interest_rate_string || (t._rate != null ? fmtPct(t._rate) : "—");
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
                                      <TableCell className="text-center text-xs whitespace-nowrap">{origAmt > 0 ? fmtILS(origAmt) : "—"}</TableCell>
                                      <TableCell className="text-center font-medium whitespace-nowrap">{fmtILS(t._balance)}</TableCell>
                                      <TableCell className="text-right text-xs whitespace-nowrap max-w-[260px] truncate" title={rateStr}>
                                        {rateStr}
                                      </TableCell>
                                      <TableCell className="text-center text-xs whitespace-nowrap">
                                        {end ? end.toLocaleDateString("he-IL") : "—"}
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
                    {snapshots.map(s => {
                      const w = Number(s.total_balance_with_fees) || Number(s.payload?.total_mortgage_balance_with_fees) || 0;
                      const wo = Number(s.total_balance_without_fees) || Number(s.payload?.total_mortgage_balance_without_fees) || 0;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>{(parseDate(s.report_date) || new Date()).toLocaleDateString("he-IL")}</TableCell>
                          <TableCell className="text-center">{fmtILS(wo)}</TableCell>
                          <TableCell className="text-center">{fmtILS(w)}</TableCell>
                          <TableCell className="text-center">
                            <Button size="icon" variant="ghost" onClick={() => { if (confirm("למחוק את התמונה?")) deleteMutation.mutate(s.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
              הדבק נתוני משכנתא בפורמט JSON. תאריכים נתמכים: dd.mm.yyyy, dd/mm/yyyy או yyyy-mm-dd. אם הסכומים הכוללים חסרים — יחושבו אוטומטית מהמסלולים.
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

function MacroCard({ label, value, sub, personal, fetchedAt }: { label: string; value: string; sub?: string; personal?: string | null; fetchedAt?: string }) {
  return (
    <Card className="bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-900/40">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 text-blue-900/80 dark:text-blue-200/80 text-xs mb-2">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span>{label}</span>
          </div>
          {fetchedAt && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(fetchedAt).toLocaleDateString("he-IL")}
            </span>
          )}
        </div>
        <div className="text-xl sm:text-2xl font-bold tracking-tight">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
        {personal && (
          <div className="text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t border-blue-200/50 dark:border-blue-900/40 truncate" title={personal}>
            {personal}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
