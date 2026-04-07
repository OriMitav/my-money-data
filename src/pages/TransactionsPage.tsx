import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeftRight } from "lucide-react";

export default function TransactionsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">View and manage all your imported transactions</p>
      </div>
      <Card>
        <CardContent className="p-12 text-center">
          <ArrowLeftRight className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg mb-1">Coming Soon</h3>
          <p className="text-muted-foreground text-sm">Transaction management will be available here</p>
        </CardContent>
      </Card>
    </div>
  );
}
