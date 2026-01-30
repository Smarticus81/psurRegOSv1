import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Demo from "@/pages/demo";
import PsurWizard from "@/pages/psur-wizard";
import Admin from "@/pages/admin";
import Instructions from "@/pages/instructions";
import GrkbView from "@/pages/grkb-view";
import GrkbMapping from "@/pages/grkb-mapping";
import SystemInstructions from "@/pages/system-instructions";
import ContentTraces from "@/pages/content-traces";
import TemplatePipeline from "@/pages/template-pipeline";
import DeviceDossiers from "@/pages/device-dossiers";
import { Navigation } from "@/components/navigation";

function Router() {
  return (
    <div className="h-full">
      <Switch>
        {/* Landing Page */}
        <Route path="/" component={Home} />
        
        {/* Interactive Demo */}
        <Route path="/demo" component={Demo} />

        {/* WORKFLOW */}
        <Route path="/psur" component={PsurWizard} />
        <Route path="/lineage" component={ContentTraces} />

        {/* CONFIGURATION */}
        <Route path="/templates" component={TemplatePipeline} />
        <Route path="/prompts" component={SystemInstructions} />
        <Route path="/regulatory" component={GrkbView} />
        <Route path="/dossiers" component={DeviceDossiers} />

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
      <ThemeProvider defaultTheme="dark" storageKey="regulatoryos-theme">
        <AuthProvider>
          <TooltipProvider>
            <div className="relative min-h-screen flex flex-col selection:bg-primary/20 selection:text-primary bg-background overflow-hidden">
              <Navigation />
              <main className="flex-1 w-full overflow-hidden animate-slide-up">
                <Router />
              </main>
              <Toaster />
            </div>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
