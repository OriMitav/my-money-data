import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FolderOpen, Tag, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  user_id: string;
}

export default function CategoriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("expense");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [parentId, setParentId] = useState<string>("none");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ name, type, parent_id }: { name: string; type: string; parent_id: string | null }) => {
      const { error } = await supabase.from("categories").insert({
        user_id: user!.id,
        name,
        type,
        parent_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setDialogOpen(false);
      setNewName("");
      setParentId("none");
      toast.success("הקטגוריה נוספה");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("הקטגוריה נמחקה");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filteredCategories = categories.filter((c) => c.type === tab);
  const parentCategories = filteredCategories.filter((c) => !c.parent_id);
  const getChildren = (parentId: string) => filteredCategories.filter((c) => c.parent_id === parentId);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addMutation.mutate({
      name: newName.trim(),
      type: tab,
      parent_id: parentId === "none" ? null : parentId,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">קטגוריות</h1>
          <p className="text-muted-foreground">נהל קטגוריות ותתי-קטגוריות להכנסות והוצאות</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          הוסף קטגוריה
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="expense">הוצאות</TabsTrigger>
          <TabsTrigger value="income">הכנסות</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">טוען...</CardContent></Card>
          ) : parentCategories.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="font-semibold text-lg mb-1">אין קטגוריות עדיין</h3>
                <p className="text-muted-foreground text-sm">הוסף קטגוריה ראשונה כדי להתחיל</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {parentCategories.map((cat) => {
                const children = getChildren(cat.id);
                return (
                  <Card key={cat.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-5 w-5 text-primary" />
                          <span className="font-medium text-base">{cat.name}</span>
                          {children.length > 0 && (
                            <Badge variant="secondary" className="text-xs">{children.length} תתי-קטגוריות</Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(cat.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {children.length > 0 && (
                        <div className="mt-3 mr-7 space-y-2">
                          {children.map((child) => (
                            <div key={child.id} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/50">
                              <div className="flex items-center gap-2">
                                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{child.name}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => deleteMutation.mutate(child.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Category Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>הוסף קטגוריה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>שם הקטגוריה</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="לדוגמה: מזון, תחבורה..."
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="space-y-2">
              <Label>קטגוריית אב (אופציונלי)</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="ללא - קטגוריה ראשית" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ללא - קטגוריה ראשית</SelectItem>
                  {parentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleAdd} disabled={!newName.trim() || addMutation.isPending}>
              {addMutation.isPending ? "מוסיף..." : "הוסף"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
