import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, AlertCircle, Calculator } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

// ===== Daily market data (snapshot) =====
// Updated daily; replace as needed. Annual % rates.
export const MARKET_DATA = {
  asOf: "2026-05-01",
  boiRate: 4.5,        // ריבית בנק ישראל
  primeRate: 6.0,      // פריים = בנק ישראל + 1.5
  cpiAnnual: 2.8,      // מדד שנתי משוער
};

type TrackType = "פריים" | "קבועה לא צמודה" | "קבועה צמודה" | "משתנה לא צמודה" | "משתנה צמודה";
type Schedule = "שפיצר" | "קרן שווה";

interface Track {
  id: string;
  type: TrackType;
  schedule: Schedule;
  pct: number; // percent of total mortgage
  months: number;
  rate: number; // annual %
}

interface Mix {
  id: string;
  name: string;
  tracks: Track[];
}

const TRACK_TYPES: TrackType[] = ["פריים", "קבועה לא צמודה", "קבועה צמודה", "משתנה לא צמודה", "משתנה צמודה"];
const SCHEDULES: Schedule[] = ["שפיצר", "קרן שווה"];
const TRACK_COLORS = ["hsl(var(--primary))", "hsl(217 91% 60%)", "hsl(142 71% 45%)", "hsl(38 92% 50%)", "hsl(280 65% 60%)", "hsl(346 87% 53%)"];

const fmt = (n: number) => Math.round(n).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
const uid = () => Math.random().toString(36).slice(2, 10);

// Number input with thousands separators
function NumberInput({ value, onChange, className, placeholder }: { value: number; onChange: (n: number) => void; className?: string; placeholder?: string }) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      dir="ltr"
      className={className}
      placeholder={placeholder}
      value={value ? fmtNum(value) : ""}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        onChange(raw ? Number(raw) : 0);
      }}
    />
  );
}

function defaultRateFor(type: TrackType): number {
  switch (type) {
    case "פריים": return MARKET_DATA.primeRate - 0.5;
    case "קבועה לא צמודה": return 4.8;
    case "קבועה צמודה": return 3.6;
    case "משתנה לא צמודה": return 4.5;
    case "משתנה צמודה": return 3.8;
  }
}

function isLinked(type: TrackType): boolean {
  return type === "קבועה צמודה" || type === "משתנה צמודה";
}

// ===== Amortization =====
interface MonthRow { month: number; payment: number; principal: number; interest: number; balance: number; }

function amortize(track: Track, amount: number): MonthRow[] {
  const rows: MonthRow[] = [];
  const r = track.rate / 100 / 12;
  const n = track.months;
  let balance = amount;
  if (n <= 0 || amount <= 0) return rows;

  if (track.schedule === "שפיצר") {
    const pmt = r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
    for (let i = 1; i <= n; i++) {
      const interest = balance * r;
      const principal = pmt - interest;
      balance = Math.max(0, balance - principal);
      rows.push({ month: i, payment: pmt, principal, interest, balance });
    }
  } else {
    const principal = amount / n;
    for (let i = 1; i <= n; i++) {
      const interest = balance * r;
      const payment = principal + interest;
      balance = Math.max(0, balance - principal);
      rows.push({ month: i, payment, principal, interest, balance });
    }
  }
  if (isLinked(track.type)) {
    const monthlyCpi = MARKET_DATA.cpiAnnual / 100 / 12;
    let infFactor = 1;
    for (const row of rows) {
      infFactor *= 1 + monthlyCpi;
      row.balance = row.balance * infFactor;
      row.payment = row.payment * infFactor;
      row.principal = row.principal * infFactor;
      row.interest = row.interest * infFactor;
    }
  }
  return rows;
}

function emptyTrack(): Track {
  return { id: uid(), type: "פריים", schedule: "שפיצר", pct: 0, months: 240, rate: defaultRateFor("פריים") };
}

function defaultMix(name: string): Mix {
  return { id: uid(), name, tracks: [emptyTrack()] };
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export default function MortgageCalculator({ open, onOpenChange }: Props) {
  const [propertyValue, setPropertyValue] = useState<number>(2000000);
  const [mortgageAmount, setMortgageAmount] = useState<number>(1400000);
  const [income, setIncome] = useState<number>(0);
  const [mixes, setMixes] = useState<Mix[]>([defaultMix("תמהיל א")]);
  const [activeMixId, setActiveMixId] = useState<string>(mixes[0].id);

  const activeMix = mixes.find(m => m.id === activeMixId) ?? mixes[0];
  const financingPct = propertyValue > 0 ? (mortgageAmount / propertyValue) * 100 : 0;

  const updateMix = (id: string, fn: (m: Mix) => Mix) => {
    setMixes(prev => prev.map(m => m.id === id ? fn(m) : m));
  };

  const addMix = () => {
    const name = `תמהיל ${String.fromCharCode(1488 + mixes.length)}`; // א, ב, ג...
    const m = defaultMix(name);
    setMixes(prev => [...prev, m]);
    setActiveMixId(m.id);
  };

  const removeMix = (id: string) => {
    if (mixes.length <= 1) return;
    setMixes(prev => prev.filter(m => m.id !== id));
    if (activeMixId === id) setActiveMixId(mixes[0].id);
  };

  const addTrack = () => updateMix(activeMix.id, m => ({ ...m, tracks: [...m.tracks, emptyTrack()] }));
  const removeTrack = (tid: string) => updateMix(activeMix.id, m => ({ ...m, tracks: m.tracks.filter(t => t.id !== tid) }));
  const patchTrack = (tid: string, patch: Partial<Track>) => updateMix(activeMix.id, m => ({
    ...m,
    tracks: m.tracks.map(t => t.id === tid ? { ...t, ...patch } : t),
  }));

  const sumPct = activeMix.tracks.reduce((s, t) => s + (t.pct || 0), 0);
  const sumTracks = (sumPct / 100) * mortgageAmount;
  const tracksMatch = Math.abs(sumPct - 100) < 0.01;

  // ===== Computed per active mix =====
  const computed = useMemo(() => {
    return computeMix(activeMix, mortgageAmount);
  }, [activeMix, mortgageAmount]);

  // ===== Comparison summary across mixes =====
  const comparison = useMemo(() => {
    return mixes.map(m => {
      const c = computeMix(m, mortgageAmount);
      const total = c.totalPayment;
      const principal = m.tracks.reduce((s, t) => s + trackAmount(t, mortgageAmount), 0);
      return {
        id: m.id,
        name: m.name,
        initialMonthly: c.initialMonthly,
        totalPayment: total,
        costPerShekel: principal > 0 ? total / principal : 0,
        principal,
      };
    });
  }, [mixes, mortgageAmount]);

  // ===== Charts data =====
  const yearlyStacked = useMemo(() => {
    const maxMonths = Math.max(0, ...activeMix.tracks.map(t => t.months));
    const years = Math.ceil(maxMonths / 12);
    const data: any[] = [];
    for (let y = 1; y <= years; y++) {
      const row: any = { year: `שנה ${y}` };
      activeMix.tracks.forEach((t, i) => {
        const startM = (y - 1) * 12 + 1;
        const rows = computed.perTrack[i] || [];
        const monthRow = rows.find(r => r.month === startM);
        row[t.type + "_" + i] = monthRow ? Math.round(monthRow.payment) : 0;
      });
      data.push(row);
    }
    return data;
  }, [activeMix, computed]);

  const balanceLine = useMemo(() => {
    const maxMonths = Math.max(0, ...activeMix.tracks.map(t => t.months));
    const data: any[] = [];
    const step = Math.max(1, Math.floor(maxMonths / 60));
    for (let m = 0; m <= maxMonths; m += step) {
      let bal = 0;
      activeMix.tracks.forEach((t, i) => {
        const rows = computed.perTrack[i] || [];
        if (m === 0) bal += trackAmount(t, mortgageAmount);
        else {
          const r = rows.find(rr => rr.month === m);
          if (r) bal += r.balance;
        }
      });
      data.push({ month: m, balance: Math.round(bal) });
    }
    return data;
  }, [activeMix, computed]);

  const mixPie = activeMix.tracks
    .filter(t => t.amount > 0)
    .map((t, i) => ({ name: t.type, value: t.amount, color: TRACK_COLORS[i % TRACK_COLORS.length] }));

  const principalVsInterest = [
    { name: "קרן", value: Math.round(computed.totalPrincipal), color: "hsl(var(--primary))" },
    { name: "ריבית", value: Math.round(computed.totalInterest), color: "hsl(346 87% 53%)" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-[95vw] lg:max-w-[1400px] max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Calculator className="h-5 w-5 text-primary" />
            מחשבון משכנתא
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            נתוני שוק ({MARKET_DATA.asOf}): פריים {MARKET_DATA.primeRate}% · בנק ישראל {MARKET_DATA.boiRate}% · מדד שנתי {MARKET_DATA.cpiAnnual}%
          </p>
        </DialogHeader>

        {/* Mix tabs */}
        <div className="px-6">
          <div className="flex items-center gap-2 flex-wrap border-b pb-2">
            {mixes.map(m => (
              <div key={m.id} className="flex items-center">
                <button
                  onClick={() => setActiveMixId(m.id)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    activeMixId === m.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                  }`}
                >
                  {m.name}
                </button>
                {mixes.length > 1 && (
                  <button onClick={() => removeMix(m.id)} className="text-muted-foreground hover:text-destructive p-1" aria-label="הסר תמהיל">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addMix}>
              <Plus className="h-4 w-4 ml-1" /> הוסף תמהיל
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 p-6 pt-4">
          {/* ===== LEFT: Inputs ===== */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">פרטים כלליים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>שווי נכס</Label>
                    <Input type="number" value={propertyValue || ""} onChange={e => setPropertyValue(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>סכום משכנתא</Label>
                    <Input type="number" value={mortgageAmount || ""} onChange={e => setMortgageAmount(Number(e.target.value))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>אחוז מימון</Label>
                    <div className={`h-10 px-3 flex items-center rounded-md border text-sm font-medium ${
                      financingPct > 75 ? "border-destructive text-destructive" : "border-input"
                    }`}>
                      {financingPct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <Label>הכנסה פנויה (לא חובה)</Label>
                    <Input type="number" value={income || ""} onChange={e => setIncome(Number(e.target.value))} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between">
                <CardTitle className="text-base">בונה מסלולים — {activeMix.name}</CardTitle>
                <Button size="sm" variant="outline" onClick={addTrack}>
                  <Plus className="h-4 w-4 ml-1" /> מסלול
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeMix.tracks.map((t, idx) => (
                  <div key={t.id} className="rounded-lg border p-3 space-y-2 bg-card" style={{ borderRightWidth: 4, borderRightColor: TRACK_COLORS[idx % TRACK_COLORS.length] }}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">סוג מסלול</Label>
                        <Select value={t.type} onValueChange={(v: TrackType) => patchTrack(t.id, { type: v, rate: defaultRateFor(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TRACK_TYPES.map(tt => <SelectItem key={tt} value={tt}>{tt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">לוח סילוקין</Label>
                        <Select value={t.schedule} onValueChange={(v: Schedule) => patchTrack(t.id, { schedule: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SCHEDULES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">סכום</Label>
                        <Input type="number" value={t.amount || ""} onChange={e => patchTrack(t.id, { amount: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs">תקופה (חודשים)</Label>
                        <Input type="number" value={t.months || ""} onChange={e => patchTrack(t.id, { months: Number(e.target.value) })} />
                        <span className="text-[10px] text-muted-foreground">{(t.months / 12).toFixed(1)} שנים</span>
                      </div>
                      <div>
                        <Label className="text-xs">ריבית %</Label>
                        <Input type="number" step="0.01" value={t.rate || ""} onChange={e => patchTrack(t.id, { rate: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className="text-[10px]">
                        {isLinked(t.type) ? "צמוד מדד" : "לא צמוד"}
                      </Badge>
                      {activeMix.tracks.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeTrack(t.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                <div className={`flex items-center justify-between rounded-md p-3 border ${
                  tracksMatch ? "border-green-500/50 bg-green-500/10" : "border-destructive/50 bg-destructive/10"
                }`}>
                  <div className="flex items-center gap-2 text-sm">
                    {tracksMatch ? <Check className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
                    <span>סך המסלולים: {fmt(sumTracks)} / {fmt(mortgageAmount)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    הפרש: {fmt(mortgageAmount - sumTracks)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ===== RIGHT: Outputs ===== */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">החזר חודשי התחלתי</div><div className="text-lg font-bold">{fmt(computed.initialMonthly)}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">סך החזר כולל</div><div className="text-lg font-bold">{fmt(computed.totalPayment)}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">עלות לכל ₪</div><div className="text-lg font-bold">{computed.totalPrincipal > 0 ? (computed.totalPayment / computed.totalPrincipal).toFixed(2) : "—"}</div></CardContent></Card>
            </div>

            <Tabs defaultValue="payments">
              <TabsList className="w-full">
                <TabsTrigger value="payments" className="flex-1">החזר חודשי</TabsTrigger>
                <TabsTrigger value="balance" className="flex-1">יתרת קרן</TabsTrigger>
                <TabsTrigger value="mix" className="flex-1">חלוקה</TabsTrigger>
                <TabsTrigger value="compare" className="flex-1">השוואה</TabsTrigger>
              </TabsList>

              <TabsContent value="payments">
                <Card><CardContent className="p-3 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyStacked}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "K"} />
                      <RTooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {activeMix.tracks.map((t, i) => (
                        <Bar key={t.id} dataKey={t.type + "_" + i} stackId="a" fill={TRACK_COLORS[i % TRACK_COLORS.length]} name={t.type} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="balance">
                <Card><CardContent className="p-3 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={balanceLine}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 12).toFixed(0) + "ש"} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "K"} />
                      <RTooltip formatter={(v: any) => fmt(Number(v))} labelFormatter={(l) => `חודש ${l}`} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                      <Line type="monotone" dataKey="balance" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="mix">
                <div className="grid grid-cols-2 gap-3">
                  <Card><CardContent className="p-3 h-[280px]">
                    <div className="text-xs font-medium mb-1 text-center">חלוקת תמהיל</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <PieChart>
                        <Pie data={mixPie} dataKey="value" nameKey="name" outerRadius={80} label={(e: any) => `${e.name} ${((e.percent ?? 0) * 100).toFixed(0)}%`}>
                          {mixPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <RTooltip formatter={(v: any) => fmt(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 h-[280px]">
                    <div className="text-xs font-medium mb-1 text-center">קרן מול ריבית</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <PieChart>
                        <Pie data={principalVsInterest} dataKey="value" nameKey="name" outerRadius={80} label={(e: any) => `${e.name} ${((e.percent ?? 0) * 100).toFixed(0)}%`}>
                          {principalVsInterest.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <RTooltip formatter={(v: any) => fmt(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent></Card>
                </div>
              </TabsContent>

              <TabsContent value="compare">
                <Card><CardContent className="p-3 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">תמהיל</TableHead>
                        <TableHead className="text-right">החזר חודשי התחלתי</TableHead>
                        <TableHead className="text-right">סך החזר כולל</TableHead>
                        <TableHead className="text-right">עלות לכל ₪</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparison.map(c => (
                        <TableRow key={c.id} className={c.id === activeMixId ? "bg-muted/50" : ""}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{fmt(c.initialMonthly)}</TableCell>
                          <TableCell>{fmt(c.totalPayment)}</TableCell>
                          <TableCell>{c.costPerShekel.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent></Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function trackAmount(t: Track, mortgageAmount: number) {
  return (t.pct / 100) * mortgageAmount;
}

function computeMix(mix: Mix, mortgageAmount: number) {
  const perTrack = mix.tracks.map(t => amortize(t, trackAmount(t, mortgageAmount)));
  let initialMonthly = 0, totalPayment = 0, totalPrincipal = 0, totalInterest = 0;
  perTrack.forEach((rows) => {
    if (rows[0]) initialMonthly += rows[0].payment;
    rows.forEach(r => {
      totalPayment += r.payment;
      totalPrincipal += r.principal;
      totalInterest += r.interest;
    });
  });
  return { perTrack, initialMonthly, totalPayment, totalPrincipal, totalInterest };
}
