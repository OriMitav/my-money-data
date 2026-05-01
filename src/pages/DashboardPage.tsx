import { useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, LabelList,
} from "recharts";
import { LayoutDashboard, Camera } from "lucide-react";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { toast } from "sonner";

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

const StripedPattern = ({ id, color }: { id: string; color: string }) => (
  <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
    <rect width="6" height="6" fill={color} fillOpacity={0.3} />
    <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2" />
  </pattern>
);

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [summaryView, setSummaryView] = useState<"monthly" | "yearly">("monthly");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  // Pension funds & entries - ALL funds
  const { data: pensionFunds = [] } = useQuery({
    queryKey: ["pension_funds_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pension_funds")
        .select("*")
        .eq("user_id", user!.id);
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
        .order("year", { ascending: true })
        .order("month", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: pensionSettings } = useQuery({
    queryKey: ["pension_settings_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pension_settings")
        .select("checking_balance")
        .eq("user_id", user!.id)
        .maybeSingle();
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

  // Income entries for tax/social chart
  const { data: incomeEntries = [] } = useQuery({
    queryKey: ["income_entries_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("income_entries").select("*").eq("user_id", user!.id)
        .order("year", { ascending: true }).order("month", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: earners = [] } = useQuery({
    queryKey: ["earners_dash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("earners").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Photo upload mutation
  const uploadPhoto = useMutation({
    mutationFn: async ({ fundId, file }: { fundId: string; file: File }) => {
      const ext = file.name.split(".").pop();
      const path = `${user!.id}/${fundId}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("child-photos").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("child-photos").getPublicUrl(path);
      const { error: updateError } = await supabase.from("pension_funds").update({ photo_url: urlData.publicUrl } as any).eq("id", fundId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pension_funds_dash"] });
      toast.success("התמונה הועלתה בהצלחה");
    },
    onError: () => toast.error("שגיאה בהעלאת התמונה"),
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

  // Yearly summary
  const yearlySummaryData = useMemo(() => {
    const yearMap = new Map<number, { year: number; incomes: number; expenses: number }>();
    filteredChartData.forEach((m) => {
      if (!yearMap.has(m.year)) yearMap.set(m.year, { year: m.year, incomes: 0, expenses: 0 });
      const entry = yearMap.get(m.year)!;
      entry.incomes += m.incomes;
      entry.expenses += m.expenses;
    });
    return Array.from(yearMap.values()).sort((a, b) => b.year - a.year);
  }, [filteredChartData]);

  // --- Pension pie data (ALL funds, no relevant filter) ---
  const pensionPieData = useMemo(() => {
    return pensionFunds
      .filter((f) => f.type === "pension")
      .map((fund) => {
        const sorted = pensionEntries.filter(e => e.fund_id === fund.id).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
        const latestEntry = sorted.length > 0 ? sorted[sorted.length - 1] : null;
        return {
          name: fund.name,
          value: Number(latestEntry?.closing_balance || 0),
          accessible: fund.accessible,
        };
      })
      .filter((d) => d.value > 0);
  }, [pensionFunds, pensionEntries]);

  const pensionColorMap = useMemo(() => {
    const entries = pensionPieData.map((d, i) => [d.name, PIE_COLORS[(i + 4) % PIE_COLORS.length]] as const);
    const oriIndex = entries.findIndex(([name]) => name.includes("אורי"));
    const analIndex = entries.findIndex(([name]) => name.includes("ענאל"));

    if (oriIndex >= 0 && analIndex >= 0) {
      const oriColor = entries[oriIndex][1];
      entries[oriIndex] = [entries[oriIndex][0], entries[analIndex][1]] as const;
      entries[analIndex] = [entries[analIndex][0], oriColor] as const;
    }

    return Object.fromEntries(entries);
  }, [pensionPieData]);

  const checkingBalance = Number((pensionSettings as { checking_balance?: number } | null)?.checking_balance || 0);

  // Savings pie remains non-pension and non-children, but totals match Pension page logic
  // Includes checking balance ("עו"ש") as a separate slice
  const savingsPieData = useMemo(() => {
    const fundsSlices = pensionFunds
      .filter((f) => f.type !== "pension" && f.type !== "child_savings" && f.relevant !== false)
      .map((fund) => {
        const sorted = pensionEntries.filter((e) => e.fund_id === fund.id).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
        const latestEntry = sorted.length > 0 ? sorted[sorted.length - 1] : null;
        return {
          name: fund.name,
          value: Number(latestEntry?.closing_balance || 0),
          accessible: fund.accessible,
        };
      })
      .filter((d) => d.value > 0);

    if (checkingBalance > 0) {
      fundsSlices.push({ name: 'עו"ש', value: checkingBalance, accessible: true });
    }
    return fundsSlices;
  }, [pensionFunds, pensionEntries, checkingBalance]);

  const relevantFundsSummary = useMemo(() => {
    return pensionFunds
      .filter((fund) => fund.relevant !== false)
      .map((fund) => {
        const sorted = pensionEntries.filter((e) => e.fund_id === fund.id).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
        const latestEntry = sorted.length > 0 ? sorted[sorted.length - 1] : null;
        return {
          value: Number(latestEntry?.closing_balance || 0),
          accessible: fund.accessible,
        };
      });
  }, [pensionFunds, pensionEntries]);

  const totalSavings = relevantFundsSummary.reduce((sum, fund) => sum + fund.value, 0) + checkingBalance;
  const totalAccessible = relevantFundsSummary
    .filter((fund) => fund.accessible)
    .reduce((sum, fund) => sum + fund.value, 0) + checkingBalance;

  // Children savings with 3 projections (y1/y3/y5)
  const getEntriesSorted = (fundId: string) =>
    pensionEntries.filter(e => e.fund_id === fundId).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  const getReturnSummary = (fundId: string) => {
    const sorted = getEntriesSorted(fundId);
    if (sorted.length < 2) return { y1: null as number | null, y3: null as number | null, y5: null as number | null };

    const now = sorted[sorted.length - 1];
    const nowDate = new Date(now.year, now.month - 1);

    const calcReturn = (monthsBack: number) => {
      const targetDate = new Date(nowDate);
      targetDate.setMonth(targetDate.getMonth() - monthsBack);
      const periodEntries = sorted.filter(e => {
        const eDate = new Date(e.year, e.month - 1);
        return eDate > targetDate && eDate <= nowDate;
      });
      if (periodEntries.length < 1) return null;
      let compoundFactor = 1;
      for (const e of periodEntries) {
        compoundFactor *= (1 + Number(e.monthly_return));
      }
      return compoundFactor - 1;
    };

    return { y1: calcReturn(12), y3: calcReturn(36), y5: calcReturn(60) };
  };

  const childrenFunds = useMemo(() => {
    return pensionFunds
      .filter((f) => f.type === "child_savings")
      .map((fund) => {
        const sorted = getEntriesSorted(fund.id);
        const currentBalance = sorted.length > 0 ? Number(sorted[sorted.length - 1].closing_balance) : 0;
        const rs = getReturnSummary(fund.id);

        const last12 = sorted.slice(-12);
        const avgDeposit = last12.length > 0
          ? last12.reduce((s, e) => s + Number(e.employee_contribution) + Number(e.employer_contribution) + Number(e.compensation), 0) / last12.length
          : 0;

        const depositFee = (fund.deposit_fee_pct || 0) / 100;
        const accumFee = (fund.accumulation_fee_pct || 0) / 100 / 12;

        let forecastMonths = 60;
        if (fund.birth_date) {
          const birthDate = new Date(fund.birth_date);
          const endAge = fund.end_savings_age || 18;
          const endDate = new Date(birthDate.getFullYear() + endAge, birthDate.getMonth());
          const lastDate = sorted.length > 0 ? new Date(sorted[sorted.length - 1].year, sorted[sorted.length - 1].month - 1) : new Date();
          forecastMonths = Math.max(0, Math.round((endDate.getTime() - lastDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
        }
        forecastMonths = Math.min(forecastMonths, 600);

        const calcProjection = (yieldVal: number | null) => {
          if (yieldVal == null) return null;
          const monthlyYield = Math.pow(1 + yieldVal, 1 / 12) - 1;
          let bal = currentBalance;
          for (let i = 0; i < forecastMonths; i++) {
            const fees = avgDeposit * depositFee + bal * accumFee;
            bal = bal * (1 + monthlyYield) + avgDeposit - fees;
          }
          return bal;
        };

        const scenarios = [
          { key: "y1", label: "תשואה שנה", value: calcProjection(rs.y1) },
          { key: "y3", label: "תשואה 3 שנים", value: calcProjection(rs.y3 != null ? Math.pow(1 + rs.y3, 1 / 3) - 1 : null) },
          { key: "y5", label: "תשואה 5 שנים", value: calcProjection(rs.y5 != null ? Math.pow(1 + rs.y5, 1 / 5) - 1 : null) },
        ];

        return {
          id: fund.id,
          name: fund.name,
          currentBalance,
          scenarios,
          photoUrl: (fund as any).photo_url || "",
        };
      })
      .filter((d) => d.currentBalance > 0);
  }, [pensionFunds, pensionEntries]);

  const totalChildrenSavings = childrenFunds.reduce((s, d) => s + d.currentBalance, 0);

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
      };
    }).filter((d) => d.value > 0);
  }, [debtEntries, debts]);

  const totalMonthlyDebtPayments = debtPaymentsPieData.reduce((s, d) => s + d.value, 0);

  const debtColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    debts.forEach((d, i) => { map[d.name] = PIE_COLORS[i % PIE_COLORS.length]; });
    return map;
  }, [debts]);

  // Tax & Social Security line chart data (synced with filter)
  const taxChartData = useMemo(() => {
    if (!incomeEntries.length) return [];
    const map = new Map<string, { key: string; label: string; tax: number; social: number }>();

    incomeEntries.forEach((entry) => {
      const key = `${entry.year}-${String(entry.month - 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: format(new Date(entry.year, entry.month - 1), "MMM yyyy", { locale: he }),
          tax: 0,
          social: 0,
        });
      }
      const d = map.get(key)!;
      d.tax += Number(entry.source1_tax) + Number(entry.source2_tax) + Number(entry.source3_tax);
      d.social += Number(entry.source1_social) + Number(entry.source2_social) + Number(entry.source3_social);
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [incomeEntries]);

  const filteredTaxData = useMemo(() => {
    if (!taxChartData.length || !allMonthsData.length) return taxChartData;
    const startKey = allMonthsData[actualRange[0]]?.key;
    const endKey = allMonthsData[actualRange[1]]?.key;
    if (!startKey || !endKey) return taxChartData;
    return taxChartData.filter((d) => d.key >= startKey && d.key <= endKey);
  }, [taxChartData, allMonthsData, actualRange]);

  const chart1Config = {
    incomes: { label: "הכנסות", color: "hsl(142, 71%, 45%)" },
    expenses: { label: "הוצאות", color: "hsl(0, 84%, 60%)" },
  };

  const chart2Config = {
    directDebit: { label: "הוראת קבע", color: "hsl(217, 91%, 60%)" },
    creditCard: { label: "כרטיס אשראי", color: "hsl(220, 9%, 46%)" },
  };

  const chart3Config = {
    tax: { label: "מס הכנסה", color: "hsl(0, 84%, 60%)" },
    social: { label: "ביטוח לאומי", color: "hsl(45, 93%, 47%)" },
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

  const renderPieLabel = ({
    cx,
    cy,
    midAngle,
    outerRadius,
    name,
    percent,
    alwaysShow,
  }: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    outerRadius?: number;
    name: string;
    percent: number;
    alwaysShow?: boolean;
  }) => {
    if (cx == null || cy == null || midAngle == null || outerRadius == null) return null;
    if (!alwaysShow && percent < 0.05) return null;
    const radius = outerRadius + 18;
    const x = cx + radius * Math.cos((-midAngle * Math.PI) / 180);
    const y = cy + radius * Math.sin((-midAngle * Math.PI) / 180);

    return (
      <text
        x={x}
        y={y}
        fill="hsl(0 0% 0%)"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize={11}
      >
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // In RTL: right label = earliest date, left label = latest date
  const earliestLabel = allMonthsData[actualRange[0]]?.label || "";
  const latestLabel = allMonthsData[actualRange[1]]?.label || "";

  const handlePhotoUpload = (fundId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadPhoto.mutate({ fundId, file });
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">לוח בקרה</h1>
        <p className="text-sm text-muted-foreground">סקירה כללית של תזרים המזומנים</p>
      </div>

      {/* Main layout: RTL - right side is "start", so 2fr first = charts on right, 1fr = table on left */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Charts column (appears on RIGHT in RTL) */}
        <div className="space-y-4">
          {/* Time Range Filter */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">טווח זמן גרפים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{latestLabel}</span>
                <span>{earliestLabel}</span>
              </div>
              <Slider
                value={activeRange}
                onValueChange={(v) => setSliderRange(v)}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </CardContent>
          </Card>

          {/* Line Charts row */}
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

          {/* Pie Charts - Row 1: Savings + Pension */}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">התפלגות חסכונות</CardTitle>
                <div className="text-xl font-bold">{formatCurrency(totalSavings)}</div>
                <div className="text-xs text-muted-foreground">הון נגיש: {formatCurrency(totalAccessible)}</div>
              </CardHeader>
              <CardContent>
                {savingsPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <defs>
                        {savingsPieData.map((d, i) => !d.accessible && (
                          <StripedPattern key={d.name} id={`stripe-${i}`} color={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </defs>
                      <Pie data={savingsPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                        label={(props) => renderPieLabel({ ...props, alwaysShow: true })}
                        labelLine={{ stroke: "hsl(0 0% 40%)", strokeWidth: 1 }}
                        fontSize={11}>
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
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={pensionPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120}
                        label={renderPieLabel} labelLine={false} fontSize={11}>
                        {pensionPieData.map((d) => (
                          <Cell key={d.name} fill={pensionColorMap[d.name] || PIE_COLORS[0]} />
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
          </div>

          {/* Pie Charts - Row 2: Debts + Monthly Payments */}
          <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">התפלגות חובות</CardTitle>
                <div className="text-xl font-bold">{formatCurrency(totalDebt)}</div>
              </CardHeader>
              <CardContent>
                {debtPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={debtPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120}
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
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={debtPaymentsPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120}
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

          {/* Children Savings Bar Chart */}
          {childrenFunds.length > 0 && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">חיסכון לכל ילד</CardTitle>
                <div className="text-xl font-bold">סה״כ: {formatCurrency(totalChildrenSavings)}</div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {childrenFunds.map((child, i) => (
                    <div key={child.id} className="flex flex-col items-center space-y-2">
                      {/* Bar */}
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={[{ name: child.name, value: child.currentBalance }]}>
                          <YAxis hide />
                          <Bar dataKey="value" fill={PIE_COLORS[i % PIE_COLORS.length]} radius={[6, 6, 0, 0]} barSize={60}>
                            <LabelList dataKey="value" position="top" formatter={(v: number) => formatCurrency(v)} style={{ fontSize: 12, fontWeight: "bold", fill: "#000" }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      {/* Photo circle */}
                      <div className="relative group cursor-pointer" onClick={() => fileInputRefs.current[child.id]?.click()}>
                        <Avatar className="h-14 w-14 border-2 border-primary/30">
                          {child.photoUrl ? (
                            <AvatarImage src={child.photoUrl} alt={child.name} />
                          ) : null}
                          <AvatarFallback className="text-xs bg-muted">
                            <Camera className="h-5 w-5 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Camera className="h-4 w-4 text-white" />
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={(el) => { fileInputRefs.current[child.id] = el; }}
                          onChange={(e) => handlePhotoUpload(child.id, e)}
                        />
                      </div>

                      {/* Name */}
                      <div className="text-sm font-semibold">{child.name}</div>

                      {/* Current balance */}
                      <div className="text-lg font-bold">{formatCurrency(child.currentBalance)}</div>

                      {/* 3 Projections */}
                      <div className="w-full space-y-1">
                        {child.scenarios.map((s) => (
                          <div key={s.key} className="flex justify-between text-xs text-muted-foreground px-1">
                            <span>{s.label}:</span>
                            <span className="font-medium">{s.value != null ? formatCurrency(Math.round(s.value)) : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tax & Social Security Line Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">מס הכנסה וביטוח לאומי</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredTaxData.length > 0 ? (
                <>
                  <ChartContainer config={chart3Config} className="h-[250px] w-full">
                    <LineChart data={filteredTaxData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                      <Line type="monotone" dataKey="tax" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={{ r: 2 }} name="מס הכנסה" />
                      <Line type="monotone" dataKey="social" stroke="hsl(45, 93%, 47%)" strokeWidth={2} dot={{ r: 2 }} name="ביטוח לאומי" />
                    </LineChart>
                  </ChartContainer>
                  {renderCustomLegend(chart3Config)}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">אין נתוני מיסוי</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Table column (appears on LEFT in RTL) */}
        <Card className="lg:row-span-2 max-h-[calc(100vh-180px)] flex flex-col">
          <CardHeader className="pb-2">
            <Tabs value={summaryView} onValueChange={(v) => setSummaryView(v as "monthly" | "yearly")} dir="rtl">
              <TabsList className="w-full">
                <TabsTrigger value="monthly" className="flex-1 text-sm">חודשי</TabsTrigger>
                <TabsTrigger value="yearly" className="flex-1 text-sm">שנתי</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="overflow-y-auto flex-1 p-0">
            {summaryView === "monthly" ? (
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
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right sticky top-0 bg-background">שנה</TableHead>
                    <TableHead className="text-right sticky top-0 bg-background">הכנסות</TableHead>
                    <TableHead className="text-right sticky top-0 bg-background">הוצאות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlySummaryData.map((row) => (
                    <TableRow key={row.year}>
                      <TableCell className="font-medium text-sm">{row.year}</TableCell>
                      <TableCell className="text-green-600 font-medium text-sm">{formatCurrency(row.incomes)}</TableCell>
                      <TableCell className="text-red-600 font-medium text-sm">{formatCurrency(row.expenses)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
