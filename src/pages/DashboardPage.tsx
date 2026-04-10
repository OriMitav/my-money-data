import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from "recharts";
import { LayoutDashboard } from "lucide-react";
import { fetchAllPages } from "@/lib/fetchAllPages";

type Transaction = {
  id: string;
  date: string;
  value: number;
  entity_id: string;
  relevant_transaction: boolean;
};

type Entity = {
  id: string;
  name: string;
  type: string;
};

type MonthData = {
  key: string;
  label: string;
  month: number;
  year: number;
  incomes: number;
  expenses: number;
  directDebit: number;
  creditCard: number;
};

const PIE_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(142, 71%, 45%)", "hsl(45, 93%, 47%)",
  "hsl(0, 84%, 60%)", "hsl(280, 67%, 55%)", "hsl(190, 90%, 50%)",
  "hsl(330, 80%, 55%)", "hsl(100, 60%, 45%)", "hsl(25, 95%, 53%)",
  "hsl(200, 60%, 40%)", "hsl(160, 70%, 40%)", "hsl(350, 60%, 50%)",
];

const formatCurrency = (v: number) =>
  `₪${v.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Striped pattern SVG for non-accessible funds
const StripedPattern = ({ id, color }: { id: string; color: string }) => (
  <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
    <rect width="6" height="6" fill={color} fillOpacity={0.3} />
    <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2" />
  </pattern>
);

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: entities } = useQuery({
    queryKey: ["entities", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_entities")
        .select("id, name, type")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as Entity[];
    },
    enabled: !!user,
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions-dashboard", user?.id],
    queryFn: async () => {
      return fetchAllPages<Transaction>(async (from, to) => {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, date, value, entity_id, relevant_transaction")
          .eq("user_id", user!.id)
          .eq("relevant_transaction", true)
          .order("date", { ascending: true })
          .range(from, to);
        return { data: data as Transaction[] | null, error };
      });
    },
    enabled: !!user,
  });

  // Pension funds & entries
  const { data: pensionFunds = [] } = useQuery({
    queryKey: ["pension_funds_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pension_funds")
        .select("*")
        .eq("user_id", user!.id)
        .eq("relevant", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: pensionEntries = [] } = useQuery({
    queryKey: ["pension_entries_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pension_entries")
        .select("*")
        .eq("user_id", user!.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Debts & debt entries
  const { data: debts = [] } = useQuery({
    queryKey: ["debts_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("debts").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: debtEntries = [] } = useQuery({
    queryKey: ["debt_entries_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("debt_entries").select("*").eq("user_id", user!.id)
        .order("year", { ascending: false }).order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const entityMap = useMemo(() => {
    const map: Record<string, Entity> = {};
    entities?.forEach((e) => (map[e.id] = e));
    return map;
  }, [entities]);

  // Aggregate by month
  const allMonthsData = useMemo(() => {
    if (!transactions?.length) return [];
    const map = new Map<string, MonthData>();

    transactions.forEach((t) => {
      const d = new Date(t.date);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const entity = entityMap[t.entity_id];

      if (!map.has(key)) {
        map.set(key, {
          key,
          label: format(new Date(year, month), "MMM yyyy", { locale: he }),
          month,
          year,
          incomes: 0,
          expenses: 0,
          directDebit: 0,
          creditCard: 0,
        });
      }

      const entry = map.get(key)!;
      const absoluteValue = Math.abs(t.value);

      if (t.value > 0) {
        entry.incomes += t.value;
      } else {
        entry.expenses += absoluteValue;
      }

      if (entity?.type === "bank" && t.value < 0) {
        entry.directDebit += absoluteValue;
      } else if (entity?.type === "credit_card") {
        entry.creditCard += absoluteValue;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [transactions, entityMap]);

  // Default to last 12 months
  const defaultSliderRange = useMemo(() => {
    if (!allMonthsData.length) return [0, 100];
    const total = allMonthsData.length;
    const start = Math.max(0, total - 12);
    const startPct = Math.round((start / Math.max(total - 1, 1)) * 100);
    return [startPct, 100];
  }, [allMonthsData.length]);

  const [sliderRange, setSliderRange] = useState<number[] | null>(null);
  const activeRange = sliderRange ?? defaultSliderRange;

  const sliderMax = Math.max(allMonthsData.length - 1, 0);

  const actualRange = useMemo(() => {
    if (!allMonthsData.length) return [0, 0];
    const start = Math.round((activeRange[0] / 100) * sliderMax);
    const end = Math.round((activeRange[1] / 100) * sliderMax);
    return [start, end];
  }, [activeRange, sliderMax, allMonthsData.length]);

  const filteredChartData = useMemo(() => {
    if (!allMonthsData.length) return [];
    return allMonthsData.slice(actualRange[0], actualRange[1] + 1);
  }, [allMonthsData, actualRange]);

  // Monthly summary filtered and sorted descending
  const filteredSummaryData = useMemo(() => {
    return [...filteredChartData].reverse();
  }, [filteredChartData]);

  // --- Pension pie data ---
  const savingsPieData = useMemo(() => {
    return pensionFunds
      .filter((f) => f.type !== "pension")
      .map((fund) => {
        const latestEntry = pensionEntries.find((e) => e.fund_id === fund.id);
        return {
          name: fund.name,
          value: Number(latestEntry?.closing_balance || 0),
          accessible: fund.accessible,
        };
      })
      .filter((d) => d.value > 0);
  }, [pensionFunds, pensionEntries]);

  const pensionPieData = useMemo(() => {
    return pensionFunds
      .filter((f) => f.type === "pension")
      .map((fund) => {
        const latestEntry = pensionEntries.find((e) => e.fund_id === fund.id);
        return {
          name: fund.name,
          value: Number(latestEntry?.closing_balance || 0),
        };
      })
      .filter((d) => d.value > 0);
  }, [pensionFunds, pensionEntries]);

  const totalSavings = savingsPieData.reduce((s, d) => s + d.value, 0) + pensionPieData.reduce((s, d) => s + d.value, 0);
  const totalAccessible = savingsPieData.filter((d) => d.accessible).reduce((s, d) => s + d.value, 0);

  // --- Debt pie data ---
  const debtPieData = useMemo(() => {
    return debts.map((debt) => {
      const latestEntry = debtEntries.find((e) => e.debt_id === debt.id);
      return {
        name: debt.name,
        value: Number(latestEntry?.remaining_balance || debt.total_amount || 0),
      };
    }).filter((d) => d.value > 0);
  }, [debts, debtEntries]);

  const totalDebt = debtPieData.reduce((s, d) => s + d.value, 0);

  // Latest month debt payments
  const debtPaymentsPieData = useMemo(() => {
    if (!debtEntries.length) return [];
    const latestYear = debtEntries[0]?.year;
    const latestMonth = debtEntries[0]?.month;
    const latestMonthEntries = debtEntries.filter((e) => e.year === latestYear && e.month === latestMonth);
    return latestMonthEntries.map((entry) => {
      const debt = debts.find((d) => d.id === entry.debt_id);
      return {
        name: debt?.name || "חוב",
        value: Number(entry.total_paid),
        debtName: debt?.name || "",
      };
    }).filter((d) => d.value > 0);
  }, [debtEntries, debts]);

  const totalMonthlyDebtPayments = debtPaymentsPieData.reduce((s, d) => s + d.value, 0);

  // Color map for debts (consistent between both charts)
  const debtColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    debts.forEach((d, i) => { map[d.name] = PIE_COLORS[i % PIE_COLORS.length]; });
    return map;
  }, [debts]);

  const chart1Config = {
    incomes: { label: "הכנסות", color: "hsl(142, 71%, 45%)" },
    expenses: { label: "הוצאות", color: "hsl(0, 84%, 60%)" },
  };

  const chart2Config = {
    directDebit: { label: "הוראת קבע", color: "hsl(217, 91%, 60%)" },
    creditCard: { label: "כרטיס אשראי", color: "hsl(220, 9%, 46%)" },
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!allMonthsData.length) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">לוח בקרה</h1>
          <p className="text-muted-foreground">סקירה כללית של תזרים המזומנים</p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין נתונים</h3>
            <p className="text-muted-foreground text-sm">העלה דוחות כדי לראות את הגרפים והנתונים</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderCustomLegend = (config: Record<string, { label: string; color: string }>) => (
    <div className="flex items-center justify-center gap-4 mt-2">
      {Object.entries(config).map(([key, { label, color }]) => (
        <div key={key} className="flex items-center gap-1.5 text-xs">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );

  const renderPieLabel = ({ name, percent, value }: { name: string; percent: number; value: number }) => {
    if (percent < 0.05) return null;
    return `${name} ${(percent * 100).toFixed(0)}%`;
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">לוח בקרה</h1>
        <p className="text-sm text-muted-foreground">סקירה כללית של תזרים המזומנים</p>
      </div>

      {/* Main layout: left = summary table, right = filter + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        {/* Left: Monthly Summary Table */}
        <Card className="lg:row-span-2 max-h-[calc(100vh-180px)] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">סיכום חודשי</CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto flex-1 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right sticky top-0 bg-background">חודש</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">הכנסות</TableHead>
                  <TableHead className="text-right sticky top-0 bg-background">הוצאות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaryData.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    <TableCell className="text-green-600 font-medium text-sm">{formatCurrency(row.incomes)}</TableCell>
                    <TableCell className="text-red-600 font-medium text-sm">{formatCurrency(row.expenses)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* Time Range Filter */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">טווח זמן גרפים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{allMonthsData[actualRange[0]]?.label}</span>
                <span>{allMonthsData[actualRange[1]]?.label}</span>
              </div>
              <Slider
                value={activeRange}
                onValueChange={(v) => setSliderRange(v)}
                min={0}
                max={100}
                step={1}
                className="w-full [&_[role=slider]]:rounded-full"
              />
            </CardContent>
          </Card>

          {/* Line Charts */}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">הכנסות מול הוצאות</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chart1Config} className="h-[250px] w-full">
                  <LineChart data={filteredChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                    <Line type="monotone" dataKey="incomes" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 2 }} name="הכנסות" />
                    <Line type="monotone" dataKey="expenses" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={{ r: 2 }} name="הוצאות" />
                  </LineChart>
                </ChartContainer>
                {renderCustomLegend(chart1Config)}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">הוראת קבע מול כרטיס אשראי</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chart2Config} className="h-[250px] w-full">
                  <LineChart data={filteredChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                    <Line type="monotone" dataKey="directDebit" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={{ r: 2 }} name="הוראת קבע" />
                    <Line type="monotone" dataKey="creditCard" stroke="hsl(220, 9%, 46%)" strokeWidth={2} dot={{ r: 2 }} name="כרטיס אשראי" />
                  </LineChart>
                </ChartContainer>
                {renderCustomLegend(chart2Config)}
              </CardContent>
            </Card>
          </div>

          {/* Pie Charts - 2 pairs */}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            {/* Pair 1: Savings + Pension */}
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">התפלגות חסכונות</CardTitle>
                <div className="text-xl font-bold">{formatCurrency(totalSavings)}</div>
                <div className="text-xs text-muted-foreground">הון נגיש: {formatCurrency(totalAccessible)}</div>
              </CardHeader>
              <CardContent>
                {savingsPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <defs>
                        {savingsPieData.map((d, i) => !d.accessible && (
                          <StripedPattern key={d.name} id={`stripe-${i}`} color={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </defs>
                      <Pie data={savingsPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={renderPieLabel} labelLine={false} fontSize={11}>
                        {savingsPieData.map((d, i) => (
                          <Cell key={d.name}
                            fill={d.accessible ? PIE_COLORS[i % PIE_COLORS.length] : `url(#stripe-${i})`}
                            stroke={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={1}
                          />
                        ))}
                      </Pie>
                      <ChartTooltip content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0];
                        const total = savingsPieData.reduce((s, x) => s + x.value, 0);
                        const pct = total > 0 ? ((Number(d.value) / total) * 100).toFixed(1) : "0";
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                            <div className="font-medium">{d.name}</div>
                            <div>{formatCurrency(Number(d.value))} ({pct}%)</div>
                            {!(d.payload as any)?.accessible && <div className="text-muted-foreground">לא נגיש</div>}
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">אין נתוני חסכונות</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">התפלגות פנסיה</CardTitle>
              </CardHeader>
              <CardContent>
                {pensionPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pensionPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={renderPieLabel} labelLine={false} fontSize={11}>
                        {pensionPieData.map((d, i) => (
                          <Cell key={d.name} fill={PIE_COLORS[(i + 4) % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0];
                        const total = pensionPieData.reduce((s, x) => s + x.value, 0);
                        const pct = total > 0 ? ((Number(d.value) / total) * 100).toFixed(1) : "0";
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                            <div className="font-medium">{d.name}</div>
                            <div>{formatCurrency(Number(d.value))} ({pct}%)</div>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">אין נתוני פנסיה</p>
                )}
              </CardContent>
            </Card>

            {/* Pair 2: Debts + Monthly Payments */}
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">התפלגות חובות</CardTitle>
                <div className="text-xl font-bold">{formatCurrency(totalDebt)}</div>
              </CardHeader>
              <CardContent>
                {debtPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={debtPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={renderPieLabel} labelLine={false} fontSize={11}>
                        {debtPieData.map((d) => (
                          <Cell key={d.name} fill={debtColorMap[d.name] || PIE_COLORS[0]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0];
                        const pct = totalDebt > 0 ? ((Number(d.value) / totalDebt) * 100).toFixed(1) : "0";
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                            <div className="font-medium">{d.name}</div>
                            <div>{formatCurrency(Number(d.value))} ({pct}%)</div>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">אין חובות</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">תשלומי חובות - חודש אחרון</CardTitle>
                <div className="text-xl font-bold">{formatCurrency(totalMonthlyDebtPayments)}</div>
              </CardHeader>
              <CardContent>
                {debtPaymentsPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={debtPaymentsPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={renderPieLabel} labelLine={false} fontSize={11}>
                        {debtPaymentsPieData.map((d) => (
                          <Cell key={d.name} fill={debtColorMap[d.name] || PIE_COLORS[0]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0];
                        const pct = totalMonthlyDebtPayments > 0 ? ((Number(d.value) / totalMonthlyDebtPayments) * 100).toFixed(1) : "0";
                        return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                            <div className="font-medium">{d.name}</div>
                            <div>{formatCurrency(Number(d.value))} ({pct}%)</div>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">אין תשלומי חובות</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
