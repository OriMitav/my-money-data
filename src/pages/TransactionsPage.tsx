import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { format } from "date-fns";
import { CalendarIcon, Pencil, ArrowLeftRight, Filter, X, Upload, FileText, UserCircle2, Check } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { UploadReportDialog } from "@/components/UploadReportDialog";

// RTL nav: visually left arrow advances forward (next month), right arrow goes back
const RTL_CALENDAR_CLASSNAMES = {
  nav_button_previous: "absolute right-1",
  nav_button_next: "absolute left-1",
};

interface TransactionRow {
  id: string;
  date: string;
  source_recipient: string | null;
  value: number;
  relevant_transaction: boolean;
  subscription: boolean;
  entity_id: string;
  category_id: string | null;
  for_whom: string | null;
  upload_id: string | null;
  financial_entities: { name: string; type: string } | null;
}

interface RecipientMapping {
  id: string;
  original_name: string;
  custom_name: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
}

const formatILS = (n: number) =>
  n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

export default function TransactionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [editedMappings, setEditedMappings] = useState<Record<string, string>>({});
  const [irrelevantRecipients, setIrrelevantRecipients] = useState<Set<string>>(new Set());

  // Category change confirmation dialog
  const [pendingCategoryChange, setPendingCategoryChange] = useState<{
    transactionId: string;
    recipient: string;
    newCategoryId: string | null;
  } | null>(null);

  // Flag (relevant/subscription) change confirmation dialog
  const [pendingFlagChange, setPendingFlagChange] = useState<{
    transactionId: string;
    recipient: string;
    field: "relevant_transaction" | "subscription";
    value: boolean;
    date: string;
  } | null>(null);

  // For Whom editing
  const [forWhomEditing, setForWhomEditing] = useState<{ tx: TransactionRow; value: string } | null>(null);
  const [pendingForWhom, setPendingForWhom] = useState<{ tx: TransactionRow; value: string } | null>(null);

  // Filters - default to current month, with "to" defaulting to today
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(firstOfMonth);
  const [dateTo, setDateTo] = useState<Date | undefined>(now);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [incomeFilter, setIncomeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [uploadFilter, setUploadFilter] = useState<string>("all");
  const [classifying, setClassifying] = useState(false);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      return fetchAllPages<TransactionRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, date, source_recipient, value, relevant_transaction, subscription, entity_id, category_id, for_whom, upload_id, financial_entities(name, type)")
          .eq("user_id", user!.id)
          .order("date", { ascending: false })
          .range(from, to);
        return { data: data as unknown as TransactionRow[] | null, error };
      });
    },
    enabled: !!user,
  });

  const { data: entities = [] } = useQuery({
    queryKey: ["financial_entities", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_entities").select("id, name").eq("user_id", user!.id).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: uploads = [] } = useQuery({
    queryKey: ["uploads", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploads")
        .select("id, file_name, month, year, entity_id, financial_entities(name)")
        .eq("user_id", user!.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data as unknown as { id: string; file_name: string; month: number; year: number; entity_id: string; financial_entities: { name: string } | null }[];
    },
    enabled: !!user,
  });

  const { data: recipientMappings = [] } = useQuery({
    queryKey: ["recipient_mappings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipient_mappings").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data as RecipientMapping[];
    },
    enabled: !!user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("user_id", user!.id).order("name");
      if (error) throw error;
      return data as Category[];
    },
    enabled: !!user,
  });

  const categoryById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const formatCategory = (id: string | null): string => {
    if (!id) return "—";
    const c = categoryById.get(id);
    if (!c) return "—";
    if (c.parent_id) {
      const p = categoryById.get(c.parent_id);
      return p ? `${p.name} > ${c.name}` : c.name;
    }
    return c.name;
  };

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

  const toggleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "relevant_transaction" | "subscription"; value: boolean }) => {
      const updatePayload = field === "relevant_transaction" ? { relevant_transaction: value } : { subscription: value };
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
    const irr = new Set<string>();
    const recipientRelevance = new Map<string, boolean>();
    transactions.forEach((t) => {
      if (t.source_recipient) {
        if (!recipientRelevance.has(t.source_recipient)) {
          recipientRelevance.set(t.source_recipient, !t.relevant_transaction);
        } else if (t.relevant_transaction) {
          recipientRelevance.set(t.source_recipient, false);
        }
      }
    });
    recipientRelevance.forEach((allIrrelevant, name) => { if (allIrrelevant) irr.add(name); });
    setIrrelevantRecipients(irr);
    setRecipientDialogOpen(true);
  };

  const handleSaveRecipients = async () => {
    await saveMappingsMutation.mutateAsync(editedMappings);
    for (const name of irrelevantRecipients) {
      await supabase.from("transactions").update({ relevant_transaction: false }).eq("source_recipient", name);
    }
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  // Category change handler
  const handleCategoryChange = (transaction: TransactionRow, newCategoryId: string) => {
    const value = newCategoryId === "none" ? null : newCategoryId;
    if (transaction.category_id === value) return;
    setPendingCategoryChange({
      transactionId: transaction.id,
      recipient: transaction.source_recipient || "",
      newCategoryId: value,
    });
  };

  const applyCategoryChange = async (scope: "all" | "forward") => {
    if (!pendingCategoryChange) return;
    const { transactionId, recipient, newCategoryId } = pendingCategoryChange;
    try {
      if (scope === "all" && recipient) {
        // Update all transactions of this recipient + persist mapping
        await supabase
          .from("transactions")
          .update({ category_id: newCategoryId })
          .eq("user_id", user!.id)
          .eq("source_recipient", recipient);
        await supabase
          .from("recipient_categories")
          .upsert(
            { user_id: user!.id, recipient_name: recipient, category_id: newCategoryId },
            { onConflict: "user_id,recipient_name" }
          );
        toast.success("הקטגוריה עודכנה עבור כל הנמענים");
      } else {
        // forward: only this transaction + persist mapping for future uploads
        await supabase.from("transactions").update({ category_id: newCategoryId }).eq("id", transactionId);
        if (recipient) {
          await supabase
            .from("recipient_categories")
            .upsert(
              { user_id: user!.id, recipient_name: recipient, category_id: newCategoryId },
              { onConflict: "user_id,recipient_name" }
            );
        }
        toast.success("הקטגוריה עודכנה לתנועה זו ולעתיד");
      }
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setPendingCategoryChange(null);
    }
  };

  // Flag change handler — intercepts toggle to ask scope
  const handleFlagToggle = (t: TransactionRow, field: "relevant_transaction" | "subscription", value: boolean) => {
    if (!t.source_recipient) {
      // No recipient → just toggle this row
      toggleMutation.mutate({ id: t.id, field, value });
      return;
    }
    setPendingFlagChange({
      transactionId: t.id,
      recipient: t.source_recipient,
      field,
      value,
      date: t.date,
    });
  };

  const applyFlagChange = async (scope: "all" | "forward" | "single") => {
    if (!pendingFlagChange) return;
    const { transactionId, recipient, field, value, date } = pendingFlagChange;
    const fieldKey = field === "relevant_transaction" ? "relevant" : "subscription";
    const updatePayload = field === "relevant_transaction" ? { relevant_transaction: value } : { subscription: value };
    try {
      if (scope === "single") {
        await supabase.from("transactions").update(updatePayload).eq("id", transactionId);
      } else if (scope === "all") {
        await supabase
          .from("transactions")
          .update(updatePayload)
          .eq("user_id", user!.id)
          .eq("source_recipient", recipient);
        await supabase.from("recipient_preferences").upsert(
          { user_id: user!.id, recipient_name: recipient, field: fieldKey, value, from_date: null },
          { onConflict: "user_id,recipient_name,field" }
        );
        toast.success("עודכן עבור כל הנמענים");
      } else {
        // forward: this date and onward
        await supabase
          .from("transactions")
          .update(updatePayload)
          .eq("user_id", user!.id)
          .eq("source_recipient", recipient)
          .gte("date", date);
        await supabase.from("recipient_preferences").upsert(
          { user_id: user!.id, recipient_name: recipient, field: fieldKey, value, from_date: date },
          { onConflict: "user_id,recipient_name,field" }
        );
        toast.success("עודכן מהתאריך הזה ולהבא");
      }
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setPendingFlagChange(null);
    }
  };

  // For Whom: collect existing names from transactions + earners + rules
  const forWhomSuggestions = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => { if (t.for_whom) set.add(t.for_whom); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [transactions]);

  const applyForWhom = async (scope: "single" | "past" | "always") => {
    if (!pendingForWhom) return;
    const { tx, value } = pendingForWhom;
    const trimmed = value.trim() || null;
    try {
      if (scope === "single") {
        await supabase.from("transactions").update({ for_whom: trimmed }).eq("id", tx.id);
      } else if (scope === "past") {
        await supabase.from("transactions").update({ for_whom: trimmed })
          .eq("user_id", user!.id).eq("source_recipient", tx.source_recipient!);
      } else {
        await supabase.from("transactions").update({ for_whom: trimmed })
          .eq("user_id", user!.id).eq("source_recipient", tx.source_recipient!);
        if (trimmed) {
          await supabase.from("for_whom_rules").upsert(
            { user_id: user!.id, source_recipient: tx.source_recipient!, for_whom: trimmed },
            { onConflict: "user_id,source_recipient" }
          );
        } else {
          await supabase.from("for_whom_rules").delete()
            .eq("user_id", user!.id).eq("source_recipient", tx.source_recipient!);
        }
      }
      toast.success("עודכן");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setPendingForWhom(null);
      setForWhomEditing(null);
    }
  };

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (dateFrom && t.date < format(dateFrom, "yyyy-MM-dd")) return false;
      if (dateTo && t.date > format(dateTo, "yyyy-MM-dd")) return false;
      if (entityFilter !== "all" && t.entity_id !== entityFilter) return false;
      if (incomeFilter === "income" && t.value <= 0) return false;
      if (incomeFilter === "expense" && t.value >= 0) return false;
      if (categoryFilter !== "all") {
        if (categoryFilter === "none") {
          if (t.category_id) return false;
        } else if (t.category_id !== categoryFilter) {
          // also allow matching parent (any child of this parent)
          const cat = t.category_id ? categoryById.get(t.category_id) : null;
          if (!cat || cat.parent_id !== categoryFilter) return false;
        }
      }
      if (uploadFilter !== "all" && t.upload_id !== uploadFilter) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo, entityFilter, incomeFilter, categoryFilter, uploadFilter, categoryById]);

  // Summary computation based on filtered set
  const summary = useMemo(() => {
    let relIncome = 0, relExpense = 0;
    let allIncome = 0, allExpense = 0;
    let subscriptions = 0;
    for (const t of filtered) {
      if (t.value > 0) allIncome += t.value;
      else allExpense += -t.value;
      if (t.relevant_transaction) {
        if (t.value > 0) relIncome += t.value;
        else relExpense += -t.value;
      }
      if (t.subscription && t.value < 0) subscriptions += -t.value;
    }
    return { relIncome, relExpense, allIncome, allExpense, subscriptions };
  }, [filtered]);

  const hasFilters = !!dateFrom || !!dateTo || entityFilter !== "all" || incomeFilter !== "all" || categoryFilter !== "all" || uploadFilter !== "all";

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setEntityFilter("all");
    setIncomeFilter("all");
    setCategoryFilter("all");
    setUploadFilter("all");
  };

  // Bulk-classify all uncategorized transactions
  const handleClassifyAll = async () => {
    if (!user) return;
    setClassifying(true);
    try {
      // Distinct uncategorized recipients (across all transactions)
      const uncatRecipients = new Map<string, boolean>();
      for (const t of transactions) {
        if (!t.category_id && t.source_recipient) {
          const name = t.source_recipient.trim();
          if (!name) continue;
          if (!uncatRecipients.has(name)) uncatRecipients.set(name, t.value > 0);
        }
      }
      // Apply existing recipient_categories first
      const { data: existing } = await supabase
        .from("recipient_categories")
        .select("recipient_name, category_id")
        .eq("user_id", user.id);
      const known = new Map<string, string | null>();
      (existing || []).forEach((m) => known.set(m.recipient_name.trim(), m.category_id));

      const toAI: { name: string; isIncome: boolean }[] = [];
      uncatRecipients.forEach((isIncome, name) => {
        if (!known.has(name)) toAI.push({ name, isIncome });
      });

      const validIds = new Set(categories.map((c) => c.id));

      if (toAI.length > 0) {
        const catList = categories.map((c) => {
          const parent = c.parent_id ? categories.find((p) => p.id === c.parent_id) : null;
          return { id: c.id, name: c.name, parent_name: parent?.name || null, type: c.type as "income" | "expense" };
        });
        // batch in chunks of 80 to avoid prompt limits
        for (let i = 0; i < toAI.length; i += 80) {
          const batch = toAI.slice(i, i + 80);
          const { data: aiRes } = await supabase.functions.invoke("categorize-recipients", {
            body: { recipients: batch, categories: catList },
          });
          const results = (aiRes?.results || []) as { recipient: string; category_id: string | null }[];
          for (const r of results) {
            if (r.category_id === null || validIds.has(r.category_id)) {
              known.set(r.recipient.trim(), r.category_id);
            }
          }
        }
        // Persist new mappings
        const inserts = Array.from(known.entries())
          .filter(([name]) => toAI.some((r) => r.name === name))
          .map(([name, category_id]) => ({ user_id: user.id, recipient_name: name, category_id }));
        if (inserts.length > 0) {
          await supabase
            .from("recipient_categories")
            .upsert(inserts, { onConflict: "user_id,recipient_name" });
        }
      }

      // Now update all uncategorized transactions per recipient
      let updated = 0;
      for (const [name, category_id] of known.entries()) {
        if (!category_id) continue;
        const { error, count } = await supabase
          .from("transactions")
          .update({ category_id }, { count: "exact" })
          .eq("user_id", user.id)
          .is("category_id", null)
          .eq("source_recipient", name);
        if (!error && count) updated += count;
      }
      toast.success(`סווגו ${updated} תנועות`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recipient_categories"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "שגיאה בסיווג");
    } finally {
      setClassifying(false);
    }
  };

  // Categories grouped (parents + their children) for select
  const parentCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const childrenOf = (pid: string) => categories.filter((c) => c.parent_id === pid);

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">תנועות</h1>
          <p className="text-muted-foreground">
            {filtered.length} תנועות{filtered.length !== transactions.length ? ` (מתוך ${transactions.length})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleClassifyAll} disabled={classifying}>
            {classifying ? "מסווג..." : "סווג את כל התנועות"}
          </Button>
          <Button variant="outline" onClick={openRecipientDialog}>
            <Pencil className="ml-2 h-4 w-4" />
            עריכת נמענים
          </Button>
          <Button variant="outline" asChild>
            <Link to="/uploads">
              <FileText className="ml-2 h-4 w-4" />
              ניהול דוחות
            </Link>
          </Button>
          <UploadReportDialog
            trigger={
              <Button>
                <Upload className="ml-2 h-4 w-4" />
                העלאת דוח
              </Button>
            }
          />
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-end gap-3 flex-wrap">
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
                  <Calendar mode="single" selected={dateFrom} defaultMonth={dateFrom} onSelect={setDateFrom} dir="rtl" className="p-3 pointer-events-auto" />
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
                  <Calendar mode="single" selected={dateTo} defaultMonth={dateTo} onSelect={setDateTo} dir="rtl" className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">מסגרת תשלום</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="income">הכנסה</SelectItem>
                  <SelectItem value="expense">הוצאה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">קטגוריה</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="none">ללא קטגוריה</SelectItem>
                  {parentCategories.map((p) => (
                    <Fragment key={p.id}>
                      <SelectItem value={p.id}>{p.name} (כולל תתי)</SelectItem>
                      {childrenOf(p.id).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{`  ${p.name} > ${c.name}`}</SelectItem>
                      ))}
                    </Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">דוח</Label>
              <Select value={uploadFilter} onValueChange={setUploadFilter}>
                <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הדוחות</SelectItem>
                  {uploads.map((u) => {
                    const monthsHe = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];
                    const label = `${u.financial_entities?.name || "—"} · ${monthsHe[u.month - 1]} ${u.year}`;
                    return <SelectItem key={u.id} value={u.id}>{label}</SelectItem>;
                  })}
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

      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">סיכום (לפי הסינון)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">קבוצה</TableHead>
                  <TableHead className="text-center">הכנסות</TableHead>
                  <TableHead className="text-center">הוצאות</TableHead>
                  <TableHead className="text-center">נטו</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-center font-medium">רלוונטי בלבד</TableCell>
                  <TableCell className="text-center text-green-600">{formatILS(summary.relIncome)}</TableCell>
                  <TableCell className="text-center text-red-500">{formatILS(summary.relExpense)}</TableCell>
                  <TableCell className={cn("text-center font-semibold", summary.relIncome - summary.relExpense >= 0 ? "text-green-600" : "text-red-500")}>
                    {formatILS(summary.relIncome - summary.relExpense)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-center font-medium">סה"כ (כולל לא רלוונטי)</TableCell>
                  <TableCell className="text-center text-green-600">{formatILS(summary.allIncome)}</TableCell>
                  <TableCell className="text-center text-red-500">{formatILS(summary.allExpense)}</TableCell>
                  <TableCell className={cn("text-center font-semibold", summary.allIncome - summary.allExpense >= 0 ? "text-green-600" : "text-red-500")}>
                    {formatILS(summary.allIncome - summary.allExpense)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-center font-medium">מנויים</TableCell>
                  <TableCell className="text-center text-muted-foreground">—</TableCell>
                  <TableCell className="text-center text-red-500">{formatILS(summary.subscriptions)}</TableCell>
                  <TableCell className="text-center text-muted-foreground">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
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
                    <TableHead className="text-center whitespace-nowrap">תאריך</TableHead>
                    <TableHead className="text-center">נמען</TableHead>
                    <TableHead className="text-center">קטגוריה</TableHead>
                    <TableHead className="text-center whitespace-nowrap">סכום</TableHead>
                    <TableHead className="text-center whitespace-nowrap">עבור מי</TableHead>
                    <TableHead className="text-center hidden md:table-cell whitespace-nowrap">שולם באמצעות</TableHead>
                    <TableHead className="text-center hidden lg:table-cell whitespace-nowrap">מסגרת תשלום</TableHead>
                    <TableHead className="text-center hidden sm:table-cell whitespace-nowrap">הכנסה/הוצאה</TableHead>
                    <TableHead className="text-center whitespace-nowrap">רלוונטי</TableHead>
                    <TableHead className="text-center whitespace-nowrap">מנוי</TableHead>
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
                        <TableCell className="text-center whitespace-nowrap">{t.date}</TableCell>
                        <TableCell className="text-center max-w-[200px] truncate">{displayRecipient}</TableCell>
                        <TableCell className="text-center">
                          <Select
                            value={t.category_id ?? "none"}
                            onValueChange={(v) => handleCategoryChange(t, v)}
                          >
                            <SelectTrigger className="h-8 text-xs w-[170px] mx-auto">
                              <SelectValue>{formatCategory(t.category_id)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">ללא</SelectItem>
                              {parentCategories.map((p) => (
                                <Fragment key={p.id}>
                                  <SelectItem value={p.id}>{p.name}</SelectItem>
                                  {childrenOf(p.id).map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{`  ${p.name} > ${c.name}`}</SelectItem>
                                  ))}
                                </Fragment>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className={cn("text-center font-medium whitespace-nowrap", isIncome ? "text-green-600" : "text-red-500")}>
                          {t.value > 0 ? "+" : ""}{t.value.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                        </TableCell>
                        <TableCell className="text-center">
                          {isIncome ? (
                            <Popover
                              open={forWhomEditing?.tx.id === t.id}
                              onOpenChange={(o) => {
                                if (o) setForWhomEditing({ tx: t, value: t.for_whom || "" });
                                else setForWhomEditing(null);
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 min-w-[100px]">
                                  <UserCircle2 className="h-3.5 w-3.5" />
                                  {t.for_whom || <span className="text-muted-foreground">בחר...</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[220px] p-0" align="center">
                                <Command>
                                  <CommandInput
                                    placeholder="הקלד שם..."
                                    value={forWhomEditing?.value || ""}
                                    onValueChange={(v) => setForWhomEditing((prev) => prev ? { ...prev, value: v } : prev)}
                                  />
                                  <CommandList>
                                    <CommandEmpty>
                                      <div className="p-2 text-xs text-muted-foreground">הקש Enter לשמור</div>
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {forWhomSuggestions
                                        .filter((s) => !forWhomEditing?.value || s.toLowerCase().includes(forWhomEditing.value.toLowerCase()))
                                        .map((s) => (
                                          <CommandItem
                                            key={s}
                                            value={s}
                                            onSelect={() => {
                                              if (!t.source_recipient) {
                                                supabase.from("transactions").update({ for_whom: s }).eq("id", t.id)
                                                  .then(() => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); setForWhomEditing(null); });
                                              } else {
                                                setPendingForWhom({ tx: t, value: s });
                                              }
                                            }}
                                          >
                                            {s}
                                            {t.for_whom === s && <Check className="ml-auto h-4 w-4" />}
                                          </CommandItem>
                                        ))}
                                    </CommandGroup>
                                  </CommandList>
                                  <div className="p-2 border-t flex gap-2">
                                    <Button
                                      size="sm"
                                      className="flex-1 h-8 text-xs"
                                      onClick={() => {
                                        const v = forWhomEditing?.value || "";
                                        if (!t.source_recipient) {
                                          supabase.from("transactions").update({ for_whom: v.trim() || null }).eq("id", t.id)
                                            .then(() => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); setForWhomEditing(null); });
                                        } else {
                                          setPendingForWhom({ tx: t, value: v });
                                        }
                                      }}
                                    >
                                      שמור
                                    </Button>
                                  </div>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <Badge variant="outline" className="text-xs">{paidVia}</Badge>
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          <Badge variant="secondary" className="text-xs">{entity?.name || "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <Badge className={cn("text-xs", isIncome ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-red-100 text-red-800 hover:bg-red-100")}>
                            {isIncome ? "הכנסה" : "הוצאה"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={t.relevant_transaction}
                            onCheckedChange={(v) => handleFlagToggle(t, "relevant_transaction", v)}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={t.subscription}
                            onCheckedChange={(v) => handleFlagToggle(t, "subscription", v)}
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
          <p className="text-sm text-muted-foreground">הגדר שם תצוגה מותאם לכל נמען, או סמן נמענים כלא רלוונטיים.</p>
          <div className="flex-1 overflow-auto space-y-3 py-2">
            {uniqueRecipients.map((name) => (
              <div key={name} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                <div className="text-sm truncate font-medium" title={name}>{name}</div>
                <Input
                  placeholder="שם מותאם..."
                  value={editedMappings[name] || ""}
                  onChange={(e) => setEditedMappings((prev) => ({ ...prev, [name]: e.target.value }))}
                />
                <Button
                  variant={irrelevantRecipients.has(name) ? "destructive" : "outline"}
                  size="sm"
                  className="text-xs whitespace-nowrap"
                  onClick={() => {
                    setIrrelevantRecipients((prev) => {
                      const next = new Set(prev);
                      if (next.has(name)) next.delete(name); else next.add(name);
                      return next;
                    });
                  }}
                >
                  {irrelevantRecipients.has(name) ? "לא רלוונטי" : "רלוונטי"}
                </Button>
              </div>
            ))}
            {uniqueRecipients.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">אין נמענים עדיין. העלה דוח כדי לייבא תנועות.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecipientDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleSaveRecipients} disabled={saveMappingsMutation.isPending}>
              {saveMappingsMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category change scope dialog */}
      <Dialog open={!!pendingCategoryChange} onOpenChange={(v) => !v && setPendingCategoryChange(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>החל את שינוי הקטגוריה</DialogTitle>
            <DialogDescription>
              לעדכן את הקטגוריה עבור כל הנמענים בשם "{pendingCategoryChange?.recipient}", או רק לתנועה זו ולעתיד?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingCategoryChange(null)}>ביטול</Button>
            <Button variant="secondary" onClick={() => applyCategoryChange("forward")}>מכאן ולהבא</Button>
            <Button onClick={() => applyCategoryChange("all")}>עבור כל הנמענים</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flag (relevant/subscription) change scope dialog */}
      <Dialog open={!!pendingFlagChange} onOpenChange={(v) => !v && setPendingFlagChange(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingFlagChange?.field === "relevant_transaction"
                ? `הגדרת רלוונטיות (${pendingFlagChange?.value ? "רלוונטי" : "לא רלוונטי"})`
                : `הגדרת מנוי (${pendingFlagChange?.value ? "מנוי" : "לא מנוי"})`}
            </DialogTitle>
            <DialogDescription>
              להחיל על כל הנמענים בשם "{pendingFlagChange?.recipient}" (כולל בדוחות עתידיים), רק מהתאריך {pendingFlagChange?.date} ולהבא, או רק לתנועה זו?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingFlagChange(null)}>ביטול</Button>
            <Button variant="ghost" onClick={() => applyFlagChange("single")}>רק לתנועה זו</Button>
            <Button variant="secondary" onClick={() => applyFlagChange("forward")}>מכאן ולהבא</Button>
            <Button onClick={() => applyFlagChange("all")}>הגדר עבור כל הנמענים בעלי אותו שם</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* For Whom scope dialog */}
      <Dialog open={!!pendingForWhom} onOpenChange={(v) => !v && setPendingForWhom(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>הגדרת "עבור מי"</DialogTitle>
            <DialogDescription>
              להחיל את הערך "{pendingForWhom?.value}" עבור הנמען "{pendingForWhom?.tx.source_recipient}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPendingForWhom(null)}>ביטול</Button>
            <Button variant="ghost" onClick={() => applyForWhom("single")}>רק לתנועה זו</Button>
            <Button variant="secondary" onClick={() => applyForWhom("past")}>כל ההיסטוריה (אותו נמען)</Button>
            <Button onClick={() => applyForWhom("always")}>תמיד (כולל עתיד)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
