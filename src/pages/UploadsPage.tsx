import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Trash2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { UploadReportDialog } from "@/components/UploadReportDialog";

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export default function UploadsPage() {
  const queryClient = useQueryClient();

  const { data: uploads = [], isLoading } = useQuery({
    queryKey: ["uploads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploads")
        .select("*, financial_entities(name, type)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (upload: { id: string; storage_path: string }) => {
      await supabase.storage.from("reports").remove([upload.storage_path]);
      const { error } = await supabase.from("uploads").delete().eq("id", upload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("הדוח נמחק בהצלחה");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDownload = async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("reports").download(storagePath);
    if (error) {
      toast.error("שגיאה בהורדת הקובץ");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">העלאת דוחות</h1>
          <p className="text-muted-foreground">העלה קבצי CSV/XLSX לייבוא תנועות</p>
        </div>
        <UploadReportDialog />
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">טוען...</CardContent></Card>
      ) : uploads.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-1">אין דוחות עדיין</h3>
            <p className="text-muted-foreground text-sm">העלה את הדוח הראשון שלך כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">הדוחות שלך</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם קובץ</TableHead>
                  <TableHead>ישות</TableHead>
                  <TableHead>תקופה</TableHead>
                  <TableHead>תנועות</TableHead>
                  <TableHead className="w-28">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((upload) => {
                  const entity = upload.financial_entities as unknown as { name: string; type: string } | null;
                  return (
                    <TableRow key={upload.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          {upload.file_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{entity?.name ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>{MONTHS[upload.month - 1]} {upload.year}</TableCell>
                      <TableCell>{upload.transaction_count}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleDownload(upload.storage_path, upload.file_name)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: upload.id, storage_path: upload.storage_path })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
