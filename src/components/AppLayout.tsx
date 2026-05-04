import { ReactNode, useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Upload,
  ArrowLeftRight,
  LayoutDashboard,
  Settings,
  Receipt,
  PiggyBank,
  CreditCard,
  Building2,
  Wallet,
} from "lucide-react";

const navItems = [
  { title: "לוח בקרה", url: "/dashboard", icon: LayoutDashboard },
  { title: "תזרים", url: "/cashflow", icon: Wallet },
  { title: "תנועות", url: "/transactions", icon: ArrowLeftRight },
  { title: "הכנסות ומיסוי", url: "/income-tax", icon: Receipt },
  { title: "פנסיה וחסכונות", url: "/pension", icon: PiggyBank },
  { title: "נכסים", url: "/assets", icon: Building2 },
  { title: "חובות", url: "/debts", icon: CreditCard },
  { title: "הגדרות", url: "/settings", icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full overflow-x-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Desktop header */}
          <header className="hidden md:flex h-14 items-center border-b bg-card px-2 sm:px-4">
            <SidebarTrigger />
          </header>

          {/* Mobile header */}
          <header className="md:hidden sticky top-0 z-40 h-14 flex items-center justify-between border-b bg-card px-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11"
                  aria-label="פתח תפריט"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                dir="rtl"
                className="w-[85vw] max-w-xs p-0 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col"
              >
                <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
                <div className="px-4 py-4 border-b border-sidebar-border">
                  <span className="text-xs font-bold uppercase tracking-wider text-sidebar-primary">
                    תזרים מזומנים
                  </span>
                </div>
                <nav className="flex-1 overflow-y-auto py-2">
                  {navItems.map((item) => {
                    const active = location.pathname === item.url;
                    return (
                      <NavLink
                        key={item.url}
                        to={item.url}
                        end
                        className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                        onClick={() => setMobileOpen(false)}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.title}</span>
                      </NavLink>
                    );
                  })}
                </nav>
                <div className="border-t border-sidebar-border p-3">
                  {user?.email && (
                    <p className="text-xs text-sidebar-foreground/60 truncate mb-2 px-1">
                      {user.email}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMobileOpen(false);
                      signOut();
                    }}
                    className="w-full justify-start min-h-[44px] text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    <LogOut className="ml-2 h-4 w-4" />
                    התנתק
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-bold text-sidebar-primary">תזרים מזומנים</span>
            <div className="w-11" />
          </header>

          <main className="flex-1 p-3 sm:p-6 overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
