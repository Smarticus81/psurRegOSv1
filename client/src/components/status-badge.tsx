import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  CheckCircle, 
  Clock, 
  Play, 
  FileEdit, 
  Search, 
  Send, 
  Archive,
  Pause,
  AlertCircle,
  Loader2
} from "lucide-react";

type StatusType = 
  | "not_started" 
  | "assigned" 
  | "in_progress" 
  | "draft" 
  | "in_review" 
  | "submitted" 
  | "closed" 
  | "on_hold"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
  showIcon?: boolean;
}

const statusConfig: Record<StatusType, { 
  label: string; 
  icon: typeof CheckCircle;
  className: string;
}> = {
  not_started: { 
    label: "Not Started", 
    icon: Clock,
    className: "bg-muted text-muted-foreground border-muted-border"
  },
  assigned: { 
    label: "Assigned", 
    icon: Play,
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
  },
  in_progress: { 
    label: "In Progress", 
    icon: Loader2,
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
  },
  draft: { 
    label: "Draft", 
    icon: FileEdit,
    className: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800"
  },
  in_review: { 
    label: "In Review", 
    icon: Search,
    className: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800"
  },
  submitted: { 
    label: "Submitted", 
    icon: Send,
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
  },
  closed: { 
    label: "Closed", 
    icon: Archive,
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  },
  on_hold: { 
    label: "On Hold", 
    icon: Pause,
    className: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800"
  },
  pending: { 
    label: "Pending", 
    icon: Clock,
    className: "bg-muted text-muted-foreground border-muted-border"
  },
  running: { 
    label: "Running", 
    icon: Loader2,
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
  },
  completed: { 
    label: "Completed", 
    icon: CheckCircle,
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
  },
  failed: { 
    label: "Failed", 
    icon: AlertCircle,
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
  },
  cancelled: { 
    label: "Cancelled", 
    icon: AlertCircle,
    className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  },
};

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.not_started;
  const Icon = config.icon;
  const isAnimated = status === "running" || status === "in_progress";

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-1.5 font-medium border",
        config.className,
        className
      )}
    >
      {showIcon && (
        <Icon className={cn("h-3 w-3", isAnimated && "animate-spin")} />
      )}
      {config.label}
    </Badge>
  );
}
