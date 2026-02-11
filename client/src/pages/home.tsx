import { Link } from "wouter";
import { 
  FileText, 
  Shield, 
  Brain, 
  Zap, 
  GitBranch, 
  Database, 
  CheckCircle2, 
  ArrowRight,
  Layers,
  Globe,
  BarChart3,
  Lock,
  Sparkles,
  Target,
  Clock,
  Users,
  Award,
  TrendingUp,
  AlertTriangle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { openAuthModal, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen overflow-auto">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 dark:from-primary/10 dark:via-transparent dark:to-primary/5" />
        
        {/* Animated grid pattern */}
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05]" style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20 mb-4">
                  <Sparkles className="w-4 h-4" />
                  Regulatory Intelligence Reimagined
                </div>
                <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground leading-tight">
                  PSUR Generation{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                    That Thinks
                  </span>
                  {" "}Like Your Best RA
                </h1>
              </div>
              
              <p className="text-xl text-muted-foreground leading-relaxed max-w-xl">
                Stop drowning in spreadsheets. Smarticus transforms weeks of manual PSUR compilation into 
                hours of intelligent, evidence-traced documentation that auditors trust.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                {isAuthenticated ? (
                  <Link href="/psur">
                    <Button size="lg" className="w-full sm:w-auto h-14 px-8 rounded-full font-semibold gap-2 text-base">
                      Go to Dashboard
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </Link>
                ) : (
                  <Button 
                    size="lg" 
                    className="w-full sm:w-auto h-14 px-8 rounded-full font-semibold gap-2 text-base"
                    onClick={() => openAuthModal()}
                  >
                    Start Free Trial
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                )}
                <Link href="/demo">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 rounded-full font-semibold gap-2 text-base">
                    <Play className="w-5 h-5" />
                    Try Interactive Demo
                  </Button>
                </Link>
              </div>

              {/* Trust Badges */}
              <div className="flex flex-wrap items-center gap-6 pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="w-5 h-5 text-primary" />
                  <span>SOC 2 Type II</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Award className="w-5 h-5 text-primary" />
                  <span>MDCG 2022-21 Compliant</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="w-5 h-5 text-primary" />
                  <span>GDPR Ready</span>
                </div>
              </div>
            </div>

            {/* Right Visual - Dashboard Preview */}
            <div className="relative hidden lg:block">
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-primary/5 rounded-3xl blur-3xl" />
              <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                {/* Mini dashboard mockup */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">CardioFlow Monitor 3000</p>
                        <p className="text-xs text-muted-foreground">PSUR Q4 2024 Draft</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">Generating</span>
                  </div>
                  
                  {/* Progress bars */}
                  <div className="space-y-3">
                    {[
                      { label: "Customer Feedback Analysis", progress: 100, status: "847 records processed" },
                      { label: "Vigilance Cross-Reference", progress: 100, status: "12 incidents mapped" },
                      { label: "Benefit-Risk Determination", progress: 78, status: "Compiling assessment" },
                    ].map((item, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium text-foreground">{item.status}</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${item.progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`} 
                            style={{ width: `${item.progress}%` }} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mini cards */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {[
                      { icon: Database, label: "Data Sources", value: "2,847" },
                      { icon: GitBranch, label: "Decision Traces", value: "12,493" },
                      { icon: Shield, label: "Compliance", value: "98.7%" },
                      { icon: Clock, label: "Time Saved", value: "127 hrs" },
                    ].map((item, i) => (
                      <div key={i} className="p-3 rounded-xl bg-secondary/50 border border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</span>
                        </div>
                        <p className="text-lg font-bold text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Point Section */}
      <section className="py-20 bg-destructive/5 border-y border-destructive/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <div className="inline-flex items-center gap-2 text-destructive text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              The Problem
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground max-w-3xl mx-auto">
              Manual PSUR Compilation is Killing Your Productivity
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                stat: "6-8 weeks",
                problem: "Average time to compile a single PSUR manually",
                impact: "Delayed submissions risk regulatory non-compliance"
              },
              {
                stat: "73%",
                problem: "Of RA teams cite data traceability as their biggest audit risk",
                impact: "Notified Bodies increasingly demand source-level proof"
              },
              {
                stat: "40%",
                problem: "Of time spent reformatting PMS data between systems",
                impact: "Your senior RAs should be analyzing, not copy-pasting"
              },
            ].map((item, i) => (
              <div key={i} className="p-6 rounded-2xl bg-card border border-border">
                <p className="text-4xl font-bold text-destructive mb-2">{item.stat}</p>
                <p className="text-foreground font-medium mb-3">{item.problem}</p>
                <p className="text-sm text-muted-foreground">{item.impact}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest">The Solution</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              AI That Understands Regulatory Context
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Smarticus doesn't just automate - it reasons through your data with the same rigor 
              as a seasoned regulatory professional.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: "Contextual AI Extraction",
                description: "Our models are trained on thousands of PSURs and regulatory documents. They understand the difference between a complaint trend and a safety signal."
              },
              {
                icon: GitBranch,
                title: "Full Decision Traceability",
                description: "Every statement in your PSUR links back to source data. When auditors ask 'where did this come from?', you have the answer in one click."
              },
              {
                icon: Layers,
                title: "MDCG-Native Templates",
                description: "Built around MDCG 2022-21 Annex I structure. Not retrofitted - purpose-built for EU MDR and UK MDR compliance."
              },
              {
                icon: Shield,
                title: "Benefit-Risk Reasoning",
                description: "AI-generated risk assessments include explicit reasoning chains, not black-box conclusions. Auditors see the logic."
              },
              {
                icon: Zap,
                title: "Rapid Compilation",
                description: "Compile complete PSURs in hours, not weeks. Our intelligent pipeline processes your PMS data, maps requirements, and drafts sections simultaneously."
              },
              {
                icon: Database,
                title: "Knowledge Graph Memory",
                description: "Your device history, previous findings, and regulatory context persist. Smarticus remembers what matters across reporting periods."
              },
            ].map((feature, i) => (
              <div key={i} className="group p-8 rounded-2xl bg-card border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Dashboard Section */}
      <section className="py-20 bg-gradient-to-b from-secondary/30 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <p className="text-sm font-semibold text-primary uppercase tracking-widest">Regulatory Coverage</p>
                <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
                  Purpose-Built for Medical Device Post-Market Surveillance
                </h2>
                <p className="text-muted-foreground text-lg">
                  Every template, validation rule, and AI model is designed specifically for the 
                  unique requirements of medical device regulatory submissions.
                </p>
              </div>

              <div className="space-y-4">
                {[
                  { icon: CheckCircle2, text: "Full MDCG 2022-21 Annex I section coverage with gap detection" },
                  { icon: CheckCircle2, text: "Automatic IMDRF code mapping for incident classification" },
                  { icon: CheckCircle2, text: "Integrated PMCF data analysis and trend detection" },
                  { icon: CheckCircle2, text: "EUDAMED-compatible export formats for submission" },
                  { icon: CheckCircle2, text: "Multi-language summary generation (EN, DE, FR, ES, IT)" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <item.icon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <Link href="/regulatory">
                  <Button size="lg" variant="outline" className="rounded-full gap-2">
                    View Regulatory Framework
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Compliance visual */}
            <div className="bg-card rounded-2xl border border-border p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Framework Alignment</h3>
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                  Fully Aligned
                </span>
              </div>
              
              <div className="space-y-4">
                {[
                  { label: "EU MDR 2017/745 Article 86", progress: 100, desc: "PSUR submission requirements" },
                  { label: "MDCG 2022-21 Rev.1", progress: 100, desc: "PSUR format and content guidance" },
                  { label: "UK MDR 2002 (as amended)", progress: 100, desc: "UK-specific reporting obligations" },
                  { label: "ISO 13485:2016", progress: 95, desc: "QMS integration points" },
                  { label: "MEDDEV 2.7/1 Rev.4", progress: 100, desc: "Clinical evaluation alignment" },
                ].map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <div>
                        <span className="text-foreground font-medium">{item.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">- {item.desc}</span>
                      </div>
                      <span className="font-medium text-foreground">{item.progress}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all" 
                        style={{ width: `${item.progress}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div className="text-center p-3 rounded-xl bg-secondary/50">
                  <Globe className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Jurisdictions</p>
                  <p className="text-lg font-bold text-foreground">EU + UK</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-secondary/50">
                  <FileText className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Templates</p>
                  <p className="text-lg font-bold text-foreground">12+</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-secondary/50">
                  <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Data Types</p>
                  <p className="text-lg font-bold text-foreground">40+</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-12">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Trusted By</p>
            <h2 className="text-2xl font-bold text-foreground">
              Regulatory Teams at Leading Medical Device Companies
            </h2>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
            {["MedTech", "CardioSafe", "OrthoVision", "NeuroLink", "DiagnosTech", "BioMedical"].map((name, i) => (
              <div key={i} className="text-2xl font-bold text-muted-foreground">{name}</div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Ready to Transform Your PSUR Workflow?
          </div>
          
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
            Your Next PSUR Could Take Days, Not Months
          </h2>
          
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join regulatory teams who have eliminated the manual compilation nightmare. 
            Full decision traceability. Audit-ready documentation. Peace of mind.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <Link href="/psur">
                <Button size="lg" className="h-14 px-10 rounded-full text-base font-semibold gap-2">
                  Create Your PSUR
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            ) : (
              <Button 
                size="lg" 
                className="h-14 px-10 rounded-full text-base font-semibold gap-2"
                onClick={() => openAuthModal()}
              >
                Start Your Free Trial
                <ArrowRight className="w-5 h-5" />
              </Button>
            )}
            <Link href="/guide">
              <Button variant="outline" size="lg" className="h-14 px-10 rounded-full text-base font-semibold">
                Read the Documentation
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">Smarticus Draft Engine</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for medical device regulatory compliance. SOC 2 Type II certified.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
