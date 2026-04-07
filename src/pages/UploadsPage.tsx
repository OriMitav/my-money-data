import { Card, CardContent } from "@/components/ui/card";
import { Upload } from "lucide-react";

export default function UploadsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">העלאות</h1>
        <p className="text-muted-foreground">העלה קבצי CSV/XLSX לייבוא תנועות</p>
      </div>
      <Card>
        <CardContent className="p-12 text-center">
          <Upload className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg mb-1">בקרוב</h3>
          <p className="text-muted-foreground text-sm">העלאת קבצים וייבוא תנועות יהיו זמינים כאן</p>
        </CardContent>
      </Card>
    </div>
  );
}