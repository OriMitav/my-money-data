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

      {/* Global Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה״כ ברוטו משק בית</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה״כ מס הכנסה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{fmt(totalTax)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה״כ ביטוח לאומי</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{fmt(totalSocial)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Earner Tabs */}
      <div className="flex items-center gap-2 mb-2">
        <Button size="sm" onClick={() => setEarnerDialogOpen(true)}>
          <Plus className="ml-1 h-4 w-4" /> הוסף מפרנס
        </Button>
      </div>

      {earners.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין מפרנסים עדיין</h3>
            <p className="text-muted-foreground text-sm">הוסף מפרנס כדי להתחיל להזין נתוני הכנסות</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setSelectedEarner} dir="rtl">
          <TabsList className="flex-wrap h-auto">
            {earners.map((e) => (
              <TabsTrigger key={e.id} value={e.id}>{e.name}</TabsTrigger>
            ))}
          </TabsList>

          {earners.map((earner) => {
            const earnerEntries = entries.filter((e) => e.earner_id === earner.id);
            const earnerGross = earnerEntries.reduce((s, e) => s + Number(e.source1_gross) + Number(e.source2_gross) + Number(e.source3_gross), 0);
            const earnerTax = earnerEntries.reduce((s, e) => s + Number(e.source1_tax) + Number(e.source2_tax) + Number(e.source3_tax), 0);
            const earnerSocial = earnerEntries.reduce((s, e) => s + Number(e.source1_social) + Number(e.source2_social) + Number(e.source3_social), 0);

            return (
              <TabsContent key={earner.id} value={earner.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{earner.name}</h2>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => openNewEntry(earner.id)}>
                      <Plus className="ml-1 h-4 w-4" /> הוסף חודש
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteEarner.mutate(earner.id)}>
                      <Trash2 className="ml-1 h-4 w-4" /> מחק מפרנס
                    </Button>
                  </div>
                </div>

                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead rowSpan={2} className="border-l align-middle">חודש</TableHead>
                          <TableHead colSpan={3} className="text-center border-l">מקור 1</TableHead>
                          <TableHead colSpan={3} className="text-center border-l">מקור 2</TableHead>
                          <TableHead colSpan={3} className="text-center border-l">מקור 3</TableHead>
                          <TableHead rowSpan={2} className="align-middle w-16">פעולות</TableHead>
                        </TableRow>
                        <TableRow>
                          <TableHead className="text-xs">ברוטו</TableHead>
                          <TableHead className="text-xs">מס הכנסה</TableHead>
                          <TableHead className="text-xs border-l">ביטוח לאומי</TableHead>
                          <TableHead className="text-xs">ברוטו</TableHead>
                          <TableHead className="text-xs">מס הכנסה</TableHead>
                          <TableHead className="text-xs border-l">ביטוח לאומי</TableHead>
                          <TableHead className="text-xs">ברוטו</TableHead>
                          <TableHead className="text-xs">מס הכנסה</TableHead>
                          <TableHead className="text-xs border-l">ביטוח לאומי</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {earnerEntries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                              אין נתונים עדיין. לחץ "הוסף חודש" כדי להתחיל.
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {earnerEntries.map((entry) => (
                              <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditEntry(entry)}>
                                <TableCell className="border-l font-medium whitespace-nowrap">
                                  {MONTHS[entry.month - 1]} {entry.year}
                                </TableCell>
                                <TableCell className="text-xs">{fmt(Number(entry.source1_gross))}</TableCell>
                                <TableCell className="text-xs">{fmt(Number(entry.source1_tax))}</TableCell>
                                <TableCell className="text-xs border-l">{fmt(Number(entry.source1_social))}</TableCell>
                                <TableCell className="text-xs">{fmt(Number(entry.source2_gross))}</TableCell>
                                <TableCell className="text-xs">{fmt(Number(entry.source2_tax))}</TableCell>
                                <TableCell className="text-xs border-l">{fmt(Number(entry.source2_social))}</TableCell>
                                <TableCell className="text-xs">{fmt(Number(entry.source3_gross))}</TableCell>
                                <TableCell className="text-xs">{fmt(Number(entry.source3_tax))}</TableCell>
                                <TableCell className="text-xs border-l">{fmt(Number(entry.source3_social))}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteEntry.mutate(entry.id); }}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/30 font-semibold">
                              <TableCell className="border-l">סה״כ</TableCell>
                              <TableCell colSpan={3} className="text-center border-l">
                                ברוטו: {fmt(earnerGross)} | מס: {fmt(earnerTax)} | ביטוח: {fmt(earnerSocial)}
                              </TableCell>
                              <TableCell colSpan={6}></TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Add Earner Dialog */}
      <Dialog open={earnerDialogOpen} onOpenChange={setEarnerDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>הוסף מפרנס</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם המפרנס</Label>
              <Input value={newEarnerName} onChange={(e) => setNewEarnerName(e.target.value)} placeholder="לדוגמה: אבא" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEarnerDialogOpen(false)}>ביטול</Button>
            <Button onClick={() => { if (newEarnerName.trim()) createEarner.mutate(newEarnerName.trim()); }} disabled={createEarner.isPending}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editEntryId ? "עריכת נתוני חודש" : "הוסף נתוני חודש"}</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שנה</Label>
                <Input type="number" value={entryForm.year} onChange={(e) => setEntryForm({ ...entryForm, year: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>חודש</Label>
                <Select value={String(entryForm.month)} onValueChange={(v) => setEntryForm({ ...entryForm, month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {[
              { label: "מקור הכנסה 1", gKey: "s1g" as const, tKey: "s1t" as const, sKey: "s1s" as const },
              { label: "מקור הכנסה 2", gKey: "s2g" as const, tKey: "s2t" as const, sKey: "s2s" as const },
              { label: "מקור הכנסה 3", gKey: "s3g" as const, tKey: "s3t" as const, sKey: "s3s" as const },
            ].map((src) => (
              <div key={src.label} className="space-y-3">
                <Label className="font-semibold">{src.label}</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">ברוטו</Label>
                    <Input type="number" value={entryForm[src.gKey] || ""} onChange={(e) => setEntryForm({ ...entryForm, [src.gKey]: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">מס הכנסה</Label>
                    <Input type="number" value={entryForm[src.tKey] || ""} onChange={(e) => setEntryForm({ ...entryForm, [src.tKey]: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">ביטוח לאומי</Label>
                    <Input type="number" value={entryForm[src.sKey] || ""} onChange={(e) => setEntryForm({ ...entryForm, [src.sKey]: Number(e.target.value) })} />
                  </div>
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
