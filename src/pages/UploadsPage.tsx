import { Card, CardContent } from "@/components/ui/card";
import { Upload } from "lucide-react";

export default function UploadsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Uploads</h1>
        <p className="text-muted-foreground">Upload CSV/XLSX files to import transactions</p>
      </div>
      <Card>
        <CardContent className="p-12 text-center">
          <Upload className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg mb-1">Coming Soon</h3>
          <p className="text-muted-foreground text-sm">File upload and transaction import will be available here</p>
        </CardContent>
      </Card>
    </div>
  );
}
