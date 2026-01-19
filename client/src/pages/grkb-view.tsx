import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Globe, Shield, BookOpen, Layers, CheckCircle2, Info, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface GrkbObligation {
    id: number;
    obligationId: string;
    jurisdiction: string;
    title: string;
    text: string;
    sourceCitation: string;
    mandatory: boolean;
}

interface GrkbStats {
    totalObligations: number;
    byJurisdiction: Record<string, number>;
    byArtifact: Record<string, number>;
}

export default function GrkbView() {
    const [stats, setStats] = useState<GrkbStats | null>(null);
    const [obligations, setObligations] = useState<GrkbObligation[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeJurisdiction, setActiveJurisdiction] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const loadData = async () => {
            try {
                const [statsRes, obligationsRes] = await Promise.all([
                    fetch("/api/psur-grkb/statistics").then(r => r.json()),
                    fetch("/api/psur-grkb/obligations").then(r => r.json())
                ]);
                setStats(statsRes);
                setObligations(obligationsRes);
            } catch (error) {
                console.error("Failed to load GRKB data:", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const filteredObligations = obligations.filter(o => {
        const matchesJurisdiction = activeJurisdiction === "ALL" || o.jurisdiction === activeJurisdiction;
        const matchesSearch = o.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             o.obligationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             o.text.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesJurisdiction && matchesSearch;
    });

    return (
        <div className="h-full overflow-hidden flex flex-col space-y-6 max-w-6xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-primary font-black tracking-tighter uppercase text-xs">
                        <Globe className="w-3 h-3" />
                        Regulatory Intelligence
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter text-foreground">Global Knowledge Base</h1>
                    <p className="text-muted-foreground text-sm font-medium">Canonical repository of PSUR obligations and constraints.</p>
                </div>

                <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
                    {["ALL", "EU_MDR", "UK_MDR"].map((j) => (
                        <button
                            key={j}
                            onClick={() => setActiveJurisdiction(j)}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-xs font-black transition-all",
                                activeJurisdiction === j 
                                    ? "bg-background text-foreground shadow-sm" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {j === "ALL" ? "Global" : j.replace("_", " ")}
                        </button>
                    ))}
                </div>
            </div>

            {/* Workflow Chart - Premium Minimalist */}
            <div className="glass-card p-6 overflow-hidden">
                <div className="flex items-center gap-3 mb-8">
                    <Layers className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Qualification Engine Workflow</h3>
                </div>
                
                <div className="relative flex justify-between items-start gap-4">
                    {/* Connection Line */}
                    <div className="absolute top-10 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent z-0" />
                    
                    {[
                        { step: "01", icon: Shield, title: "Obligation Sync", desc: "Real-time synchronization with GRKB regulatory atoms." },
                        { step: "02", icon: BookOpen, title: "Template Mapping", desc: "Automated structural alignment with Annex I protocols." },
                        { step: "03", icon: CheckCircle2, title: "Context Audit", desc: "Verification of device class and jurisdiction applicability." },
                        { step: "04", icon: ArrowRight, title: "Compliance Gate", desc: "Locking the reporting scope for immutable audit trails." }
                    ].map((s, i) => (
                        <div key={i} className="relative z-10 flex flex-col items-center text-center space-y-4 w-1/4">
                            <div className="w-20 h-20 rounded-3xl bg-background border border-border/50 shadow-xl flex items-center justify-center group hover:border-primary/30 transition-all duration-500">
                                <s.icon className="w-8 h-8 text-primary/40 group-hover:text-primary transition-colors" />
                                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-[10px] font-black text-white flex items-center justify-center shadow-lg">{s.step}</div>
                            </div>
                            <div className="space-y-1 px-2">
                                <h4 className="text-xs font-black text-foreground uppercase tracking-wider">{s.title}</h4>
                                <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">{s.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stats & Search */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                        type="text" 
                        placeholder="Search obligations by ID, title, or requirement text..." 
                        className="w-full bg-background border border-border/50 rounded-2xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="glass-card flex items-center justify-center gap-4 py-2 px-4">
                    <div className="text-center">
                        <div className="text-xl font-black tracking-tighter text-primary">{filteredObligations.length}</div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Active Atoms</div>
                    </div>
                    <div className="w-px h-8 bg-border/30" />
                    <div className="text-center">
                        <div className="text-xl font-black tracking-tighter text-foreground">{stats?.totalObligations || 0}</div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Global Total</div>
                    </div>
                </div>
            </div>

            {/* Obligations List */}
            <ScrollArea className="flex-1 -mx-4 px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
                    {loading ? (
                        Array(6).fill(0).map((_, i) => (
                            <div key={i} className="h-48 rounded-2xl bg-secondary/20 animate-pulse" />
                        ))
                    ) : filteredObligations.map((o) => (
                        <div key={o.id} className="glass-card p-6 flex flex-col justify-between group hover:border-primary/20 transition-all duration-300">
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 text-[9px] font-black tracking-widest py-0">
                                                {o.jurisdiction}
                                            </Badge>
                                            <span className="text-[10px] font-black text-muted-foreground tracking-widest uppercase">{o.obligationId}</span>
                                        </div>
                                        <h4 className="text-sm font-black tracking-tight text-foreground group-hover:text-primary transition-colors">{o.title}</h4>
                                    </div>
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                        <Shield className="w-4 h-4 text-emerald-600" />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground font-medium leading-relaxed line-clamp-3 italic">"{o.text}"</p>
                            </div>
                            
                            <div className="mt-6 pt-4 border-t border-border/30 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Info className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{o.sourceCitation}</span>
                                </div>
                                {o.mandatory && (
                                    <span className="ios-pill bg-destructive text-white text-[8px] font-black border-none px-2 py-0.5">MANDATORY</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
