import { Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function MortgagesPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">משכנתאות</h1>
      <Card>
        <CardContent className="p-8 sm:p-12 text-center">
          <Home className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg mb-1">בקרוב</h3>
          <p className="text-muted-foreground text-sm">ניהול משכנתאות יהיה זמין בקרוב</p>
        </CardContent>
      </Card>
    </div>
  );
}
