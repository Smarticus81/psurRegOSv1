import { useLocation, Link } from "wouter";
import {
  Cpu,
  Settings,
  Activity,
  Box,
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

const pmsNavItems = [
  {
    title: "Device Portfolio",
    url: "/",
    icon: Box,
    step: 1,
  },
  {
    title: "Evidence",
    url: "/evidence",
    icon: Database,
    step: 2,
  },
  {
    title: "PSUR Workflow",
    url: "/psur",
    icon: FileText,
    step: 3,
  },
  {
    title: "Agent Studio",
    url: "/agents",
    icon: Cpu,
  },
];

const systemNavItems = [
  {
    title: "Settings",
    url: "/settings",
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
            <span className="text-[10px] text-muted-foreground/70">PMS Compliance</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>PSUR Workflow</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pmsNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      {item.step && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                          {item.step}
                        </span>
                      )}
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
