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
  Wallet, Calendar, TrendingUp, AlertCircle, FileJson, Trash2, Loader2, Activity
} from "lucide-react";
import { toast } from "sonner";

// =================== Types ===================
interface MortgageTrack {
  track_code?: string | number;
  track_name?: string;
  track_type?: string; // "fixed" | "prime" | "variable" | "cpi"
  balance?: number;
  balance_with_fees?: number;
  interest_rate?: number;
  first_payment_date?: string;
  end_date?: string;
  original_amount?: number;
  monthly_payment?: number;
}

interface MortgageLoan {
  loan_account_number?: string | number;
  bank?: string;
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
const fmtPct = (n: number) => (n || 0).toFixed(2) + "%";

// Mock daily market data
const MARKET_DATA = {
  primeRate: 6.0,        // BoI prime
  cpiAnnual: 2.8,        // CPI yearly
  fixedAvgRate: 4.8,     // common fixed track
  variableAvgRate: 5.2,  // variable / kalatz mishtana
  fetchedAt: new Date().toISOString(),
};

const getRateForTrack = (track: MortgageTrack): number => {
  if (typeof track.interest_rate === "number" && track.interest_rate > 0) return track.interest_rate;
  const t = (track.track_type || "").toLowerCase();
  if (t.includes("prime")) return MARKET_DATA.primeRate;
  if (t.includes("variable") || t.includes("מש")) return MARKET_DATA.variableAvgRate;
  return MARKET_DATA.fixedAvgRate;
};

const classifyTrack = (track: MortgageTrack): "prime" | "fixed" | "variable" | "cpi" => {
  const blob = `${track.track_type || ""} ${track.track_name || ""} ${track.track_code || ""}`.toLowerCase();
  if (blob.includes("prime") || blob.includes("פריים")) return "prime";
  if (blob.includes("cpi") || blob.includes("מדד") || blob.includes("צמוד")) return "cpi";
  if (blob.includes("variable") || blob.includes("משתנה") || blob.includes("6085")) return "variable";
  return "fixed";
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
      const { error } = await supabase.from("mortgage_snapshots").insert({
        user_id: user!.id,
        property_id: propertyId,
        report_date: payload.report_date,
        total_balance_without_fees: payload.total_mortgage_balance_without_fees,
        total_balance_with_fees: payload.total_mortgage_balance_with_fees,
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
    if (typeof parsed.total_mortgage_balance_with_fees !== "number") {
      toast.error("חסר השדה total_mortgage_balance_with_fees");
      return;
    }
    insertMutation.mutate(parsed);
  };

  const latest = snapshots[0];
  const payload = latest?.payload;

  // ============ Derived calculations ============
  const tracksEnriched = useMemo(() => {
    if (!payload) return [] as Array<MortgageTrack & { _loanId: string; _pmt: number; _months: number; _rate: number; _category: string }>;
    const today = new Date(payload.report_date || new Date());
    const out: any[] = [];
    for (const loan of payload.loans || []) {
      for (const t of loan.tracks || []) {
        const end = t.end_date ? new Date(t.end_date) : null;
        const months = end ? monthsBetween(today, end) : 0;
        const rate = getRateForTrack(t);
        const balance = t.balance_with_fees ?? t.balance ?? 0;
        const pmt = spitzerPMT(balance, rate, months);
        out.push({
          ...t,
          _loanId: String(loan.loan_account_number || ""),
          _pmt: pmt,
          _months: months,
          _rate: rate,
          _category: classifyTrack(t),
        });
      }
    }
    return out;
  }, [payload]);

  const totalPMT = tracksEnriched.reduce((s, t) => s + t._pmt, 0);

  const exposure = useMemo(() => {
    const buckets: Record<string, number> = { prime: 0, cpi: 0, fixed: 0, variable: 0 };
    tracksEnriched.forEach(t => {
      buckets[t._category] = (buckets[t._category] || 0) + (t.balance_with_fees ?? t.balance ?? 0);
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
      if (!t.first_payment_date) return;
      const start = new Date(t.first_payment_date);
      let candidate = new Date(start);
      while (candidate <= today) {
        candidate.setFullYear(candidate.getFullYear() + 5);
      }
      if (!best || candidate < best) best = candidate;
    });
    return best as Date | null;
  }, [tracksEnriched]);

  // Forecast amortization: project total balance month-by-month until 2052
  const amortization = useMemo(() => {
    if (!payload) return [] as { year: number; balance: number; type: "history" | "forecast" }[];
    // Historical
    const hist = [...snapshots]
      .slice()
      .reverse()
      .map(s => ({
        year: new Date(s.report_date).getFullYear() + new Date(s.report_date).getMonth() / 12,
        balance: Number(s.total_balance_with_fees) || 0,
        type: "history" as const,
      }));

    // Project forward per track
    const today = new Date(payload.report_date);
    const horizonEnd = new Date(2052, 11, 31);
    const totalMonths = monthsBetween(today, horizonEnd);
    const trackStates = tracksEnriched.map(t => ({
      balance: t.balance_with_fees ?? t.balance ?? 0,
      rate: t._rate,
      monthsLeft: t._months,
      pmt: t._pmt,
    }));
    const forecast: { year: number; balance: number; type: "forecast" }[] = [];
    for (let m = 1; m <= totalMonths; m++) {
      let totalBal = 0;
      trackStates.forEach(ts => {
        if (ts.monthsLeft > 0 && ts.balance > 0) {
          const r = (ts.rate / 100) / 12;
          const interest = ts.balance * r;
          const principal = Math.min(ts.balance, ts.pmt - interest);
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
    const today = new Date(payload.report_date);
    const horizon = 2052;
    const rows: Record<number, any> = {};
    const keys: string[] = [];
    tracksEnriched.forEach((t, i) => {
      const key = (t.track_name || `מסלול ${i + 1}`) + ` (${t._loanId})`;
      keys.push(key);
      const end = t.end_date ? new Date(t.end_date) : null;
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
              עודכן לאחרונה: {new Date(latest.report_date).toLocaleDateString("he-IL")} • {snapshots.length} תמונות מצב
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

          {/* ===== Section B: Charts ===== */}
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
                  const totBal = loanTracks.reduce((s, t) => s + (t.balance_with_fees ?? t.balance ?? 0), 0);
                  const totPMT = loanTracks.reduce((s, t) => s + t._pmt, 0);
                  return (
                    <AccordionItem key={idx} value={`loan-${idx}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-1 items-center justify-between gap-4 pl-2">
                          <div className="text-right">
                            <div className="font-semibold">הלוואה {loan.loan_account_number}</div>
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
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-right">שם מסלול</TableHead>
                                <TableHead className="text-center">קוד</TableHead>
                                <TableHead className="text-center">תאריך סיום</TableHead>
                                <TableHead className="text-center">יתרה מתואמת</TableHead>
                                <TableHead className="text-center">ריבית</TableHead>
                                <TableHead className="text-center">החזר משוער</TableHead>
                                <TableHead className="text-center w-32">התקדמות</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {loanTracks.map((t, i) => {
                                const start = t.first_payment_date ? new Date(t.first_payment_date) : null;
                                const end = t.end_date ? new Date(t.end_date) : null;
                                const today = new Date();
                                const totalMo = start && end ? monthsBetween(start, end) : 0;
                                const elapsed = start ? monthsBetween(start, today) : 0;
                                const progress = totalMo > 0 ? Math.min(100, (elapsed / totalMo) * 100) : 0;
                                return (
                                  <TableRow key={i}>
                                    <TableCell className="font-medium">
                                      {t.track_name || "—"}
                                      <Badge variant="outline" className="mr-2 text-[10px]" style={{ borderColor: COLORS[t._category as keyof typeof COLORS] }}>
                                        {t._category === "prime" ? "פריים" : t._category === "cpi" ? "מדד" : t._category === "variable" ? "משתנה" : "קבועה"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-center text-xs">{t.track_code ?? "—"}</TableCell>
                                    <TableCell className="text-center text-xs whitespace-nowrap">
                                      {end ? end.toLocaleDateString("he-IL") : "—"}
                                    </TableCell>
                                    <TableCell className="text-center font-medium">{fmtILS(t.balance_with_fees ?? t.balance ?? 0)}</TableCell>
                                    <TableCell className="text-center">{fmtPct(t._rate)}</TableCell>
                                    <TableCell className="text-center font-semibold">{fmtILS(t._pmt)}</TableCell>
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
