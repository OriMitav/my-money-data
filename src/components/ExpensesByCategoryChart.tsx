import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { fetchAllPages } from "@/lib/fetchAllPages";

interface Cat { id: string; name: string; type: string; parent_id: string | null }
interface Tx { date: string; value: number; category_id: string | null; relevant_transaction: boolean }

const fmt = (v: number) => `₪${Math.round(v).toLocaleString("he-IL")}`;

export default function ExpensesByCategoryChart() {
  const { user } = useAuth();

  const { data: categories = [] } = useQuery({
    queryKey: ["dash-cats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data as Cat[];
    },
    enabled: !!user,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["dash-tx-cat", user?.id],
    queryFn: async () => {
      return fetchAllPages<Tx>(async (from, to) => {
        const { data, error } = await supabase.from("transactions")
          .select("date, value, category_id, relevant_transaction")
          .eq("user_id", user!.id).eq("relevant_transaction", true)
          .lt("value", 0).order("date", { ascending: true }).range(from, to);
        return { data: data as Tx[] | null, error };
      });
    },
    enabled: !!user,
  });

  const expenseCats = useMemo(
    () => categories.filter((c) => c.type === "expense").sort((a, b) => a.name.localeCompare(b.name, "he")),
    [categories]
  );

  const [selected, setSelected] = useState<string>("");

  const effectiveSelected = selected || expenseCats[0]?.id || "";

  const chartData = useMemo(() => {
    if (!effectiveSelected) return [];
    const cat = categories.find((c) => c.id === effectiveSelected);
    if (!cat) return [];
    // include children if parent selected
    const allowed = new Set<string>([cat.id, ...categories.filter((c) => c.parent_id === cat.id).map((c) => c.id)]);
    const map = new Map<string, { key: string; label: string; amount: number; count: number }>();
    transactions.forEach((t) => {
      if (!t.category_id || !allowed.has(t.category_id)) return;
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: format(d, "MMM yy", { locale: he }),
          amount: 0,
          count: 0,
        });
      }
      const e = map.get(key)!;
      e.amount += Math.abs(t.value);
      e.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [effectiveSelected, transactions, categories]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="text-base">הוצאות לפי קטגוריה</CardTitle>
        <Select value={effectiveSelected} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-[220px] h-9">
            <SelectValue placeholder="בחר קטגוריה" />
          </SelectTrigger>
          <SelectContent>
            {expenseCats.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">אין נתונים לקטגוריה זו</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" fontSize={11} allowDecimals={false} />
              <Tooltip formatter={(v: number, n: string) => n === "כמות תנועות" ? v : fmt(v)} />
              <Legend />
              <Bar yAxisId="right" dataKey="count" fill="hsl(220, 9%, 70%)" fillOpacity={0.5} name="כמות תנועות" />
              <Line yAxisId="left" type="monotone" dataKey="amount" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={{ r: 3 }} name="סך הוצאה" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
