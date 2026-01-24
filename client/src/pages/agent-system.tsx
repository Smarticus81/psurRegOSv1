/**
 * Report Generation System Page
 * 
 * User-friendly overview of how the PSUR generation works.
 * Explains the process in terms PMS professionals understand.
 */

import { useState, useEffect } from "react";
import {
    FileText,
    Upload,
    ClipboardCheck,
    FileOutput,
    CheckCircle2,
    ArrowRight,
    Shield,
    Activity,
    Clock,
    ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface SystemStatus {
    initialized: boolean;
    euObligations: number;
    ukObligations: number;
    constraints: number;
}

interface RecentActivity {
    type: string;
    description: string;
    timestamp: string;
    status: "success" | "pending" | "error";
}

export default function ReportGenerationSystem() {
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

    useEffect(() => {
        async function fetchStatus() {
            try {
                const res = await fetch("/api/orchestrator/status");
                if (res.ok) {
                    const data = await res.json();
                    setSystemStatus(data);
                }
            } catch (e) {
                console.error("Failed to fetch system status:", e);
            } finally {
                setLoading(false);
            }
        }
        fetchStatus();

        // Fetch recent activity from PSUR cases
        async function fetchActivity() {
            try {
                const casesRes = await fetch("/api/psur-cases");
                if (casesRes.ok) {
                    const cases = await casesRes.json();
                    const activities: RecentActivity[] = cases.slice(0, 5).map((c: any) => ({
                        type: "Report",
                        description: `${c.psurReference || "PSUR"} - ${c.status}`,
                        timestamp: c.updatedAt || c.createdAt,
                        status: c.status === "exported" || c.status === "compiled" ? "success" :
                            c.status === "failed" ? "error" : "pending"
                    }));
                    setRecentActivity(activities);
                }
            } catch (e) {
                console.error("Failed to fetch activity:", e);
            }
        }
        fetchActivity();
    }, []);

    const processSteps = [
        {
            step: 1,
            title: "Setup Report",
            description: "Configure device, reporting period, and select jurisdictions",
            icon: FileText,
            color: "bg-blue-500"
        },
        {
            step: 2,
            title: "Import Data",
            description: "Upload complaints, sales, FSCA records, and other surveillance data",
            icon: Upload,
            color: "bg-emerald-500"
        },
        {
            step: 3,
            title: "Verify Completeness",
            description: "System checks all required data categories are covered",
            icon: ClipboardCheck,
            color: "bg-amber-500"
        },
        {
            step: 4,
            title: "Generate Document",
            description: "Automated narrative generation with regulatory compliance",
            icon: FileOutput,
            color: "bg-purple-500"
        }
    ];

    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            {/* Header */}
            <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur z-50">
                <div className="max-w-[1400px] mx-auto px-6 py-3">
                    <div className="flex items-center gap-4">
                        <Link href="/psur" className="text-muted-foreground hover:text-foreground transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Intelligence System</h1>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Orchestration & Rules Engine</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-6 py-8 scroll-smooth">
                <div className="max-w-[1400px] mx-auto space-y-10">
                    {/* System Status */}
                    <section className="glass-card p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">System Status</h2>
                        {loading ? (
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                Checking system...
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-xl bg-secondary/50">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            systemStatus?.initialized ? "bg-emerald-500" : "bg-amber-500"
                                        )} />
                                        <span className="text-sm text-muted-foreground">System</span>
                                    </div>
                                    <div className="font-semibold text-foreground">
                                        {systemStatus?.initialized ? "Ready" : "Initializing"}
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-secondary/50">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Shield className="w-4 h-4 text-blue-500" />
                                        <span className="text-sm text-muted-foreground">EU MDR Rules</span>
                                    </div>
                                    <div className="font-semibold text-foreground">
                                        {systemStatus?.euObligations || 0} loaded
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-secondary/50">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Shield className="w-4 h-4 text-purple-500" />
                                        <span className="text-sm text-muted-foreground">UK MDR Rules</span>
                                    </div>
                                    <div className="font-semibold text-foreground">
                                        {systemStatus?.ukObligations || 0} loaded
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-secondary/50">
                                    <div className="flex items-center gap-2 mb-1">
                                        <ClipboardCheck className="w-4 h-4 text-amber-500" />
                                        <span className="text-sm text-muted-foreground">Quality Checks</span>
                                    </div>
                                    <div className="font-semibold text-foreground">
                                        {systemStatus?.constraints || 0} active
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* How It Works */}
                    <section>
                        <h2 className="text-lg font-semibold text-foreground mb-6">How Report Generation Works</h2>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {processSteps.map((step, idx) => (
                                <div key={step.step} className="relative">
                                    <div className="glass-card p-6 h-full">
                                        <div className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4",
                                            step.color
                                        )}>
                                            <step.icon className="w-6 h-6" />
                                        </div>
                                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                                            Step {step.step}
                                        </div>
                                        <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                                        <p className="text-sm text-muted-foreground">{step.description}</p>
                                    </div>
                                    {idx < processSteps.length - 1 && (
                                        <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                                            <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Key Features */}
                    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="glass-card p-6">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 mb-4">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <h3 className="font-semibold text-foreground mb-2">Regulatory Compliant</h3>
                            <p className="text-sm text-muted-foreground">
                                Follows MDCG 2022-21 guidelines and EU MDR Article 86 requirements for PSUR content and structure.
                            </p>
                        </div>
                        <div className="glass-card p-6">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 mb-4">
                                <Activity className="w-5 h-5" />
                            </div>
                            <h3 className="font-semibold text-foreground mb-2">Full Audit Trail</h3>
                            <p className="text-sm text-muted-foreground">
                                Every decision is logged and traceable. Export complete audit documentation for regulatory submissions.
                            </p>
                        </div>
                        <div className="glass-card p-6">
                            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600 mb-4">
                                <Clock className="w-5 h-5" />
                            </div>
                            <h3 className="font-semibold text-foreground mb-2">Faster Reporting</h3>
                            <p className="text-sm text-muted-foreground">
                                Automated narrative generation reduces manual effort while maintaining quality and accuracy.
                            </p>
                        </div>
                    </section>

                    {/* Recent Activity */}
                    {recentActivity.length > 0 && (
                        <section className="glass-card p-6">
                            <h2 className="text-lg font-semibold text-foreground mb-4">Recent Reports</h2>
                            <div className="space-y-3">
                                {recentActivity.map((activity, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full",
                                                activity.status === "success" ? "bg-emerald-500" :
                                                    activity.status === "error" ? "bg-red-500" : "bg-amber-500"
                                            )} />
                                            <span className="text-foreground">{activity.description}</span>
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {new Date(activity.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Quick Actions */}
                    <section className="flex justify-center gap-4">
                        <Link href="/psur">
                            <button className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                                Start New Report
                            </button>
                        </Link>
                        <Link href="/admin">
                            <button className="px-6 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors">
                                Configure Settings
                            </button>
                        </Link>
                    </section>
                </div>
            </main>
        </div>
    );
}
