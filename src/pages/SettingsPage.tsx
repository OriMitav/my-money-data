import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EntitiesPage from "@/pages/EntitiesPage";
import CategoriesPage from "@/pages/CategoriesPage";
import GeoJsonSettings from "@/components/GeoJsonSettings";

export default function SettingsPage() {
  const [tab, setTab] = useState("entities");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
        <p className="text-muted-foreground">ניהול הגדרות המערכת</p>
      </div>
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList>
          <TabsTrigger value="entities">ישויות פיננסיות</TabsTrigger>
          <TabsTrigger value="categories">קטגוריות הוצאות והכנסות</TabsTrigger>
          <TabsTrigger value="geojson">מפת שכונות</TabsTrigger>
        </TabsList>
        <TabsContent value="entities" className="mt-4">
          <EntitiesPage />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <CategoriesPage />
        </TabsContent>
        <TabsContent value="geojson" className="mt-4">
          <GeoJsonSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
