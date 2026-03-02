import { useAppState } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  Activity, Shield, Compass, Wallet, ArrowRight, MapPin, Grid3X3, Box, Eye, FolderOpen, Play
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
    <div className="glass-card flex flex-col items-center text-center py-5 px-4 relative overflow-hidden">
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
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/8 p-2.5 border border-primary/10">
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
    <div className="module-container max-w-6xl">
      {/* Welcome */}
      <div className="glass-card relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "var(--gradient-primary)" }} />
        <div className="flex items-start gap-4">
          <div>
            <h2 className="text-base font-bold text-foreground mb-1 font-heading">
              Construction Intelligence System
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              ArkAI acts as your co-pilot for residential construction planning — combining structural engineering,
              geo-based land intelligence, Vastu principles, cost forecasting, and immersive 3D visualization into
              a unified decision system. Every change cascades across all modules in real time.
            </p>
          </div>
        </div>
      </div>

      {/* Saved Projects */}
      {projects && projects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="h-4 w-4 text-primary" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Saved Projects</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`glass-card p-4 border  transition-all flex flex-col gap-3 ${activeProjectId === project.id ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-primary/30'} `}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">{project.name}</h4>
                    <span className="text-[9px] text-muted-foreground bg-black/40 px-2 py-0.5 rounded uppercase tracking-wider">{new Date(project.dateSaved).toLocaleDateString()}</span>
                  </div>
                  {activeProjectId === project.id && (
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1 py-3 border-y border-border/30">
                  <div>
                    <span className="text-[8px] uppercase text-muted-foreground font-bold tracking-wider">Rooms</span>
                    <p className="text-xs font-mono font-bold text-foreground">{project.totalRooms}</p>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase text-muted-foreground font-bold tracking-wider">Area</span>
                    <p className="text-xs font-mono font-bold text-foreground">{project.plotSize} <span className="text-[8px]">SQFT</span></p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    loadProject(project.id);
                    navigate("/floor-plan");
                  }}
                  className={`w-full flex justify-center items-center gap-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${activeProjectId === project.id ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-foreground'}`}
                >
                  <Play className="h-3 w-3" /> {activeProjectId === project.id ? 'Active Project' : 'Load Workspace'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Four Core Scores */}
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-3">Core Scores</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ScoreCard label="Project Health" value={floorPlanSaved ? 72 : 0} icon={Activity} colorVar="--score-health" description="Overall project viability" />
          <ScoreCard label="Structural Safety" value={floorPlanSaved ? 85 : 0} icon={Shield} colorVar="--score-structural" description="Load & seismic analysis" />
          <ScoreCard label="Vastu Compliance" value={floorPlanSaved ? 68 : 0} icon={Compass} colorVar="--score-vastu" description="Traditional alignment score" />
          <ScoreCard label="Budget Stability" value={floorPlanSaved ? 91 : 0} icon={Wallet} colorVar="--score-budget" description="Cost confidence level" />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-3">Workflow</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="Land Intelligence" description="Analyze plot risks, soil, seismic zone" icon={MapPin} path="/land-intelligence" />
          <QuickAction label="Floor Planning" description="Configure rooms with intelligent constraints" icon={Grid3X3} path="/floor-plan" />
          <QuickAction label="3D Visualization" description="View structural model with details" icon={Box} path="/visualization" locked={!floorPlanSaved} />
          <QuickAction label="Final Look" description="Immersive finished interior & exterior" icon={Eye} path="/final-look" locked={!floorPlanSaved} />
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
