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
import DecisionTraces from "@/pages/decision-traces";
import { LayoutDashboard, Settings, Info, Globe, Cpu, ClipboardList } from "lucide-react";

function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { href: "/psur", icon: LayoutDashboard, label: "Wizard" },
    { href: "/traces", icon: ClipboardList, label: "Traces" },
    { href: "/grkb", icon: Globe, label: "GRKB" },
    { href: "/agent-system", icon: Cpu, label: "Intelligence" },
    { href: "/instructions", icon: Info, label: "Docs" },
    { href: "/admin", icon: Settings, label: "Admin" },
  ];

  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
      <div className="glass-card px-2 py-2 flex items-center gap-1 rounded-full shadow-2xl">
        <Link href="/psur">
          <span className="px-4 py-2 font-semibold text-foreground tracking-tight">DraftEngine</span>
        </Link>
        <div className="w-px h-6 bg-border/30 mx-1" />
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-full transition-all duration-300 font-medium text-sm",
                  isActive 
                    ? "bg-foreground/5 text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            </Link>
          );
        })}
        <div className="w-px h-6 bg-border/30 mx-1" />
        <ThemeToggle />
      </div>
    </nav>
  );
}

function Router() {
  return (
    <div className="pt-24 min-h-screen">
      <Switch>
        <Route path="/">
          {() => {
            window.location.href = "/psur";
            return null;
          }}
        </Route>
        <Route path="/psur" component={PsurWizard} />
        <Route path="/traces" component={DecisionTraces} />
        <Route path="/grkb" component={GrkbView} />
        <Route path="/agent-system" component={AgentSystem} />
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
          <div className="relative min-h-screen selection:bg-primary/20 selection:text-primary">
            <Navigation />
            <main className="pragnanz-container animate-slide-up">
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
