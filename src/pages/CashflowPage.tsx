import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { cn } from "@/lib/utils";

interface Tx {
  id: string;
  date: string;
  value: number;
  source_recipient: string | null;
  for_whom: string | null;
  category_id: string | null;
  subscription: boolean;
  relevant_transaction: boolean;
}
interface Category { id: string; name: string; type: string; parent_id: string | null }

const fmt = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

const monthsHe = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export default function CashflowPage() {
  const { user } = useAuth();

  const { data: transactions = [] } = useQuery({
    queryKey: ["cashflow-tx", user?.id],
    queryFn: async () => {
      return fetchAllPages<Tx>(async (from, to) => {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, date, value, source_recipient, for_whom, category_id, subscription, relevant_transaction")
          .eq("user_id", user!.id)
          .eq("relevant_transaction", true)
          .order("date", { ascending: false })
          .range(from, to);
        return { data: data as Tx[] | null, error };
      });
    },
    enabled: !!user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["cashflow-cats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data as Category[];
    },
    enabled: !!user,
  });

  const catMap = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  // Resolve top-level category id
  const rootCatId = (id: string | null): string | null => {
    if (!id) return null;
    const c = catMap.get(id);
    if (!c) return null;
    return c.parent_id || c.id;
  };

  return (
    <div dir="rtl" className="max-w-[1600px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">תזרים</h1>
        <p className="text-sm text-muted-foreground">סקירה לפי הכנסות, הוצאות והוראות קבע</p>
      </div>

      <Tabs defaultValue="incomes" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="incomes">הכנסות</TabsTrigger>
          <TabsTrigger value="expenses">הוצאות</TabsTrigger>
          <TabsTrigger value="standing">הוראות קבע</TabsTrigger>
        </TabsList>

        <TabsContent value="incomes" className="space-y-4">
          <CashflowSection
            transactions={transactions.filter((t) => t.value > 0)}
            categories={categories}
            catMap={catMap}
            rootCatId={rootCatId}
            mode="income"
          />
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <CashflowSection
            transactions={transactions.filter((t) => t.value < 0)}
            categories={categories}
            catMap={catMap}
            rootCatId={rootCatId}
            mode="expense"
          />
        </TabsContent>

        <TabsContent value="standing" className="space-y-4">
          <CashflowSection
            transactions={transactions.filter((t) => t.value < 0 && t.subscription)}
            categories={categories}
            catMap={catMap}
            rootCatId={rootCatId}
            mode="expense"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CashflowSection({
  transactions,
  categories,
  catMap,
  rootCatId,
  mode,
}: {
  transactions: Tx[];
  categories: Category[];
  catMap: Map<string, Category>;
  rootCatId: (id: string | null) => string | null;
  mode: "income" | "expense";
}) {
  // Build year/month structure
  const periods = useMemo(() => {
    const map = new Map<string, { year: number; month: number; total: number; cells: Record<string, number> }>();
    transactions.forEach((t) => {
      const d = new Date(t.date);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { year: y, month: m, total: 0, cells: {} });
      const e = map.get(key)!;
      const amt = Math.abs(t.value);
      e.total += amt;

      // Column key
      const colKey =
        mode === "income"
          ? `${t.for_whom || "—"}__${rootCatId(t.category_id) || "none"}`
          : rootCatId(t.category_id) || "none";
      e.cells[colKey] = (e.cells[colKey] || 0) + amt;
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, v]) => ({ key, ...v }));
  }, [transactions, mode, rootCatId]);

  // Yearly aggregation
  const years = useMemo(() => {
    const map = new Map<number, { year: number; total: number; cells: Record<string, number>; months: typeof periods }>();
    periods.forEach((p) => {
      if (!map.has(p.year)) map.set(p.year, { year: p.year, total: 0, cells: {}, months: [] });
      const e = map.get(p.year)!;
      e.total += p.total;
      Object.entries(p.cells).forEach(([k, v]) => { e.cells[k] = (e.cells[k] || 0) + v; });
      e.months.push(p);
    });
    return Array.from(map.values()).sort((a, b) => b.year - a.year);
  }, [periods]);

  // Columns
  const incomeCats = useMemo(
    () => categories.filter((c) => !c.parent_id && c.type === "income").sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );
  const expenseCats = useMemo(
    () => categories.filter((c) => !c.parent_id && c.type === "expense").sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  // Top-level columns for matrix
  const matrixColumns = useMemo(() => {
    if (mode === "income") {
      // For Whom values
      const whoms = new Set<string>();
      transactions.forEach((t) => whoms.add(t.for_whom || "—"));
      const sortedWhoms = Array.from(whoms).sort((a, b) => a.localeCompare(b, "he"));
      // For each whom, list income categories that have data
      return sortedWhoms.map((whom) => ({
        whom,
        cats: incomeCats.filter((c) =>
          periods.some((p) => (p.cells[`${whom}__${c.id}`] || 0) > 0)
        ),
      }));
    }
    return [];
  }, [mode, transactions, incomeCats, periods]);

  const expenseColumns = useMemo(
    () => expenseCats.filter((c) => periods.some((p) => (p.cells[c.id] || 0) > 0)),
    [expenseCats, periods]
  );

  const [openYears, setOpenYears] = useState<Set<number>>(new Set());
  const toggleYear = (y: number) => {
    const next = new Set(openYears);
    if (next.has(y)) next.delete(y); else next.add(y);
    setOpenYears(next);
  };

  return (
    <>
      {/* Summary Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">סיכום חודשי</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-right">חודש-שנה</TableHead>
                  <TableHead className="text-center">{mode === "income" ? "סה״כ הכנסות" : "סה״כ הוצאות"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p, i) => (
                  <TableRow key={p.key} className={i % 2 ? "bg-muted/30" : ""}>
                    <TableCell className="text-right font-medium">{monthsHe[p.month]} {p.year}</TableCell>
                    <TableCell className={cn("text-center font-semibold", mode === "income" ? "text-green-600" : "text-red-600")}>
                      {fmt(p.total)}
                    </TableCell>
                  </TableRow>
                ))}
                {periods.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">אין נתונים</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Matrix Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {mode === "income" ? "פירוט לפי עבור מי וקטגוריה" : "פירוט לפי קטגוריה"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 bg-background z-20">
                {mode === "income" ? (
                  <>
                    <TableRow>
                      <TableHead className="text-right sticky right-0 bg-background min-w-[140px]">תקופה</TableHead>
                      {matrixColumns.map((g) => (
                        <TableHead
                          key={g.whom}
                          colSpan={Math.max(1, g.cats.length)}
                          className="text-center border-r border-border bg-muted/40 font-bold"
                        >
                          {g.whom}
                        </TableHead>
                      ))}
                      <TableHead className="text-center bg-primary/10 font-bold">סה״כ</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="sticky right-0 bg-background"></TableHead>
                      {matrixColumns.flatMap((g) =>
                        g.cats.length === 0
                          ? [<TableHead key={`${g.whom}-empty`} className="text-center text-muted-foreground">—</TableHead>]
                          : g.cats.map((c) => (
                              <TableHead key={`${g.whom}-${c.id}`} className="text-center whitespace-nowrap">
                                {c.name}
                              </TableHead>
                            ))
                      )}
                      <TableHead className="bg-primary/10"></TableHead>
                    </TableRow>
                  </>
                ) : (
                  <TableRow>
                    <TableHead className="text-right sticky right-0 bg-background min-w-[140px]">תקופה</TableHead>
                    {expenseColumns.map((c) => (
                      <TableHead key={c.id} className="text-center whitespace-nowrap">{c.name}</TableHead>
                    ))}
                    <TableHead className="text-center bg-primary/10 font-bold">סה״כ</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {years.map((yr) => {
                  const isOpen = openYears.has(yr.year);
                  return (
                    <Fragment key={yr.year}>
                      <TableRow
                        className="bg-primary/5 hover:bg-primary/10 cursor-pointer font-bold"
                        onClick={() => toggleYear(yr.year)}
                      >
                        <TableCell className="sticky right-0 bg-primary/5">
                          <div className="flex items-center gap-2">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                            <span>{yr.year}</span>
                          </div>
                        </TableCell>
                        {mode === "income"
                          ? matrixColumns.flatMap((g) =>
                              g.cats.length === 0
                                ? [<TableCell key={`y-${yr.year}-${g.whom}-empty`} className="text-center text-muted-foreground">—</TableCell>]
                                : g.cats.map((c) => (
                                    <TableCell key={`y-${yr.year}-${g.whom}-${c.id}`} className="text-center">
                                      {fmt(yr.cells[`${g.whom}__${c.id}`] || 0)}
                                    </TableCell>
                                  ))
                            )
                          : expenseColumns.map((c) => (
                              <TableCell key={`y-${yr.year}-${c.id}`} className="text-center">
                                {fmt(yr.cells[c.id] || 0)}
                              </TableCell>
                            ))}
                        <TableCell className="text-center bg-primary/10 font-bold whitespace-nowrap">{fmt(yr.total)}</TableCell>
                      </TableRow>
                      {isOpen &&
                        yr.months.map((m, idx) => (
                          <TableRow key={m.key} className={idx % 2 ? "bg-muted/30" : ""}>
                            <TableCell className="sticky right-0 bg-inherit pr-8 text-muted-foreground">
                              {monthsHe[m.month]}
                            </TableCell>
                            {mode === "income"
                              ? matrixColumns.flatMap((g) =>
                                  g.cats.length === 0
                                    ? [<TableCell key={`m-${m.key}-${g.whom}-empty`} className="text-center text-muted-foreground">—</TableCell>]
                                    : g.cats.map((c) => (
                                        <TableCell key={`m-${m.key}-${g.whom}-${c.id}`} className="text-center">
                                          {fmt(m.cells[`${g.whom}__${c.id}`] || 0)}
                                        </TableCell>
                                      ))
                                )
                              : expenseColumns.map((c) => (
                                  <TableCell key={`m-${m.key}-${c.id}`} className="text-center">
                                    {fmt(m.cells[c.id] || 0)}
                                  </TableCell>
                                ))}
                            <TableCell className="text-center bg-primary/5 font-semibold whitespace-nowrap">{fmt(m.total)}</TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                })}
                {years.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center text-muted-foreground py-8">אין נתונים</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
