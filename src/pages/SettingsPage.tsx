import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EntitiesPage from "@/pages/EntitiesPage";

interface PensionSettings {
  id?: string;
  default_employer: string;
  default_fund_name: string;
  deposit_fee_pct: number;
  accumulation_fee_pct: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: pensionSettings } = useQuery({
    queryKey: ["pension_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pension_settings").select("*").maybeSingle();
      if (error) throw error;
      return data as PensionSettings | null;
    },
  });

  const [psForm, setPsForm] = useState<PensionSettings | null>(null);

  const currentPs = psForm || pensionSettings || {
    default_employer: "", default_fund_name: "", deposit_fee_pct: 0, accumulation_fee_pct: 0,
  };

  const savePensionSettings = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id,
        default_employer: currentPs.default_employer,
        default_fund_name: currentPs.default_fund_name,
        deposit_fee_pct: currentPs.deposit_fee_pct,
        accumulation_fee_pct: currentPs.accumulation_fee_pct,
      };
      if (pensionSettings?.id) {
        const { error } = await supabase.from("pension_settings").update(payload).eq("id", pensionSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pension_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pension_settings"] });
      setPsForm(null);
      toast.success("הגדרות פנסיה נשמרו");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePs = (field: keyof PensionSettings, value: string | number) => {
    setPsForm({ ...currentPs, [field]: value });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
        <p className="text-muted-foreground">ניהול הגדרות המערכת</p>
      </div>

      <Tabs defaultValue="entities" dir="rtl">
        <TabsList>
          <TabsTrigger value="entities">ישויות פיננסיות</TabsTrigger>
          <TabsTrigger value="pension">ברירות מחדל פנסיה</TabsTrigger>
        </TabsList>

        <TabsContent value="entities">
          <EntitiesPage />
        </TabsContent>

        <TabsContent value="pension" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">ברירות מחדל לפנסיה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שם מעסיק ברירת מחדל</Label>
                  <Input
                    value={currentPs.default_employer}
                    onChange={(e) => updatePs("default_employer", e.target.value)}
                    placeholder="לדוגמה: חברת XYZ"
                  />
                </div>
                <div className="space-y-2">
                  <Label>שם קרן פנסיה ברירת מחדל</Label>
                  <Input
                    value={currentPs.default_fund_name}
                    onChange={(e) => updatePs("default_fund_name", e.target.value)}
                    placeholder="לדוגמה: מגדל מקפת"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>דמי ניהול מהפקדה (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={currentPs.deposit_fee_pct}
                    onChange={(e) => updatePs("deposit_fee_pct", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>דמי ניהול מצבירה (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={currentPs.accumulation_fee_pct}
                    onChange={(e) => updatePs("accumulation_fee_pct", Number(e.target.value))}
                  />
                </div>
              </div>
              <Button onClick={() => savePensionSettings.mutate()} disabled={savePensionSettings.isPending}>
                שמור הגדרות
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
