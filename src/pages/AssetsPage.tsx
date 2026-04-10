import { useState, useMemo, useEffect, useRef } from "react";
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
import { Plus, Building2, Settings2, Home, Loader2, RefreshCw, ArrowLeft, Eye, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import modiinPolygons from "@/assets/modiin_polygons.json";

const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const fmt = (n: number) => n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const pct = (n: number) => (n * 100).toFixed(1) + "%";

interface Property {
  id: string;
  user_id: string;
  title: string;
  city: string;
  street: string;
  house_number: string;
  purchase_price: number;
  monthly_rent_income: number;
  apify_token: string;
  apify_actor_sale_id: string;
  apify_actor_rent_id: string;
  apify_rent_input: Record<string, any>;
  apify_sale_input: Record<string, any>;
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
      const { error } = await supabase.from("properties").update(vals as any).eq("id", id);
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

  const fetchApifyData = async (property: Property, type: "sale" | "rent", overrideYear?: number, overrideMonth?: number) => {
    const actorId = type === "sale" ? property.apify_actor_sale_id : property.apify_actor_rent_id;
    if (!property.apify_token || !actorId) {
      toast.error("חסר טוקן Apify או מזהה Actor");
      return;
    }
    setFetchingType(type);
    setFetchError(null);
    const now = new Date();
    const year = overrideYear ?? now.getFullYear();
    const month = overrideMonth ?? (now.getMonth() + 1);
    try {
      const actorInput = type === "sale" ? property.apify_sale_input : property.apify_rent_input;
      const res = await supabase.functions.invoke<FetchApifyResponse>("fetch-apify-data", {
        body: {
          property_id: property.id,
          apify_token: property.apify_token,
          actor_id: actorId,
          type,
          year,
          month,
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
                        <p className="font-semibold">{grossYield !== null ? pct(grossYield) : "—"}</p>
                      </div>
                    </div>
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
  const latestSale = getLatestSnapshot(prop.id, "sale");
  const latestRent = getLatestSnapshot(prop.id, "rent");

  const marketValue = latestSale?.avg_price ?? null;
  const valueChange = marketValue !== null && prop.purchase_price > 0
    ? ((marketValue - prop.purchase_price) / prop.purchase_price)
    : null;

  const monthlyRent = prop.monthly_rent_income || 0;
  const yieldVsPurchase = monthlyRent > 0 && prop.purchase_price > 0
    ? (monthlyRent * 12) / prop.purchase_price
    : null;

  const avgRent = latestRent?.avg_price ?? null;
  const yieldAvgRentVsMarket = avgRent !== null && marketValue !== null && marketValue > 0
    ? (avgRent * 12) / marketValue
    : null;

  const handleRentIncomeUpdate = (value: number) => {
    updateMutation.mutate({ id: prop.id, monthly_rent_income: value } as any);
    setSelectedProperty({ ...prop, monthly_rent_income: value });
  };

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

      {/* Two info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Purchase Price + Market Value + Value Change */}
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">מחיר קנייה</p>
            <p className="text-2xl font-bold">{fmt(prop.purchase_price)}</p>
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">שווי שוק עדכני:</span>
                <span className="text-sm font-semibold">{marketValue !== null ? fmt(marketValue) : "—"}</span>
              </div>
              {valueChange !== null && (
                <div className="flex items-center gap-1">
                  {valueChange >= 0
                    ? <TrendingUp className="h-4 w-4 text-green-500" />
                    : <TrendingDown className="h-4 w-4 text-red-500" />
                  }
                  <span className={`text-sm font-semibold ${valueChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {valueChange >= 0 ? "+" : ""}{pct(valueChange)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({valueChange >= 0 ? "+" : ""}{fmt(marketValue! - prop.purchase_price)})
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Rental Income + Yields */}
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">שכירות נוכחית</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="w-32 text-lg font-bold h-9"
                value={monthlyRent || ""}
                placeholder="0"
                onChange={e => {
                  const v = Number(e.target.value);
                  setSelectedProperty({ ...prop, monthly_rent_income: v });
                }}
                onBlur={e => handleRentIncomeUpdate(Number(e.target.value))}
              />
              <span className="text-xs text-muted-foreground">₪/חודש</span>
              {yieldVsPurchase !== null && (
                <span className="text-sm font-semibold text-primary mr-2">
                  תשואה {pct(yieldVsPurchase)}
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">שכירות ממוצעת באזור:</span>
                <span className="text-sm font-semibold">{avgRent !== null ? fmt(avgRent) : "—"}</span>
                {yieldAvgRentVsMarket !== null && (
                  <span className="text-xs text-muted-foreground">
                    (תשואה {pct(yieldAvgRentVsMarket)} לפי שווי שוק)
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
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
            onFetch={(y, m) => fetchApifyData(prop, "rent", y, m)}
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
            onFetch={(y, m) => fetchApifyData(prop, "sale", y, m)}
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
        <DrawerContent dir="rtl" className="max-h-[80vh] z-[1000]">
          <DrawerHeader>
            <DrawerTitle>נתונים גולמיים ({drawerData?.length || 0} רשומות)</DrawerTitle>
            <DrawerDescription>רשימת הרשומות המלאה שנשלפה עבור החודש הנבחר.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-center">שכונה</TableHead>
                  <TableHead className="text-center">כתובת</TableHead>
                  <TableHead className="text-center">שטח (מ״ר)</TableHead>
                  <TableHead className="text-center">חדרים</TableHead>
                  <TableHead className="text-center">מחיר</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drawerData || []).map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-center">{item.neighbourhood}</TableCell>
                    <TableCell className="text-xs text-center">{item.address}</TableCell>
                    <TableCell className="text-center">{item.areaSqm ?? item.area ?? "—"}</TableCell>
                    <TableCell className="text-center">{item.rooms}</TableCell>
                    <TableCell className="text-center">{fmt(item.price)}</TableCell>
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

const MODIIN_CENTER: [number, number] = [31.897, 35.010];

function NeighbourhoodHeatmap({ snapshots }: { snapshots: Snapshot[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);

  const data = useMemo(() => {
    const latest = snapshots.length > 0 ? snapshots[0] : null;
    if (!latest || !Array.isArray(latest.raw_data) || latest.raw_data.length === 0) return {};
    const map: Record<string, { count: number; totalPrice: number; totalArea: number }> = {};
    for (const item of latest.raw_data as any[]) {
      const hood = item.neighbourhood || item.neighborhood || "לא ידוע";
      if (!map[hood]) map[hood] = { count: 0, totalPrice: 0, totalArea: 0 };
      map[hood].count++;
      map[hood].totalPrice += Number(item.price) || 0;
      map[hood].totalArea += Number(item.areaSqm) || 0;
    }
    return map;
  }, [snapshots]);

  useEffect(() => {
    if (!mapRef.current || Object.keys(data).length === 0) return;
    if (leafletMap.current) {
      leafletMap.current.remove();
      leafletMap.current = null;
    }

    const map = L.map(mapRef.current, { zoomControl: true }).setView(MODIIN_CENTER, 13);
    leafletMap.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const maxCount = Math.max(...Object.values(data).map(d => d.count), 1);

    // Add GeoJSON polygons
    L.geoJSON(modiinPolygons as any, {
      style: (feature) => {
        const name = feature?.properties?.name;
        const hood = name ? data[name] : null;
        const intensity = hood ? hood.count / maxCount : 0;
        return {
          fillColor: hood
            ? `hsl(20, 90%, ${55 - intensity * 25}%)`
            : "hsl(0, 0%, 85%)",
          fillOpacity: hood ? 0.5 + intensity * 0.4 : 0.15,
          color: hood ? "#c44" : "#999",
          weight: hood ? 2 : 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name;
        const hood = name ? data[name] : null;

        // Always show neighbourhood label
        const center = (layer as any).getBounds?.()?.getCenter?.();
        if (center) {
          L.marker(center, {
            icon: L.divIcon({
              className: "neighbourhood-label",
              html: `<span style="font-size:11px;font-weight:bold;color:#333;text-shadow:1px 1px 2px #fff,-1px -1px 2px #fff;white-space:nowrap">${name}</span>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
          }).addTo(leafletMap.current!);
        }

        if (hood) {
          const avgPrice = Math.round(hood.totalPrice / hood.count);
          const avgArea = Math.round(hood.totalArea / hood.count);
          layer.bindPopup(
            `<div dir="rtl" style="text-align:right;min-width:140px">
              <div style="font-weight:bold;margin-bottom:4px">${name}</div>
              <div>יחידות: <strong>${hood.count}</strong></div>
              <div>מחיר ממוצע: <strong>${fmt(avgPrice)}</strong></div>
              <div>שטח ממוצע: <strong>${avgArea} מ״ר</strong></div>
            </div>`
          );
        } else {
          layer.bindPopup(
            `<div dir="rtl" style="text-align:right"><div style="font-weight:bold">${name}</div><div>אין נתונים</div></div>`
          );
        }
      },
    }).addTo(map);

    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, [data]);

  if (Object.keys(data).length === 0) return null;

  return (
    <Card className="relative z-0">
      <CardHeader className="pb-2"><CardTitle className="text-base">התפלגות לפי שכונות</CardTitle></CardHeader>
      <CardContent>
        <div ref={mapRef} className="h-[400px] rounded-lg overflow-hidden" dir="ltr" />
      </CardContent>
    </Card>
  );
}

function SnapshotMatrix({ snapshots, label, onFetch, fetching, hasActor, onViewRaw, error }: {
  snapshots: Snapshot[];
  label: string;
  onFetch: (year?: number, month?: number) => void;
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

  const handleRefresh = () => {
    if (snapshots.length > 0) {
      const latest = snapshots[0];
      onFetch(latest.year, latest.month);
    } else {
      onFetch();
    }
  };

  return (
    <div className="space-y-4">
      <Card className="relative z-0">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
          <CardTitle className="text-base">ניתוח {label}</CardTitle>
          {hasActor && (
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={fetching}>
              {fetching ? <Loader2 className="animate-spin h-4 w-4 ml-1" /> : <RefreshCw className="h-4 w-4 ml-1" />}
              רענן נתונים
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

          {snapshots.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              {hasActor ? "לחץ על \"רענן נתונים\" כדי להתחיל" : "הגדר טוקן Apify ו-Actor ID בהגדרות"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">חודש</TableHead>
                    <TableHead className="text-center">מחיר ממוצע</TableHead>
                    <TableHead className="text-center">גודל מדגם</TableHead>
                    <TableHead className="text-center">סטיית תקן</TableHead>
                    <TableHead className="text-center w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="text-center whitespace-nowrap">{MONTHS[s.month - 1]} {s.year}</TableCell>
                      <TableCell className="text-center font-medium">{fmt(s.avg_price)}</TableCell>
                      <TableCell className="text-center">{s.sample_size}</TableCell>
                      <TableCell className="text-center">{fmt(s.std_deviation)}</TableCell>
                      <TableCell className="text-center">
                        <Button size="icon" variant="ghost" onClick={() => onViewRaw(s.raw_data || [])}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <NeighbourhoodHeatmap snapshots={snapshots} />
    </div>
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

  const saleInput = (f.apify_sale_input !== undefined ? f.apify_sale_input : property.apify_sale_input) as Record<string, any> || {};
  const rentInput = (f.apify_rent_input !== undefined ? f.apify_rent_input : property.apify_rent_input) as Record<string, any> || {};

  const updateSaleInput = (key: string, value: any) => {
    const current = { ...saleInput };
    if (value === "" || value === undefined) { delete current[key]; } else { current[key] = value; }
    setF(p => ({ ...p, apify_sale_input: current }));
  };

  const updateRentInput = (key: string, value: any) => {
    const current = { ...rentInput };
    if (value === "" || value === undefined) { delete current[key]; } else { current[key] = value; }
    current.dealType = "rent";
    setF(p => ({ ...p, apify_rent_input: current }));
  };

  const handleSave = () => {
    const finalF = { ...f };
    const finalRent = { ...(finalF.apify_rent_input as Record<string, any> || rentInput) };
    finalRent.dealType = "rent";
    finalF.apify_rent_input = finalRent;
    onSave(finalF);
    onOpenChange(false);
  };

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
          </div>

          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">הגדרות שליפה - מכירה</h3>
            <div><Label>Actor ID</Label><Input value={val("apify_actor_sale_id")} onChange={e => setF(p => ({ ...p, apify_actor_sale_id: e.target.value }))} placeholder="username/actor-name" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>קוד עיר</Label><Input value={saleInput.city || ""} onChange={e => updateSaleInput("city", e.target.value)} placeholder="לדוגמה: 1200" /></div>
              <div><Label>חדרים</Label><Input type="number" value={saleInput.rooms || ""} onChange={e => updateSaleInput("rooms", e.target.value ? Number(e.target.value) : "")} placeholder="4" /></div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">הגדרות שליפה - שכירות</h3>
            <div><Label>Actor ID</Label><Input value={val("apify_actor_rent_id")} onChange={e => setF(p => ({ ...p, apify_actor_rent_id: e.target.value }))} placeholder="username/actor-name" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>קוד עיר</Label><Input value={rentInput.city || ""} onChange={e => updateRentInput("city", e.target.value)} placeholder="לדוגמה: 1200" /></div>
              <div><Label>חדרים</Label><Input type="number" value={rentInput.rooms || ""} onChange={e => updateRentInput("rooms", e.target.value ? Number(e.target.value) : "")} placeholder="4" /></div>
            </div>
            <p className="text-xs text-muted-foreground">סוג עסקה (dealType) מוגדר אוטומטית כ-&quot;rent&quot;</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
