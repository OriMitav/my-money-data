import { Upload, ArrowLeftRight, LayoutDashboard, LogOut, Settings, Receipt, PiggyBank, CreditCard, Building2, Home } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "לוח בקרה", url: "/dashboard", icon: LayoutDashboard },
  { title: "תנועות", url: "/transactions", icon: ArrowLeftRight },
  { title: "העלאת דוחות", url: "/uploads", icon: Upload },
  { title: "הכנסות ומיסוי", url: "/income-tax", icon: Receipt },
  { title: "פנסיה וחסכונות", url: "/pension", icon: PiggyBank },
  { title: "נכסים", url: "/assets", icon: Building2 },
  { title: "חובות", url: "/debts", icon: CreditCard },
  { title: "משכנתאות", url: "/mortgages", icon: Home },
  { title: "הגדרות", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && (
              <span className="text-xs font-bold uppercase tracking-wider text-sidebar-primary">תזרים מזומנים</span>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="ml-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {!collapsed && (
          <div className="px-2 pb-2">
            <p className="text-xs text-sidebar-foreground/60 truncate mb-2">{user?.email}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="ml-2 h-4 w-4" />
              התנתק
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
