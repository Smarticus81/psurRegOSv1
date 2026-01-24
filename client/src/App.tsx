import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import NotFound from "@/pages/not-found";
import PsurWizard from "@/pages/psur-wizard";
import Admin from "@/pages/admin";
import Instructions from "@/pages/instructions";
import GrkbView from "@/pages/grkb-view";
import AgentSystem from "@/pages/agent-system";
import SystemInstructions from "@/pages/system-instructions";
import ContentTraces from "@/pages/content-traces";
import { LayoutDashboard, Settings, Info, Globe, Cpu, Brain, ShieldCheck, BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { href: "/psur", icon: LayoutDashboard, label: "Wizard" },
    { href: "/content-traces", icon: BarChart3, label: "Content" },
    { href: "/system-instructions", icon: Brain, label: "Prompts" },
    { href: "/grkb", icon: Globe, label: "GRKB" },
    { href: "/instructions", icon: Info, label: "Docs" },
    { href: "/admin", icon: Settings, label: "Admin" },
  ];

  return (
    <nav className="sticky top-0 w-full z-50 bg-[#0B1221] border-b border-white/5 shadow-md shrink-0">
      <div className="max-w-[1800px] mx-auto h-16 px-6 flex items-center justify-between gap-8">

        {/* Brand */}
        <Link href="/psur">
          <div className="flex items-center gap-3 group cursor-pointer shrink-0">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/50 group-hover:bg-blue-500 transition-colors">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl tracking-tight text-white leading-tight">
                DraftEngine
              </span>
              <span className="text-[10px] font-medium text-blue-200 uppercase tracking-widest leading-none">
                Enterprise
              </span>
            </div>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex flex-1 items-center justify-center max-w-5xl">
          <div className="flex items-center justify-between w-full bg-white/5 rounded-full px-2 py-1 border border-white/5">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 font-medium text-sm whitespace-nowrap",
                      isActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-blue-100/70 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className={cn("w-4 h-4", isActive ? "text-white" : "text-blue-300/70")} />
                    <span>{item.label}</span>
                  </button>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden xl:flex items-center space-x-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 cursor-help transition-colors hover:bg-emerald-500/20">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-[11px] font-bold text-emerald-500 tracking-wide uppercase">Guard: Active</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs bg-[#0B1221] text-white border-white/10">
                <p className="text-xs">Regulatory Guardrails Online</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <div className="h-full">
      <Switch>
        <Route path="/">
          {() => {
            window.location.href = "/psur";
            return null;
          }}
        </Route>
        <Route path="/psur" component={PsurWizard} />
        <Route path="/content-traces" component={ContentTraces} />
        <Route path="/grkb" component={GrkbView} />
        <Route path="/agent-system" component={AgentSystem} />
        <Route path="/system-instructions" component={SystemInstructions} />
        <Route path="/admin" component={Admin} />
        <Route path="/instructions" component={Instructions} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="regulatoryos-theme">
        <TooltipProvider>
          <div className="relative min-h-screen flex flex-col selection:bg-primary/20 selection:text-primary bg-background overflow-hidden">
            <Navigation />
            <main className="flex-1 w-full overflow-hidden animate-slide-up">
              <Router />
            </main>
            <Toaster />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
