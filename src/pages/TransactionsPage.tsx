import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarIcon, Pencil, ArrowLeftRight, Filter, X } from "lucide-react";
import { toast } from "sonner";

interface TransactionRow {
  id: string;
  date: string;
  source_recipient: string | null;
  value: number;
  relevant_transaction: boolean;
  subscription: boolean;
  entity_id: string;
  financial_entities: { name: string; type: string } | null;
}

interface RecipientMapping {
  id: string;
  original_name: string;
  custom_name: string;
}

export default function TransactionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [editedMappings, setEditedMappings] = useState<Record<string, string>>({});

  // Filters
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [incomeFilter, setIncomeFilter] = useState<string>("all");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, date, source_recipient, value, relevant_transaction, subscription, entity_id, financial_entities(name, type)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as unknown as TransactionRow[];
    },
  });

  const { data: entities = [] } = useQuery({
    queryKey: ["financial_entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_entities").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: recipientMappings = [] } = useQuery({
    queryKey: ["recipient_mappings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipient_mappings").select("*");
      if (error) throw error;
      return data as RecipientMapping[];
    },
  });

  const mappingsMap = useMemo(() => {
    const map: Record<string, string> = {};
    recipientMappings.forEach((m) => { map[m.original_name] = m.custom_name; });
    return map;
  }, [recipientMappings]);

  const uniqueRecipients = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => { if (t.source_recipient) set.add(t.source_recipient); });
    return Array.from(set).sort();
  }, [transactions]);

  // Toggle mutations
  const toggleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "relevant_transaction" | "subscription"; value: boolean }) => {
      const updatePayload = field === "relevant_transaction"
        ? { relevant_transaction: value }
        : { subscription: value };
      const { error } = await supabase.from("transactions").update(updatePayload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMappingsMutation = useMutation({
    mutationFn: async (mappings: Record<string, string>) => {
      const entries = Object.entries(mappings).filter(([, v]) => v.trim());
      for (const [original, custom] of entries) {
        const existing = recipientMappings.find((m) => m.original_name === original);
        if (existing) {
          if (custom !== existing.custom_name) {
            const { error } = await supabase.from("recipient_mappings").update({ custom_name: custom }).eq("id", existing.id);
            if (error) throw error;
          }
        } else {
          const { error } = await supabase.from("recipient_mappings").insert({
            user_id: user!.id,
            original_name: original,
            custom_name: custom,
          });
          if (error) throw error;
        }
      }
      // Delete removed mappings
      for (const m of recipientMappings) {
        if (!mappings[m.original_name] || !mappings[m.original_name].trim()) {
          await supabase.from("recipient_mappings").delete().eq("id", m.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipient_mappings"] });
      setRecipientDialogOpen(false);
      toast.success("מיפוי הנמענים עודכן");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openRecipientDialog = () => {
    const initial: Record<string, string> = {};
    uniqueRecipients.forEach((r) => { initial[r] = mappingsMap[r] || ""; });
    setEditedMappings(initial);
    setRecipientDialogOpen(true);
  };

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (dateFrom && t.date < format(dateFrom, "yyyy-MM-dd")) return false;
      if (dateTo && t.date > format(dateTo, "yyyy-MM-dd")) return false;
      if (entityFilter !== "all" && t.entity_id !== entityFilter) return false;
      if (incomeFilter === "income" && t.value <= 0) return false;
      if (incomeFilter === "expense" && t.value >= 0) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo, entityFilter, incomeFilter]);

  const hasFilters = dateFrom || dateTo || entityFilter !== "all" || incomeFilter !== "all";

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setEntityFilter("all");
    setIncomeFilter("all");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תנועות</h1>
          <p className="text-muted-foreground">
            {filtered.length} תנועות{filtered.length !== transactions.length ? ` (מתוך ${transactions.length})` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={openRecipientDialog}>
          <Pencil className="ml-2 h-4 w-4" />
          עריכת נמענים
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              סינון:
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">מתאריך</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-right font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "בחר"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">עד תאריך</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-right font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "בחר"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">מסגרת תשלום</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">סוג</Label>
              <Select value={incomeFilter} onValueChange={setIncomeFilter}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="income">הכנסה</SelectItem>
                  <SelectItem value="expense">הוצאה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="ml-1 h-3.5 w-3.5" />
                נקה
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">טוען...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ArrowLeftRight className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">{transactions.length === 0 ? "אין תנועות עדיין" : "אין תנועות תואמות"}</h3>
            <p className="text-muted-foreground text-sm">
              {transactions.length === 0 ? "העלה דוח כדי לייבא תנועות" : "נסה לשנות את הסינון"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>נמען</TableHead>
                    <TableHead>סכום</TableHead>
                    <TableHead>שולם באמצעות</TableHead>
                    <TableHead>מסגרת תשלום</TableHead>
                    <TableHead>הכנסה/הוצאה</TableHead>
                    <TableHead className="text-center">רלוונטי</TableHead>
                    <TableHead className="text-center">מנוי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const entity = t.financial_entities;
                    const displayRecipient = mappingsMap[t.source_recipient || ""] || t.source_recipient || "—";
                    const paidVia = entity?.type === "bank" ? "הוראת קבע" : entity?.type === "credit_card" ? "כרטיס אשראי" : "—";
                    const isIncome = t.value > 0;

                    return (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{displayRecipient}</TableCell>
                        <TableCell className={cn("font-medium whitespace-nowrap", isIncome ? "text-green-600" : "text-red-500")}>
                          {t.value > 0 ? "+" : ""}{t.value.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{paidVia}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{entity?.name || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", isIncome ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-red-100 text-red-800 hover:bg-red-100")}>
                            {isIncome ? "הכנסה" : "הוצאה"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={t.relevant_transaction}
                            onCheckedChange={(v) => toggleMutation.mutate({ id: t.id, field: "relevant_transaction", value: v })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={t.subscription}
                            onCheckedChange={(v) => toggleMutation.mutate({ id: t.id, field: "subscription", value: v })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipient Mapping Dialog */}
      <Dialog open={recipientDialogOpen} onOpenChange={setRecipientDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>עריכת נמענים</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">הגדר שם תצוגה מותאם לכל נמען. השאר ריק כדי להציג את השם המקורי.</p>
          <div className="flex-1 overflow-auto space-y-3 py-2">
            {uniqueRecipients.map((name) => (
              <div key={name} className="grid grid-cols-2 gap-3 items-center">
                <div className="text-sm truncate font-medium" title={name}>{name}</div>
                <Input
                  placeholder="שם מותאם..."
                  value={editedMappings[name] || ""}
                  onChange={(e) => setEditedMappings((prev) => ({ ...prev, [name]: e.target.value }))}
                />
              </div>
            ))}
            {uniqueRecipients.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">אין נמענים עדיין. העלה דוח כדי לייבא תנועות.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecipientDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => saveMappingsMutation.mutate(editedMappings)} disabled={saveMappingsMutation.isPending}>
              {saveMappingsMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}