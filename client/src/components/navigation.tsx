import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/lib/auth-context"
import {
  FileText,
  GitBranch,
  Layers,
  Brain,
  Globe,
  BookOpen,
  Settings,
  Shield,
  Cpu,
  Home,
  Lock,
  LogOut,
} from "lucide-react"

const navGroups = [
  {
    label: "Workflow",
    items: [
      { name: "Home", href: "/", icon: Home, public: true },
      { name: "PSUR Compilation", href: "/psur", icon: FileText, public: false },
      { name: "Decision Tracing", href: "/lineage", icon: GitBranch, public: false },
    ],
  },
  {
    label: "Configuration",
    items: [
      { name: "Templates", href: "/templates", icon: Layers, public: false },
      { name: "Agent Config", href: "/prompts", icon: Brain, public: false },
      { name: "Regulatory", href: "/regulatory", icon: Globe, public: true },
    ],
  },
  {
    label: "System",
    items: [
      { name: "User Guide", href: "/guide", icon: BookOpen, public: true },
      { name: "Settings", href: "/settings", icon: Settings, public: false },
    ],
  },
]

export function Navigation() {
  const [location] = useLocation()
  const { isAuthenticated, user, logout, openAuthModal } = useAuth()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-6 max-w-[1800px] mx-auto">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg neo-gradient shadow-md group-hover:shadow-lg transition-all">
              <Cpu className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold tracking-tight text-foreground leading-tight">
                Smarticus
              </span>
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider leading-none">
                Regulatory Draft Engine
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Groups */}
        <nav className="hidden lg:flex items-center gap-1 bg-secondary/50 rounded-lg px-1.5 py-1 border border-border/50">
          {navGroups.map((group, groupIndex) => (
            <div key={group.label} className="flex items-center">
              {groupIndex > 0 && (
                <div className="w-px h-6 bg-border/50 mx-1.5" />
              )}
              <div className="flex items-center gap-0.5">
                {group.items.map((item) => {
                  const isActive = location === item.href
                  const isLocked = !item.public && !isAuthenticated
                  
                  if (isLocked) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 rounded-md text-xs font-medium text-muted-foreground/50 cursor-not-allowed"
                            onClick={() => openAuthModal()}
                          >
                            <item.icon className="h-3.5 w-3.5" />
                            {item.name}
                            <Lock className="h-3 w-3 ml-0.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">Sign in to access</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 gap-1.5 rounded-md text-xs font-medium transition-all",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        <item.icon className={cn("h-3.5 w-3.5", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                        {item.name}
                      </Button>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* MDR Compliant Status */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10 border border-success/20 cursor-help transition-colors hover:bg-success/15">
                <Shield className="w-3.5 h-3.5 text-success" />
                <span className="text-[10px] font-semibold text-success tracking-wide uppercase">MDR Compliant</span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">MDCG 2022-21 Annex I Structure Active</p>
            </TooltipContent>
          </Tooltip>

          {/* Auth Button */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{user?.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={logout}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-md"
              onClick={() => openAuthModal()}
            >
              Sign In
            </Button>
          )}

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
