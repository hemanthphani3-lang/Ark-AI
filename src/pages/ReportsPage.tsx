import { useAppState } from "@/context/AppContext";
import { FileText, Coins, Shield, Compass, CheckSquare, Download, AlertTriangle, TrendingUp, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COST_COLORS: Record<string, string> = {
  foundation: "hsl(217, 91%, 60%)",
  structural: "hsl(199, 89%, 48%)",
  brickwork: "hsl(38, 92%, 50%)",
  electrical: "hsl(280, 60%, 55%)",
  plumbing: "hsl(142, 71%, 45%)",
  flooring: "hsl(340, 75%, 55%)",
  painting: "hsl(160, 60%, 45%)",
  finishing: "hsl(15, 80%, 55%)",
  miscellaneous: "hsl(215, 20%, 50%)",
};

const ReportsPage = () => {
  const { state, hasFloorPlan, floorPlanSaved, plotSize, floorConfig, floorPlan } = useAppState();
  const navigate = useNavigate();

  if (!hasFloorPlan) {
    return (
      <div className="module-container max-w-3xl">
        <div className="glass-card text-center py-16">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">No Project Data Yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Generate a floor plan to unlock the full cost estimation, structural scores, and compliance reports.
          </p>
          <button className="btn-primary" onClick={() => navigate("/floor-plan")}>
            Go to Floor Planning
          </button>
        </div>
      </div>
    );
  }

  const costEntries = Object.entries(state.costBreakdown).filter(([, v]) => (v as number) > 0);
  const chartData = costEntries.map(([key, val]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: val as number,
    color: COST_COLORS[key] || "hsl(217,50%,50%)",
  }));

  const totalCost = state.estimatedCost;
  const numFloors = floorConfig?.numFloors || 1;
  const costPerSqFt = plotSize > 0 ? Math.round(totalCost / plotSize) : 0;
  const isCompliant = state.complianceStatus === "Compliant";

  const scoreItems = [
    { label: "Structural Safety", score: state.scores.structural, icon: Shield, color: "text-success", bg: "bg-success" },
    { label: "Circulation", score: state.scores.circulation, icon: Home, color: "text-primary", bg: "bg-primary" },
    { label: "Vastu Compliance", score: state.scores.vastu, icon: Compass, color: "text-warning", bg: "bg-warning" },
    { label: "Cost Stability", score: state.scores.cost, icon: TrendingUp, color: "text-info", bg: "bg-info" },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">{payload[0].payload.name}</p>
          <p className="text-sm font-black text-foreground">₹{(payload[0].value as number).toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="module-container max-w-6xl space-y-6">
      {/* Header */}
      <div className="glass-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Project Intelligence Report</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {plotSize} sq ft · {floorPlan.length} rooms · {numFloors} floor{numFloors > 1 ? "s" : ""} · Vastu: {state.projectMeta.vastuMode}
            </p>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase border ${isCompliant ? "bg-success/10 border-success/30 text-success" : "bg-warning/10 border-warning/30 text-warning"}`}>
            {state.complianceStatus}
          </div>
        </div>
      </div>

      {/* Total Cost Hero */}
      <div className="glass-card relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "var(--gradient-primary)" }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Total Estimated Cost</p>
            <p className="text-4xl font-black text-primary tabular-nums">₹{Math.round(totalCost).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-1 italic">*Based on area-indexed material + labor costs</p>
          </div>
          <div className="flex flex-col justify-center border-l border-border pl-6">
            <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Cost Per Sq Ft</p>
            <p className="text-2xl font-black text-foreground tabular-nums">₹{costPerSqFt.toLocaleString()}</p>
          </div>
          <div className="flex flex-col justify-center border-l border-border pl-6">
            <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Built-up Area</p>
            <p className="text-2xl font-black text-foreground tabular-nums">{plotSize.toLocaleString()} <span className="text-base font-medium">sq ft</span></p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cost Breakdown List */}
        <div className="lg:col-span-5 glass-card">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
            <Coins className="h-3 w-3" /> Detailed Cost Breakdown
          </h4>
          <div className="space-y-3">
            {costEntries.map(([key, val]) => {
              const pct = Math.round(((val as number) / totalCost) * 100);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-foreground capitalize">{key}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                      <span className="text-[11px] font-mono font-bold text-foreground min-w-[90px] text-right">
                        ₹{(val as number).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: COST_COLORS[key] || "hsl(217,50%,50%)" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">TOTAL</span>
            <span className="text-lg font-black text-primary">₹{Math.round(totalCost).toLocaleString()}</span>
          </div>
        </div>

        {/* Cost Bar Chart */}
        <div className="lg:col-span-7 glass-card">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
            <TrendingUp className="h-3 w-3" /> Cost Distribution Chart
          </h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 40, left: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: "hsl(215,20%,50%)", fontWeight: 600 }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "hsl(215,20%,50%)" }}
                tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(215,20%,15%)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Intelligence Scores */}
      <div className="glass-card">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-5 flex items-center gap-2">
          <Shield className="h-3 w-3" /> Engineering Intelligence Scores
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {scoreItems.map((s) => (
            <div key={s.label} className="p-4 rounded-xl border border-border bg-muted/20 text-center">
              <s.icon className={`h-5 w-5 ${s.color} mx-auto mb-2`} />
              <p className="text-2xl font-black text-foreground mb-1">{s.score}<span className="text-base font-medium">%</span></p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">{s.label}</p>
              <div className="h-1 w-full bg-muted rounded-full overflow-hidden mt-2">
                <div className={`h-full ${s.bg}`} style={{ width: `${s.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance & Rooms summary side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <CheckSquare className="h-3 w-3" /> Compliance Summary
          </h4>
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${isCompliant ? "bg-success/5 border-success/20" : "bg-warning/5 border-warning/20"}`}>
            {isCompliant
              ? <CheckSquare className="h-8 w-8 text-success shrink-0" />
              : <AlertTriangle className="h-8 w-8 text-warning shrink-0" />
            }
            <div>
              <p className="text-sm font-black text-foreground uppercase">{state.complianceStatus}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {isCompliant
                  ? "All primary zoning regulations are satisfied."
                  : "Some regulations need review. See Compliance Check."}
              </p>
            </div>
          </div>
          <button onClick={() => navigate("/compliance")} className="mt-3 w-full py-2 rounded-lg border border-border text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            View Full Compliance Report →
          </button>
        </div>

        <div className="glass-card">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <Home className="h-3 w-3" /> Room Summary
          </h4>
          <div className="space-y-2 max-h-[180px] overflow-y-auto">
            {floorPlan.slice(0, 10).map((room) => (
              <div key={room.id} className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-sm shrink-0" style={{ background: room.color }} />
                <span className="text-xs font-medium text-foreground flex-1">{room.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{Math.round(room.area)} ft²</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${room.zone === 'public' ? 'bg-primary/10 text-primary' :
                    room.zone === 'service' ? 'bg-warning/10 text-warning' :
                      room.zone === 'core' ? 'bg-muted text-muted-foreground' :
                        'bg-success/10 text-success'
                  }`}>{room.zone}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export note */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted/30 text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold uppercase">PDF Export — Coming Soon</span>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
