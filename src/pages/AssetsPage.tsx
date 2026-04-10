import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose, DrawerDescription } from "@/components/ui/drawer";
import { Plus, Building2, Settings2, Home, Loader2, RefreshCw, ArrowLeft, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const fmt = (n: number) => n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

interface Property {
  id: string;
  user_id: string;
  title: string;
  city: string;
  street: string;
  house_number: string;
  purchase_price: number;
  apify_token: string;
  apify_actor_sale_id: string;
  apify_actor_rent_id: string;
  apify_rent_input: Record<string, unknown>;
  apify_sale_input: Record<string, unknown>;
}

interface Snapshot {
  id: string;
  property_id: string;
  type: string;
  year: number;
  month: number;
  avg_price: number;
  sample_size: number;
  std_deviation: number;
  raw_data: any[];
}

interface FetchApifyResponse {
  ok: boolean;
  data?: {
    snapshot?: Snapshot;
    itemCount?: number;
    message?: string;
  };
  error?: string;
  diagnostics?: {
    actorId?: string;
    runId?: string;
    status?: string;
    requestedUrl?: string;
    stage?: string;
  };
}

export default function AssetsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drawerData, setDrawerData] = useState<any[] | null>(null);
  const [fetchingType, setFetchingType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("rent");
  const [fetchError, setFetchError] = useState<{ message: string; details?: string } | null>(null);

  // Form state
  const [form, setForm] = useState({ title: "", city: "", street: "", house_number: "", purchase_price: 0, apify_token: "", apify_actor_sale_id: "", apify_actor_rent_id: "" });

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").order("created_at");
      if (error) throw error;
      return data as Property[];
    },
    enabled: !!user,
  });

  const { data: allSnapshots = [] } = useQuery({
    queryKey: ["property_snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("property_snapshots").select("*").order("year").order("month");
      if (error) throw error;
      return data as Snapshot[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (f: typeof form) => {
      const { error } = await supabase.from("properties").insert({ ...f, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["properties"] }); setShowCreate(false); toast.success("נכס נוסף"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...vals }: Partial<Property> & { id: string }) => {
      const { error } = await supabase.from("properties").update(vals).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["properties"] }); toast.success("עודכן"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["properties"] }); qc.invalidateQueries({ queryKey: ["property_snapshots"] }); setSelectedProperty(null); toast.success("נמחק"); },
    onError: (e: any) => toast.error(e.message),
  });

  const fetchApifyData = async (property: Property, type: "sale" | "rent") => {
    const actorId = type === "sale" ? property.apify_actor_sale_id : property.apify_actor_rent_id;
    if (!property.apify_token || !actorId) {
      toast.error("חסר טוקן Apify או מזהה Actor");
      return;
    }
    setFetchingType(type);
    setFetchError(null);
    const now = new Date();
    try {
      const actorInput = type === "sale" ? property.apify_sale_input : property.apify_rent_input;
      const res = await supabase.functions.invoke<FetchApifyResponse>("fetch-apify-data", {
        body: {
          property_id: property.id,
          apify_token: property.apify_token,
          actor_id: actorId,
          type,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          actor_input: actorInput,
        },
      });

      if (res.error) {
        throw new Error(res.error.message || "שגיאה בשליפת נתונים");
      }

      if (!res.data?.ok) {
        const details = [
          res.data?.diagnostics?.status ? `סטטוס: ${res.data.diagnostics.status}` : null,
          res.data?.diagnostics?.runId ? `Run ID: ${res.data.diagnostics.runId}` : null,
          res.data?.diagnostics?.stage ? `שלב: ${res.data.diagnostics.stage}` : null,
        ].filter(Boolean).join(" • ");

        setFetchError({
          message: res.data?.error || "שליפת הנתונים נכשלה",
          details: details || res.data?.data?.message,
        });
        toast.error(res.data?.error || "שליפת הנתונים נכשלה");
        return;
      }

      toast.success(`נשלפו ${res.data.data?.itemCount || 0} רשומות`);
      qc.invalidateQueries({ queryKey: ["property_snapshots"] });
    } catch (e: any) {
      const message = e.message || "שגיאה בשליפת נתונים";
      setFetchError({ message });
      toast.error(message);
    } finally {
      setFetchingType(null);
    }
  };

  const getSnapshotsForProperty = (propertyId: string, type: string) =>
    allSnapshots.filter(s => s.property_id === propertyId && s.type === type)
      .sort((a, b) => b.year - a.year || b.month - a.month);

  const getLatestSnapshot = (propertyId: string, type: string) => {
    const snaps = getSnapshotsForProperty(propertyId, type);
    return snaps.length > 0 ? snaps[0] : null;
  };

  const getSparklineData = (propertyId: string, type: string) => {
    const snaps = getSnapshotsForProperty(propertyId, type).slice(0, 6).reverse();
    return snaps.map(s => ({ label: `${s.month}/${s.year}`, value: s.avg_price }));
  };

  const calcGrossYield = (property: Property) => {
    const rentSnap = getLatestSnapshot(property.id, "rent");
    const saleSnap = getLatestSnapshot(property.id, "sale");
    if (!rentSnap || !saleSnap || saleSnap.avg_price === 0) return null;
    return (rentSnap.avg_price * 12) / saleSnap.avg_price;
  };

  // ===== MAIN VIEW: Property Grid =====
  if (!selectedProperty) {
    return (
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-0" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">נכסים</h1>
          <Button onClick={() => { setForm({ title: "", city: "", street: "", house_number: "", purchase_price: 0, apify_token: "", apify_actor_sale_id: "", apify_actor_rent_id: "" }); setShowCreate(true); }}>
            <Plus className="h-4 w-4 ml-1" /> הוסף נכס
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>
        ) : properties.length === 0 ? (
          <Card><CardContent className="p-8 sm:p-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין נכסים</h3>
            <p className="text-muted-foreground text-sm">הוסף נכס כדי להתחיל לעקוב אחרי ההשקעות שלך</p>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map(p => {
              const latestRent = getLatestSnapshot(p.id, "rent");
              const latestSale = getLatestSnapshot(p.id, "sale");
              const grossYield = calcGrossYield(p);
              return (
                <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedProperty(p)}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Home className="h-5 w-5 text-primary" />
                      {p.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{[p.street, p.house_number, p.city].filter(Boolean).join(", ")}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">שווי שוק</p>
                        <p className="font-semibold">{latestSale ? fmt(latestSale.avg_price) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">שכירות ממוצעת</p>
                        <p className="font-semibold">{latestRent ? fmt(latestRent.avg_price) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">מחיר קנייה</p>
                        <p className="font-semibold">{fmt(p.purchase_price)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">תשואה גולמית</p>
                        <p className="font-semibold">{grossYield !== null ? (grossYield * 100).toFixed(1) + "%" : "—"}</p>
                      </div>
                    </div>
                    {/* Sparkline */}
                    {getSparklineData(p.id, "sale").length > 1 && (
                      <div className="h-12">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={getSparklineData(p.id, "sale")}>
                            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>הוסף נכס</DialogTitle><DialogDescription>הזן פרטי נכס בסיסיים כדי להתחיל לעקוב אחריו.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label>כותרת</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>עיר</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div><Label>רחוב</Label><Input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} /></div>
                <div><Label>מספר</Label><Input value={form.house_number} onChange={e => setForm(f => ({ ...f, house_number: e.target.value }))} /></div>
              </div>
              <div><Label>מחיר קנייה</Label><Input type="number" value={form.purchase_price || ""} onChange={e => setForm(f => ({ ...f, purchase_price: Number(e.target.value) }))} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.title || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "צור"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ===== DETAIL VIEW: Single Property =====
  const prop = selectedProperty;
  const snapRent = getSnapshotsForProperty(prop.id, "rent");
  const snapSale = getSnapshotsForProperty(prop.id, "sale");
  const grossYield = calcGrossYield(prop);

  const settingsForm = { ...prop };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-0" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={() => setSelectedProperty(null)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{prop.title}</h1>
          <p className="text-sm text-muted-foreground">{[prop.street, prop.house_number, prop.city].filter(Boolean).join(", ")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
          <Settings2 className="h-4 w-4 ml-1" /> הגדרות
        </Button>
        <Button variant="destructive" size="sm" onClick={() => { if (confirm("למחוק את הנכס?")) deleteMutation.mutate(prop.id); }}>
          מחק
        </Button>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">מחיר קנייה</p>
          <p className="text-lg font-bold">{fmt(prop.purchase_price)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">שווי שוק</p>
          <p className="text-lg font-bold">{getLatestSnapshot(prop.id, "sale")?.avg_price ? fmt(getLatestSnapshot(prop.id, "sale")!.avg_price) : "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">שכירות ממוצעת</p>
          <p className="text-lg font-bold">{getLatestSnapshot(prop.id, "rent")?.avg_price ? fmt(getLatestSnapshot(prop.id, "rent")!.avg_price) : "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">תשואה גולמית</p>
          <p className="text-lg font-bold text-primary">{grossYield !== null ? (grossYield * 100).toFixed(1) + "%" : "—"}</p>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="w-full flex overflow-x-auto">
          <TabsTrigger value="rent" className="flex-1 text-xs sm:text-sm">ניתוח שכירות</TabsTrigger>
          <TabsTrigger value="sale" className="flex-1 text-xs sm:text-sm">שווי נכס</TabsTrigger>
        </TabsList>

        <TabsContent value="rent">
          <SnapshotMatrix
            snapshots={snapRent}
            label="שכירות"
            onFetch={() => fetchApifyData(prop, "rent")}
            fetching={fetchingType === "rent"}
            hasActor={!!prop.apify_actor_rent_id && !!prop.apify_token}
            onViewRaw={setDrawerData}
            error={activeTab === "rent" ? fetchError : null}
          />
        </TabsContent>

        <TabsContent value="sale">
          <SnapshotMatrix
            snapshots={snapSale}
            label="מכירה"
            onFetch={() => fetchApifyData(prop, "sale")}
            fetching={fetchingType === "sale"}
            hasActor={!!prop.apify_actor_sale_id && !!prop.apify_token}
            onViewRaw={setDrawerData}
            error={activeTab === "sale" ? fetchError : null}
          />
        </TabsContent>
      </Tabs>

      {/* Settings dialog */}
      <PropertySettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        property={prop}
        onSave={(vals) => {
          updateMutation.mutate({ id: prop.id, ...vals });
          setSelectedProperty({ ...prop, ...vals });
        }}
      />

      {/* Raw data drawer */}
      <Drawer open={!!drawerData} onOpenChange={(o) => !o && setDrawerData(null)}>
        <DrawerContent dir="rtl" className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>נתונים גולמיים ({drawerData?.length || 0} רשומות)</DrawerTitle>
            <DrawerDescription>רשימת הרשומות המלאה שנשלפה עבור החודש הנבחר.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שכונה</TableHead>
                  <TableHead>כתובת</TableHead>
                  <TableHead>שטח (מ״ר)</TableHead>
                  <TableHead>חדרים</TableHead>
                  <TableHead>מחיר</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drawerData || []).map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{item.neighbourhood}</TableCell>
                    <TableCell className="text-xs">{item.address}</TableCell>
                    <TableCell>{item.areaSqm}</TableCell>
                    <TableCell>{item.rooms}</TableCell>
                    <TableCell>{fmt(item.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="p-4 flex justify-end">
            <DrawerClose asChild><Button variant="outline">סגור</Button></DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ===== Sub-components =====

function SnapshotMatrix({ snapshots, label, onFetch, fetching, hasActor, onViewRaw, error }: {
  snapshots: Snapshot[];
  label: string;
  onFetch: () => void;
  fetching: boolean;
  hasActor: boolean;
  onViewRaw: (data: any[]) => void;
  error: { message: string; details?: string } | null;
}) {
  const chartData = useMemo(() => {
    return [...snapshots].reverse().map(s => ({
      label: `${MONTHS[s.month - 1]} ${s.year}`,
      avg: s.avg_price,
    }));
  }, [snapshots]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
        <CardTitle className="text-base">ניתוח {label}</CardTitle>
        {hasActor && (
          <Button size="sm" variant="outline" onClick={onFetch} disabled={fetching}>
            {fetching ? <Loader2 className="animate-spin h-4 w-4 ml-1" /> : <RefreshCw className="h-4 w-4 ml-1" />}
            שלוף נתונים
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{error.message}</AlertTitle>
            {error.details && <AlertDescription>{error.details}</AlertDescription>}
          </Alert>
        )}

        {/* Chart */}
        {chartData.length > 1 && (
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                <RTooltip formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="avg" name={`מחיר ממוצע`} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table */}
        {snapshots.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            {hasActor ? "לחץ על \"שלוף נתונים\" כדי להתחיל" : "הגדר טוקן Apify ו-Actor ID בהגדרות"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>חודש</TableHead>
                  <TableHead>מחיר ממוצע</TableHead>
                  <TableHead>גודל מדגם</TableHead>
                  <TableHead>סטיית תקן</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map(s => {
                  // Inline sparkline data (last 6 months up to this snapshot)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap">{MONTHS[s.month - 1]} {s.year}</TableCell>
                      <TableCell className="font-medium">{fmt(s.avg_price)}</TableCell>
                      <TableCell>{s.sample_size}</TableCell>
                      <TableCell>{fmt(s.std_deviation)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => onViewRaw(s.raw_data || [])}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PropertySettingsDialog({ open, onOpenChange, property, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  property: Property;
  onSave: (vals: Partial<Property>) => void;
}) {
  const [f, setF] = useState<Partial<Property>>({});

  const val = (key: keyof Property) => (f[key] !== undefined ? f[key] : property[key]) as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle>הגדרות נכס</DialogTitle><DialogDescription>עריכת פרטי נכס וחיבור השליפה האוטומטית.</DialogDescription></DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">פרטי נכס</h3>
            <div><Label>כותרת</Label><Input value={val("title")} onChange={e => setF(p => ({ ...p, title: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>עיר</Label><Input value={val("city")} onChange={e => setF(p => ({ ...p, city: e.target.value }))} /></div>
              <div><Label>רחוב</Label><Input value={val("street")} onChange={e => setF(p => ({ ...p, street: e.target.value }))} /></div>
              <div><Label>מספר</Label><Input value={val("house_number")} onChange={e => setF(p => ({ ...p, house_number: e.target.value }))} /></div>
            </div>
            <div><Label>מחיר קנייה</Label><Input type="number" value={val("purchase_price") || ""} onChange={e => setF(p => ({ ...p, purchase_price: Number(e.target.value) }))} /></div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">חיבור Apify</h3>
            <div><Label>טוקן API</Label><Input type="password" value={val("apify_token")} onChange={e => setF(p => ({ ...p, apify_token: e.target.value }))} placeholder="apify_api_..." /></div>
            <div><Label>Actor ID - מכירה</Label><Input value={val("apify_actor_sale_id")} onChange={e => setF(p => ({ ...p, apify_actor_sale_id: e.target.value }))} placeholder="username/actor-name" /></div>
            <div><Label>Actor Input - מכירה (JSON)</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[60px]"
                value={typeof val("apify_sale_input") === "object" ? JSON.stringify(val("apify_sale_input"), null, 2) : val("apify_sale_input") || "{}"}
                onChange={e => { try { setF(p => ({ ...p, apify_sale_input: JSON.parse(e.target.value) })); } catch {} }}
                placeholder='{"city": 1200, "rooms": 4}'
              />
            </div>
            <div><Label>Actor ID - שכירות</Label><Input value={val("apify_actor_rent_id")} onChange={e => setF(p => ({ ...p, apify_actor_rent_id: e.target.value }))} placeholder="username/actor-name" /></div>
            <div><Label>Actor Input - שכירות (JSON)</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[60px]"
                value={typeof val("apify_rent_input") === "object" ? JSON.stringify(val("apify_rent_input"), null, 2) : val("apify_rent_input") || "{}"}
                onChange={e => { try { setF(p => ({ ...p, apify_rent_input: JSON.parse(e.target.value) })); } catch {} }}
                placeholder='{"city": 1200, "rooms": 4}'
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={() => { onSave(f); onOpenChange(false); }}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
