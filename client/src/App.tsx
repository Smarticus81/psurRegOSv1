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
import GrkbMapping from "@/pages/grkb-mapping";
import SystemInstructions from "@/pages/system-instructions";
import ContentTraces from "@/pages/content-traces";
import TemplatePipeline from "@/pages/template-pipeline";
import { FileText, Settings, BookOpen, Globe, Brain, ShieldCheck, GitBranch, Layers, Cpu } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function Navigation() {
  const [location] = useLocation();

  // PSUR Expert-Facing Navigation - Organized by Workflow
  const navGroups = [
    {
      label: "Workflow",
      items: [
        { href: "/psur", icon: FileText, label: "Report Generation" },
        { href: "/lineage", icon: GitBranch, label: "Evidence Lineage" },
      ]
    },
    {
      label: "Configuration",
      items: [
        { href: "/templates", icon: Layers, label: "Templates" },
        { href: "/prompts", icon: Brain, label: "Agent Config" },
        { href: "/regulatory", icon: Globe, label: "Regulatory" },
      ]
    },
    {
      label: "System",
      items: [
        { href: "/guide", icon: BookOpen, label: "User Guide" },
        { href: "/settings", icon: Settings, label: "Settings" },
      ]
    }
  ];

  // Flatten for rendering
  const navItems = navGroups.flatMap(g => g.items);

  return (
    <nav className="sticky top-0 w-full z-50 bg-slate-900 border-b border-slate-700/50 shadow-lg shrink-0">
      <div className="max-w-[1800px] mx-auto h-14 px-6 flex items-center justify-between gap-6">

        {/* Brand - PSUR Expert Facing */}
        <Link href="/psur">
          <div className="flex items-center gap-3 group cursor-pointer shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md group-hover:from-blue-500 group-hover:to-blue-600 transition-all">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-lg tracking-tight text-white leading-tight">
                PSUR DraftEngine
              </span>
              <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider leading-none">
                EU MDR Compliant
              </span>
            </div>
          </div>
        </Link>

        {/* Desktop Nav - Grouped by Function */}
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg px-1.5 py-1 border border-slate-700/50">
            {navGroups.map((group, groupIndex) => (
              <div key={group.label} className="flex items-center">
                {groupIndex > 0 && (
                  <div className="w-px h-6 bg-slate-700/50 mx-1.5" />
                )}
                {group.items.map((item) => {
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <button
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap",
                          isActive
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                        )}
                      >
                        <item.icon className={cn("w-3.5 h-3.5", isActive ? "text-white" : "text-slate-400")} />
                        <span>{item.label}</span>
                      </button>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right Actions - Compliance Status */}
        <div className="flex items-center gap-3 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 cursor-help transition-colors hover:bg-emerald-500/15">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-500 tracking-wide uppercase">MDR Compliant</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs bg-slate-900 text-white border-slate-700">
              <p className="text-xs">MDCG 2022-21 Annex I Structure Active</p>
            </TooltipContent>
          </Tooltip>
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
        {/* Default redirect to Report Generation */}
        <Route path="/">
          {() => {
            window.location.href = "/psur";
            return null;
          }}
        </Route>

        {/* WORKFLOW */}
        <Route path="/psur" component={PsurWizard} />
        <Route path="/lineage" component={ContentTraces} />

        {/* CONFIGURATION */}
        <Route path="/templates" component={TemplatePipeline} />
        <Route path="/prompts" component={SystemInstructions} />
        <Route path="/regulatory" component={GrkbView} />

        {/* SYSTEM */}
        <Route path="/guide" component={Instructions} />
        <Route path="/settings" component={Admin} />

        {/* Legacy routes - redirect to new paths */}
        <Route path="/content-traces">
          {() => { window.location.href = "/lineage"; return null; }}
        </Route>
        <Route path="/pipeline">
          {() => { window.location.href = "/templates"; return null; }}
        </Route>
        <Route path="/system-instructions">
          {() => { window.location.href = "/prompts"; return null; }}
        </Route>
        <Route path="/grkb">
          {() => { window.location.href = "/regulatory"; return null; }}
        </Route>
        <Route path="/grkb-mapping">
          {() => { window.location.href = "/regulatory"; return null; }}
        </Route>
        <Route path="/admin">
          {() => { window.location.href = "/settings"; return null; }}
        </Route>
        <Route path="/instructions">
          {() => { window.location.href = "/guide"; return null; }}
        </Route>
        <Route path="/template-management">
          {() => { window.location.href = "/templates"; return null; }}
        </Route>

        {/* 404 */}
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
