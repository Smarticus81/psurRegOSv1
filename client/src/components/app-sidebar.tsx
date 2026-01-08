import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Building2,
  Cpu,
  FileText,
  Database,
  BookOpen,
  Settings,
  Activity,
  HelpCircle,
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
import { Badge } from "@/components/ui/badge";

const mainNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Company Profile",
    url: "/companies",
    icon: Building2,
  },
  {
    title: "Agent Orchestration",
    url: "/agents",
    icon: Cpu,
    badge: "Live",
  },
  {
    title: "Documents",
    url: "/documents",
    icon: FileText,
  },
];

const dataNavItems = [
  {
    title: "Data Layer",
    url: "/data",
    icon: Database,
  },
  {
    title: "Knowledge Base",
    url: "/grkb",
    icon: BookOpen,
  },
];

const helpNavItems = [
  {
    title: "PMS Instructions",
    url: "/instructions",
    icon: HelpCircle,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-5 border-b border-sidebar-border/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
            <Activity className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-sm tracking-tight">RegulatoryOS</span>
            <span className="text-[11px] text-muted-foreground/70">Agent Framework</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Intelligence</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dataNavItems.map((item) => (
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
          <SidebarGroupLabel>Help</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {helpNavItems.map((item) => (
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
      <SidebarFooter className="p-5 border-t border-sidebar-border/50">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <Settings className="h-3 w-3" />
          <span>v0.1.0</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
