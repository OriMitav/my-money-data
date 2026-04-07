import { Card, CardContent } from "@/components/ui/card";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">לוח בקרה</h1>
        <p className="text-muted-foreground">סקירה כללית של תזרים המזומנים והחסכונות</p>
      </div>
      <Card>
        <CardContent className="p-12 text-center">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg mb-1">בקרוב</h3>
          <p className="text-muted-foreground text-sm">גרפים ואנליטיקות יהיו זמינים כאן</p>
        </CardContent>
      </Card>
    </div>
  );
}