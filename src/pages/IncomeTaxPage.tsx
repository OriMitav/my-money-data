import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

interface Earner {
  id: string;
  name: string;
  user_id: string;
}

interface IncomeEntry {
  id: string;
  earner_id: string;
  year: number;
  month: number;
  source1_employer: string;
  source1_gross: number;
  source1_tax: number;
  source1_social: number;
  source2_employer: string;
  source2_gross: number;
  source2_tax: number;
  source2_social: number;
  source3_employer: string;
  source3_gross: number;
  source3_tax: number;
  source3_social: number;
}

export default function IncomeTaxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [earnerDialogOpen, setEarnerDialogOpen] = useState(false);
  const [newEarnerName, setNewEarnerName] = useState("");
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [selectedEarner, setSelectedEarner] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({ year: new Date().getFullYear(), month: 1,
    s1e: "", s1g: 0, s1t: 0, s1s: 0, s2e: "", s2g: 0, s2t: 0, s2s: 0, s3e: "", s3g: 0, s3t: 0, s3s: 0 });
  const [editEntryId, setEditEntryId] = useState<string | null>(null);

  const { data: earners = [] } = useQuery({
    queryKey: ["earners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("earners").select("*").order("created_at");
      if (error) throw error;
      return data as Earner[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["income_entries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("income_entries").select("*").order("year").order("month");
      if (error) throw error;
      return data as IncomeEntry[];
    },
  });

  const createEarner = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("earners").insert({ name, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["earners"] }); setEarnerDialogOpen(false); setNewEarnerName(""); toast.success("מפרנס נוסף"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEarner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("earners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["earners"] }); qc.invalidateQueries({ queryKey: ["income_entries"] }); toast.success("מפרנס נמחק"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertEntry = useMutation({
    mutationFn: async () => {
      if (!selectedEarner) return;
      const payload = {
        user_id: user!.id,
        earner_id: selectedEarner,
        year: entryForm.year,
        month: entryForm.month,
        source1_employer: entryForm.s1e,
        source1_gross: entryForm.s1g,
        source1_tax: entryForm.s1t,
        source1_social: entryForm.s1s,
        source2_employer: entryForm.s2e,
        source2_gross: entryForm.s2g,
        source2_tax: entryForm.s2t,
        source2_social: entryForm.s2s,
        source3_employer: entryForm.s3e,
        source3_gross: entryForm.s3g,
        source3_tax: entryForm.s3t,
        source3_social: entryForm.s3s,
      };
      if (editEntryId) {
        const { error } = await supabase.from("income_entries").update(payload).eq("id", editEntryId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("income_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["income_entries"] }); setEntryDialogOpen(false); setEditEntryId(null); toast.success("נשמר"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("income_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["income_entries"] }); toast.success("נמחק"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Global totals
  const totalGross = entries.reduce((s, e) => s + Number(e.source1_gross) + Number(e.source2_gross) + Number(e.source3_gross), 0);
  const totalTax = entries.reduce((s, e) => s + Number(e.source1_tax) + Number(e.source2_tax) + Number(e.source3_tax), 0);
  const totalSocial = entries.reduce((s, e) => s + Number(e.source1_social) + Number(e.source2_social) + Number(e.source3_social), 0);

  // Per-earner totals
  const earnerTotals = earners.map((earner) => {
    const earnerEntries = entries.filter((e) => e.earner_id === earner.id);
    return {
      name: earner.name,
      gross: earnerEntries.reduce((s, e) => s + Number(e.source1_gross) + Number(e.source2_gross) + Number(e.source3_gross), 0),
      tax: earnerEntries.reduce((s, e) => s + Number(e.source1_tax) + Number(e.source2_tax) + Number(e.source3_tax), 0),
      social: earnerEntries.reduce((s, e) => s + Number(e.source1_social) + Number(e.source2_social) + Number(e.source3_social), 0),
    };
  });

  const fmt = (n: number) => n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

  const openNewEntry = (earnerId: string) => {
    setSelectedEarner(earnerId);
    setEditEntryId(null);
    setEntryForm({ year: new Date().getFullYear(), month: new Date().getMonth() + 1,
      s1e: "", s1g: 0, s1t: 0, s1s: 0, s2e: "", s2g: 0, s2t: 0, s2s: 0, s3e: "", s3g: 0, s3t: 0, s3s: 0 });
    setEntryDialogOpen(true);
  };

  const openEditEntry = (entry: IncomeEntry) => {
    setSelectedEarner(entry.earner_id);
    setEditEntryId(entry.id);
    setEntryForm({
      year: entry.year, month: entry.month,
      s1e: entry.source1_employer || "", s1g: Number(entry.source1_gross), s1t: Number(entry.source1_tax), s1s: Number(entry.source1_social),
      s2e: entry.source2_employer || "", s2g: Number(entry.source2_gross), s2t: Number(entry.source2_tax), s2s: Number(entry.source2_social),
      s3e: entry.source3_employer || "", s3g: Number(entry.source3_gross), s3t: Number(entry.source3_tax), s3s: Number(entry.source3_social),
    });
    setEntryDialogOpen(true);
  };

  const activeTab = selectedEarner || earners[0]?.id || "";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">הכנסות ומיסוי</h1>

      {/* Overall Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה״כ ברוטו משק בית</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalGross)}</p>
            <div className="mt-2 space-y-1">
              {earnerTotals.map((et) => (
                <div key={et.name} className="flex justify-between text-xs text-muted-foreground">
                  <span>{et.name}</span>
                  <span>{fmt(et.gross)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה״כ מס הכנסה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{fmt(totalTax)}</p>
            <div className="mt-2 space-y-1">
              {earnerTotals.map((et) => (
                <div key={et.name} className="flex justify-between text-xs text-muted-foreground">
                  <span>{et.name}</span>
                  <span>{fmt(et.tax)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה״כ ביטוח לאומי</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{fmt(totalSocial)}</p>
            <div className="mt-2 space-y-1">
              {earnerTotals.map((et) => (
                <div key={et.name} className="flex justify-between text-xs text-muted-foreground">
                  <span>{et.name}</span>
                  <span>{fmt(et.social)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => upsertEntry.mutate()} disabled={upsertEntry.isPending}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
