import { Card, CardContent } from "@/components/ui/card";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your cash flow and savings</p>
      </div>
      <Card>
        <CardContent className="p-12 text-center">
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg mb-1">Coming Soon</h3>
          <p className="text-muted-foreground text-sm">Charts and analytics will be available here</p>
        </CardContent>
      </Card>
    </div>
  );
}
