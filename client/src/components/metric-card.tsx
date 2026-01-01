import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
    label?: string;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  icon,
  className 
}: MetricCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight">{value}</span>
              {subtitle && (
                <span className="text-sm text-muted-foreground">{subtitle}</span>
              )}
            </div>
            {trend && (
              <div className="flex items-center gap-1.5">
                {trend.direction === "up" && (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                )}
                {trend.direction === "down" && (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                {trend.direction === "neutral" && (
                  <Minus className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={cn(
                  "text-sm font-medium",
                  trend.direction === "up" && "text-emerald-600 dark:text-emerald-400",
                  trend.direction === "down" && "text-red-600 dark:text-red-400",
                  trend.direction === "neutral" && "text-muted-foreground"
                )}>
                  {trend.value}
                </span>
                {trend.label && (
                  <span className="text-sm text-muted-foreground">{trend.label}</span>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
