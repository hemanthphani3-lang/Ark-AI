import { useAppState } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  Activity, Shield, Compass, Wallet, ArrowRight, MapPin, Grid3X3, Box, Eye, FolderOpen, Play, Layers, FileText
} from "lucide-react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
} from "recharts";

const ScoreCard = ({ label, value, icon: Icon, colorVar, description }: {
  label: string; value: number; icon: React.ElementType; colorVar: string; description: string;
}) => {
  const color = `hsl(var(${colorVar}))`;
  const data = [{ value, fill: color }];
  return (
    <div className="glass-card flex flex-col items-center text-center py-[var(--sp-lg)] px-[var(--sp-lg)] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="relative w-20 h-20 mb-3">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="75%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
            <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} max={100} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold tabular-nums" style={{ color }}>{value}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
    </div>
  );
};

const QuickAction = ({ label, description, icon: Icon, path, locked }: {
  label: string; description: string; icon: React.ElementType; path: string; locked?: boolean;
}) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => !locked && navigate(path)}
      disabled={locked}
      className={`glass-card-hover text-left w-full group ${locked ? "opacity-30 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start gap-[var(--sp-md)]">
        <div className="rounded-lg bg-primary/8 p-[var(--sp-sm)] border border-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-foreground">{label}</h3>
            {!locked && <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{description}</p>
        </div>
      </div>
    </button>
  );
};

const Dashboard = () => {
  const { floorPlanSaved, state, projects, loadProject, activeProjectId } = useAppState();
  const navigate = useNavigate();

  return (
    <div className="module-container max-w-7xl mx-auto space-y-[var(--sp-xl)]">
      {/* Hero Progression */}
      <div className="glass-card relative overflow-hidden p-[var(--sp-xl)] border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] -mr-32 -mt-32" />
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-widest">
              Architectural Co-Pilot Active
            </div>
            <h2 className="text-3xl font-black text-foreground font-heading leading-tight">
              {floorPlanSaved ? "Your Project is Evolution-Ready" : "Let's Start Your Masterpiece"}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              ArkAI has synchronized your structural metadata. All {state.bimMode ? 'BIM' : 'Standard'} modules are ready for cross-cascading real-time analysis.
            </p>
          </div>
          <button
            onClick={() => navigate(floorPlanSaved ? "/visualizer" : "/land-intelligence")}
            className="btn-primary flex items-center gap-3 px-8 py-4 whitespace-nowrap shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]"
          >
            <span className="uppercase tracking-widest font-black text-xs">
              {floorPlanSaved ? "Enter Visualizer Studio" : "Begin Discovery Phase"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Four Core Scores */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
            <Activity className="h-3 w-3 text-primary" />
            Intelligence Metrics
          </h3>
          <span className="text-[10px] text-muted-foreground opacity-50 uppercase tracking-widest font-bold">Real-time Syncing</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--sp-lg)]">
          <ScoreCard label="Project Health" value={floorPlanSaved ? 72 : 0} icon={Activity} colorVar="--score-health" description="Overall project viability & synergy" />
          <ScoreCard label="Structural Safety" value={floorPlanSaved ? 85 : 0} icon={Shield} colorVar="--score-structural" description="Seismic & load distribution factor" />
          <ScoreCard label="Vastu Compliance" value={floorPlanSaved ? 68 : 0} icon={Compass} colorVar="--score-vastu" description="Traditional alignment precision" />
          <ScoreCard label="Budget Stability" value={floorPlanSaved ? 91 : 0} icon={Wallet} colorVar="--score-budget" description="Financial confidence & BOQ health" />
        </div>
      </div>

      {/* Quick Actions / Journey Map */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <Layers className="h-3 w-3 text-primary" />
          Journey Milestones
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--sp-lg)]">
          <QuickAction label="Phase 01: Site Discovery" description="Plot risks, soil analysis, geo-intelligence" icon={MapPin} path="/land-intelligence" />
          <QuickAction label="Phase 02: Space Planning" description="Room configuration & functional layout" icon={Grid3X3} path="/floor-plan" />
          <QuickAction label="Phase 03: Visual Studio" description="Consolidated Structural & Aesthetic 3D" icon={Box} path="/visualizer" locked={!floorPlanSaved} />
          <QuickAction label="Phase 04: Delivery Core" description="Certified Reports & Compliance Export" icon={FileText} path="/reports" locked={!floorPlanSaved} />
        </div>
      </div>

      {/* Status */}
      {!floorPlanSaved && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
          <p className="text-xs text-warning font-medium">
            ⚠ No floor plan saved — Start by configuring your land and generating a floor plan to unlock all modules.
          </p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
