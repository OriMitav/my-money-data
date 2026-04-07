import EntitiesPage from "@/pages/EntitiesPage";

export default function SettingsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
        <p className="text-muted-foreground">ניהול הגדרות המערכת</p>
      </div>
      <EntitiesPage />
    </div>
  );
}
