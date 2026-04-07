import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { format, parse, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { he } from "date-fns/locale";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { LayoutDashboard } from "lucide-react";

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
      const { data, error } = await supabase
        .from("transactions")
        .select("id, date, value, entity_id, relevant_transaction")
        .eq("user_id", user!.id)
        .eq("relevant_transaction", true)
        .order("date", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data as Transaction[];
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
      if (t.value > 0) {
        entry.incomes += t.value;
      } else {
        entry.expenses += Math.abs(t.value);
        if (entity?.type === "bank") {
          entry.directDebit += Math.abs(t.value);
        } else if (entity?.type === "credit_card") {
          entry.creditCard += Math.abs(t.value);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    );
  }, [transactions, entityMap]);

  // Timeline slicer state
  const [sliderRange, setSliderRange] = useState<number[]>([0, 100]);

  const sliderMin = 0;
  const sliderMax = Math.max(allMonthsData.length - 1, 0);

  const actualRange = useMemo(() => {
    if (!allMonthsData.length) return [0, 0];
    const start = Math.round((sliderRange[0] / 100) * sliderMax);
    const end = Math.round((sliderRange[1] / 100) * sliderMax);
    return [start, end];
  }, [sliderRange, sliderMax, allMonthsData.length]);

  const filteredChartData = useMemo(() => {
    if (!allMonthsData.length) return [];
    return allMonthsData.slice(actualRange[0], actualRange[1] + 1);
  }, [allMonthsData, actualRange]);

  const chart1Config = {
    incomes: { label: "הכנסות", color: "hsl(142, 71%, 45%)" },
    expenses: { label: "הוצאות", color: "hsl(0, 84%, 60%)" },
  };

  const chart2Config = {
    directDebit: { label: "הוראת קבע", color: "hsl(217, 91%, 60%)" },
    creditCard: { label: "כרטיס אשראי", color: "hsl(220, 9%, 46%)" },
  };

  const formatCurrency = (v: number) =>
    `₪${v.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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
            <p className="text-muted-foreground text-sm">
              העלה דוחות כדי לראות את הגרפים והנתונים
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">לוח בקרה</h1>
        <p className="text-muted-foreground">סקירה כללית של תזרים המזומנים</p>
      </div>

      {/* Timeline Slicer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">טווח זמן לגרפים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{allMonthsData[actualRange[0]]?.label}</span>
            <span>{allMonthsData[actualRange[1]]?.label}</span>
          </div>
          <Slider
            value={sliderRange}
            onValueChange={setSliderRange}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Chart 1: Incomes vs Expenses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">הכנסות מול הוצאות</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chart1Config} className="h-[300px] w-full">
              <LineChart data={filteredChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="incomes"
                  stroke="hsl(142, 71%, 45%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="הכנסות"
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="hsl(0, 84%, 60%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="הוצאות"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Chart 2: Direct Debit vs Credit Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">הוראת קבע מול כרטיס אשראי</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chart2Config} className="h-[300px] w-full">
              <LineChart data={filteredChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="directDebit"
                  stroke="hsl(217, 91%, 60%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="הוראת קבע"
                />
                <Line
                  type="monotone"
                  dataKey="creditCard"
                  stroke="hsl(220, 9%, 46%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="כרטיס אשראי"
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">סיכום חודשי</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">חודש</TableHead>
                <TableHead className="text-right">הכנסות</TableHead>
                <TableHead className="text-right">הוצאות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allMonthsData.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-green-600 font-medium">
                    {formatCurrency(row.incomes)}
                  </TableCell>
                  <TableCell className="text-red-600 font-medium">
                    {formatCurrency(row.expenses)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
