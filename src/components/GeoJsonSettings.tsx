import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, CheckCircle, FileJson } from "lucide-react";
import { toast } from "sonner";

export default function GeoJsonSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ featureCount: number; neighborhoods: string[] } | null>(null);
  const [pendingGeoJson, setPendingGeoJson] = useState<any>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["geojson-layer", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("geojson_layers" as any)
        .select("*")
        .eq("name", "default")
        .maybeSingle();
      return data as any;
    },
    enabled: !!user,
  });

  const upsertMutation = useMutation({
    mutationFn: async (geojson: any) => {
      if (existing) {
        const { error } = await supabase
          .from("geojson_layers" as any)
          .update({ geojson, updated_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("geojson_layers" as any)
          .insert({ user_id: user!.id, name: "default", geojson } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["geojson-layer"] });
      setPendingGeoJson(null);
      setPreview(null);
      toast.success("GeoJSON עודכן בהצלחה");
    },
    onError: (e: any) => toast.error("שגיאה בשמירה: " + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existing) return;
      const { error } = await supabase
        .from("geojson_layers" as any)
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["geojson-layer"] });
      toast.success("GeoJSON נמחק, המערכת תשתמש בברירת המחדל");
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
          toast.error("הקובץ אינו GeoJSON תקין (חסר FeatureCollection)");
          return;
        }
        const neighborhoods = [...new Set(
          json.features.map((f: any) => f.properties?.neighborhood || f.properties?.name || "ללא שם")
        )] as string[];
        setPreview({ featureCount: json.features.length, neighborhoods });
        setPendingGeoJson(json);
      } catch {
        toast.error("שגיאה בקריאת הקובץ – ודא שזהו JSON תקין");
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const existingNeighborhoods = existing?.geojson?.features
    ? [...new Set(existing.geojson.features.map((f: any) => f.properties?.neighborhood || f.properties?.name))] as string[]
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            קובץ GeoJSON לשכונות במפה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {existing && existingNeighborhoods && (
            <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle className="h-4 w-4 text-green-600" />
                GeoJSON מותאם אישית טעון ({existingNeighborhoods.length} שכונות)
              </div>
              <div className="flex flex-wrap gap-1">
                {existingNeighborhoods.map((n) => (
                  <span key={n} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{n}</span>
                ))}
              </div>
              <div className="pt-1">
                <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  <Trash2 className="h-3.5 w-3.5 ml-1" />
                  מחק וחזור לברירת מחדל
                </Button>
              </div>
            </div>
          )}

          {!existing && !isLoading && (
            <p className="text-sm text-muted-foreground">
              לא הועלה GeoJSON מותאם אישית. המערכת משתמשת בקובץ ברירת המחדל.
            </p>
          )}

          <div className="space-y-2">
            <Label>העלאת קובץ GeoJSON חדש</Label>
            <Input ref={fileRef} type="file" accept=".geojson,.json" onChange={handleFile} />
          </div>

          {preview && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">{preview.featureCount} אובייקטים, {preview.neighborhoods.length} שכונות:</p>
              <div className="flex flex-wrap gap-1">
                {preview.neighborhoods.map((n) => (
                  <span key={n} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{n}</span>
                ))}
              </div>
              <Button onClick={() => upsertMutation.mutate(pendingGeoJson)} disabled={upsertMutation.isPending}>
                <Upload className="h-4 w-4 ml-1" />
                {upsertMutation.isPending ? "שומר..." : "שמור GeoJSON"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
