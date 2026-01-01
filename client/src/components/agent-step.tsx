import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";

type StepStatus = "pending" | "running" | "completed" | "failed";

interface AgentStep {
  id: string;
  title: string;
  description?: string;
  status: StepStatus;
  duration?: string;
  output?: string;
}

interface AgentStepsProps {
  steps: AgentStep[];
  className?: string;
}

export function AgentSteps({ steps, className }: AgentStepsProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {steps.map((step, index) => (
        <AgentStepItem 
          key={step.id} 
          step={step} 
          isLast={index === steps.length - 1} 
        />
      ))}
    </div>
  );
}

interface AgentStepItemProps {
  step: AgentStep;
  isLast: boolean;
}

function AgentStepItem({ step, isLast }: AgentStepItemProps) {
  const StatusIcon = {
    pending: Circle,
    running: Loader2,
    completed: CheckCircle2,
    failed: AlertCircle,
  }[step.status];

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          step.status === "pending" && "border-muted-foreground/30 bg-background",
          step.status === "running" && "border-blue-500 bg-blue-50 dark:bg-blue-950",
          step.status === "completed" && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
          step.status === "failed" && "border-red-500 bg-red-50 dark:bg-red-950"
        )}>
          <StatusIcon className={cn(
            "h-4 w-4",
            step.status === "pending" && "text-muted-foreground/50",
            step.status === "running" && "text-blue-600 dark:text-blue-400 animate-spin",
            step.status === "completed" && "text-emerald-600 dark:text-emerald-400",
            step.status === "failed" && "text-red-600 dark:text-red-400"
          )} />
        </div>
        {!isLast && (
          <div className={cn(
            "w-0.5 flex-1 min-h-6",
            step.status === "completed" ? "bg-emerald-300 dark:bg-emerald-700" : "bg-muted"
          )} />
        )}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            "text-sm font-medium",
            step.status === "pending" && "text-muted-foreground",
            step.status === "running" && "text-foreground",
            step.status === "completed" && "text-foreground",
            step.status === "failed" && "text-red-600 dark:text-red-400"
          )}>
            {step.title}
          </p>
          {step.duration && (
            <span className="text-xs font-mono text-muted-foreground">
              {step.duration}
            </span>
          )}
        </div>
        {step.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {step.description}
          </p>
        )}
        {step.output && step.status === "completed" && (
          <div className="mt-2 rounded-md bg-muted/50 p-2">
            <p className="text-xs font-mono text-muted-foreground">
              {step.output}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export type { AgentStep, StepStatus };
