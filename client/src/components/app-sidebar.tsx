import { useLocation, Link } from "wouter";
import {
  Settings,
  Activity,
  Database,
  FileText,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const workflowNavItems = [
  {
    title: "Evidence",
    url: "/evidence",
    icon: Database,
  },
  {
    title: "PSUR Workflow",
    url: "/psur",
    icon: FileText,
  },
];

const systemNavItems = [
  {
    title: "Admin",
    url: "/admin",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border/50">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-sm tracking-tight">RegulatoryOS</span>
            <span className="text-[10px] text-muted-foreground/70">PSUR Engine</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workflow</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workflowNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border/50">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
          <span>v0.1.0</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
