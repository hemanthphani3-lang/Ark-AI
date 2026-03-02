import { useAppState } from "@/context/AppContext";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Compass, CheckCircle2, AlertTriangle, Info, XCircle,
  BarChart3, Shield, ArrowRight
} from "lucide-react";
import {
  runVastuAnalysis, VastuFacing, VastuMode, VastuZone,
  getZoneRects, VastuCheckResult, VASTU_RULES
} from "@/utils/vastuEngine";

// ─── Zone Color Map ─────────────────────────────────────────────────────────

const ZONE_COLORS: Record<VastuZone, { fill: string; stroke: string; label: string }> = {
  NE: { fill: 'hsl(174, 60%, 45%, 0.12)', stroke: 'hsl(174, 60%, 45%, 0.4)', label: 'NE' },
  N: { fill: 'hsl(220, 80%, 55%, 0.08)', stroke: 'hsl(220, 80%, 55%, 0.3)', label: 'N' },
  NW: { fill: 'hsl(270, 60%, 55%, 0.1)', stroke: 'hsl(270, 60%, 55%, 0.35)', label: 'NW' },
  E: { fill: 'hsl(200, 70%, 50%, 0.08)', stroke: 'hsl(200, 70%, 50%, 0.3)', label: 'E' },
  Center: { fill: 'hsl(0, 0%, 50%, 0.06)', stroke: 'hsl(0, 0%, 50%, 0.2)', label: 'B' },
  W: { fill: 'hsl(240, 60%, 55%, 0.08)', stroke: 'hsl(240, 60%, 55%, 0.3)', label: 'W' },
  SE: { fill: 'hsl(38, 80%, 50%, 0.12)', stroke: 'hsl(38, 80%, 50%, 0.4)', label: 'SE' },
  S: { fill: 'hsl(215, 20%, 40%, 0.08)', stroke: 'hsl(215, 20%, 40%, 0.3)', label: 'S' },
  SW: { fill: 'hsl(215, 30%, 35%, 0.12)', stroke: 'hsl(215, 30%, 35%, 0.4)', label: 'SW' },
};

const ZONE_GOOD: VastuZone[] = ['NE', 'N', 'E', 'SE'];
const ZONE_CAUTION: VastuZone[] = ['NW', 'S', 'W'];
const ZONE_RESTRICTED: VastuZone[] = ['SW', 'Center'];

// ─── Score Arc Component ────────────────────────────────────────────────────

function ScoreArc({ score }: { score: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={120} height={70} viewBox="0 0 120 70">
      <defs>
        <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
      </defs>
      <circle cx={60} cy={60} r={r} fill="none" stroke="hsl(215,20%,15%)" strokeWidth={8} />
      <circle
        cx={60} cy={60} r={r} fill="none"
        stroke="url(#arc-grad)" strokeWidth={8}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x={60} y={56} textAnchor="middle" fill={color} fontSize={18} fontWeight={900} fontFamily="monospace">
        {score}
      </text>
      <text x={60} y={68} textAnchor="middle" fill="hsl(215,20%,60%)" fontSize={7} fontWeight={700}>
        / 100
      </text>
    </svg>
  );
}

// ─── Zone Map SVG ───────────────────────────────────────────────────────────

function ZoneMap({ plotW, plotH, facing, checks, rooms }: {
  plotW: number; plotH: number; facing: VastuFacing;
  checks: VastuCheckResult[]; rooms: ReturnType<typeof useAppState>['floorPlan'];
}) {
  const SVG_W = 220, SVG_H = 160;
  const scaleX = SVG_W / (plotW || 1);
  const scaleY = SVG_H / (plotH || 1);
  const zoneRects = getZoneRects(plotW, plotH, facing);

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-xl border border-border overflow-hidden" style={{ maxHeight: 180 }}>
      {/* zone tiles */}
      {zoneRects.map(({ zone, x, y, w, h }) => {
        const col = ZONE_COLORS[zone];
        return (
          <g key={zone}>
            <rect x={x * scaleX} y={y * scaleY} width={w * scaleX} height={h * scaleY}
              fill={col.fill} stroke={col.stroke} strokeWidth={0.5} />
            <text x={(x + w / 2) * scaleX} y={(y + h / 2) * scaleY + 3}
              textAnchor="middle" fill={col.stroke} fontSize={7} fontWeight={700} opacity={0.9}>
              {col.label}
            </text>
          </g>
        );
      })}

      {/* Room centroids */}
      {rooms.filter(r => r.floor === 0).map(room => {
        const cx = (room.polygon ? room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length : room.x + room.width / 2) * scaleX;
        const cy = (room.polygon ? room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length : room.y + room.height / 2) * scaleY;
        const matchedCheck = checks.find(c => c.rooms.some(r => r.id === room.id));
        const dotColor = matchedCheck?.inAvoid ? '#ef4444' : matchedCheck?.compliant ? '#22c55e' : '#f59e0b';

        return (
          <g key={room.id}>
            <circle cx={cx} cy={cy} r={3} fill={dotColor} opacity={0.85} />
            <text x={cx} y={cy - 4.5} textAnchor="middle" fill="white" fontSize={4.5} fontWeight={700}>
              {room.name.substring(0, 6)}
            </text>
          </g>
        );
      })}

      {/* Compass labels */}
      <text x={SVG_W / 2} y={7} textAnchor="middle" fill="hsl(215,20%,70%)" fontSize={6} fontWeight={700}>NORTH</text>
      <text x={SVG_W / 2} y={SVG_H - 2} textAnchor="middle" fill="hsl(215,20%,70%)" fontSize={6} fontWeight={700}>SOUTH</text>
      <text x={3} y={SVG_H / 2 + 2} textAnchor="middle" fill="hsl(215,20%,70%)" fontSize={6} fontWeight={700}>W</text>
      <text x={SVG_W - 3} y={SVG_H / 2 + 2} textAnchor="middle" fill="hsl(215,20%,70%)" fontSize={6} fontWeight={700}>E</text>
    </svg>
  );
}

// ─── Compliance Card ────────────────────────────────────────────────────────

function ComplianceCard({ check }: { check: VastuCheckResult }) {
  const { rule, zone, compliant, inAvoid, score, maxScore, advisoryNote, hasRoom } = check;

  const borderColor = !hasRoom ? 'border-border' : inAvoid ? 'border-destructive/30' : compliant ? 'border-success/30' : 'border-warning/30';
  const bgColor = !hasRoom ? 'bg-muted/20' : inAvoid ? 'bg-destructive/5' : compliant ? 'bg-success/5' : 'bg-warning/5';
  const icon = !hasRoom ? <Info className="h-3.5 w-3.5 text-muted-foreground" /> :
    inAvoid ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
      compliant ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> :
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />;

  const pct = Math.round((score / maxScore) * 100);

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[11px] font-bold text-foreground">{rule.label}</span>
          {zone && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${inAvoid ? 'text-destructive border-destructive/30 bg-destructive/10' :
              compliant ? 'text-success border-success/20 bg-success/10' :
                'text-warning border-warning/20 bg-warning/10'
              }`}>{zone}</span>
          )}
        </div>
        <div className="text-right">
          <span className={`text-[14px] font-black tabular-nums ${compliant ? 'text-success' : inAvoid ? 'text-destructive' : 'text-warning'}`}>
            {score}
          </span>
          <span className="text-[9px] text-muted-foreground">/{maxScore}</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${compliant ? 'bg-success' : inAvoid ? 'bg-destructive' : 'bg-warning'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-start gap-1.5">
        <div>
          <p className="text-[9px] text-muted-foreground leading-relaxed">{advisoryNote}</p>
          {!hasRoom && (
            <p className="text-[9px] text-muted-foreground/60 italic mt-0.5">Room not present in current plan.</p>
          )}
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {rule.preferred.map(z => (
          <span key={z} className="text-[8px] px-1 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold">{z} ✓</span>
        ))}
        {rule.avoid.map(z => (
          <span key={z} className="text-[8px] px-1 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-bold">{z} ✗</span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

const VastuEngine = () => {
  const { floorPlan, floorPlanSaved, plotWidth, plotHeight, state, setProjectMeta, setScores } = useAppState();
  const navigate = useNavigate();
  const [localMode, setLocalMode] = useState<VastuMode>(state.projectMeta.vastuMode as VastuMode || 'Hybrid');

  const facing = state.projectMeta.facing as VastuFacing;

  const report = useMemo(() => {
    if (!floorPlanSaved || !floorPlan.length) return null;
    const r = runVastuAnalysis(floorPlan, plotWidth, plotHeight, facing, localMode);
    // Wire score back to global state
    setScores({ vastu: r.score });
    return r;
  }, [floorPlan, floorPlanSaved, plotWidth, plotHeight, facing, localMode]);

  // Sync mode to AppContext
  const handleModeChange = (mode: VastuMode) => {
    setLocalMode(mode);
    setProjectMeta({ vastuMode: mode });
  };

  if (!floorPlanSaved || !floorPlan.length) {
    return (
      <div className="module-container max-w-3xl">
        <div className="glass-card text-center py-16 space-y-4">
          <Compass className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Vastu Shastra Intelligence Engine</p>
            <p className="text-xs text-muted-foreground">Save a floor plan first to run directional compliance analysis.</p>
          </div>
          <button className="btn-primary text-xs" onClick={() => navigate("/floor-plan")}>
            Go to Floor Planning <ArrowRight className="h-3 w-3 inline ml-1" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="module-container max-w-5xl space-y-6">

      {/* Header */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Compass className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Vastu Shastra Intelligence Engine</h2>
              <p className="text-[10px] text-muted-foreground">Directional compliance analysis — {facing}-facing plot</p>
            </div>
          </div>

          {report && <ScoreArc score={report.score} />}
        </div>

        {/* Mode Selector */}
        <div className="flex gap-2">
          {(['Strict', 'Hybrid', 'Off'] as VastuMode[]).map(m => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex-1 rounded-xl border p-3 text-left transition-all ${localMode === m
                ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(0,0,0,0.2)]'
                : 'border-border bg-muted/40 hover:border-primary/30'
                }`}
            >
              <p className="text-[11px] font-bold text-foreground">{m} Mode</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {m === 'Strict' ? 'Full compliance required' :
                  m === 'Hybrid' ? 'Balanced — recommended' :
                    'Directional analysis disabled'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {localMode === 'Off' ? (
        <div className="glass-card text-center py-10">
          <Info className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Vastu Analysis Disabled</p>
          <p className="text-xs text-muted-foreground mt-1">Switch to Hybrid or Strict mode to run directional analysis.</p>
        </div>
      ) : localMode === 'Hybrid' && report ? (
        <>
          {/* Hybrid: Physics + Vastu notice */}
          <div className="glass-card border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-primary mb-1">Hybrid Mode — Physics + Vastu Combined</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  In Hybrid mode, the overall score blends Vastu directional compliance (50%) and structural physics analysis (50%)
                  with equal weight. Physics engine warnings always take priority — structural safety overrides directional preferences.
                  Visit the <strong>Physics Engine</strong> page for structural risk scores, load analysis, and cantilever checks.
                </p>
              </div>
            </div>
          </div>
          {/* Still show Vastu zone analysis below */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-card !p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                  <BarChart3 className="h-3 w-3" /> Directional Plan View
                </h4>
                <ZoneMap
                  plotW={plotWidth}
                  plotH={plotHeight}
                  facing={facing}
                  checks={report.breakdown}
                  rooms={floorPlan}
                />
              </div>
            </div>
            <div className="lg:col-span-3 space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3" /> Room-by-Room Vastu Analysis
              </h4>
              {report.breakdown.map(check => (
                <ComplianceCard key={check.rule.label} check={check} />
              ))}
            </div>
          </div>
        </>
      ) : report && (
        <>
          {/* Zone Map + Score Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-card !p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                  <BarChart3 className="h-3 w-3" /> Directional Plan View
                </h4>
                <ZoneMap
                  plotW={plotWidth}
                  plotH={plotHeight}
                  facing={facing}
                  checks={report.breakdown}
                  rooms={floorPlan}
                />
                <div className="mt-3 grid grid-cols-3 gap-1">
                  {[
                    { label: 'Preferred', color: 'bg-success' },
                    { label: 'Acceptable', color: 'bg-warning' },
                    { label: 'Conflicting', color: 'bg-destructive' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-1">
                      <div className={`h-2 w-2 rounded-full ${item.color}`} />
                      <span className="text-[8px] text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score Breakdown Table */}
              <div className="glass-card !p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Score Breakdown</h4>
                <div className="space-y-1.5">
                  {report.breakdown.map(c => (
                    <div key={c.rule.label} className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground truncate flex-1">{c.rule.label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.compliant ? 'bg-success' : c.inAvoid ? 'bg-destructive' : 'bg-warning'}`}
                            style={{ width: `${Math.round((c.score / c.maxScore) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-mono font-bold text-foreground w-8 text-right">
                          {c.score}/{c.maxScore}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <span className="text-[9px] font-bold text-foreground uppercase">Total Score</span>
                    <span className={`text-sm font-black tabular-nums ${report.score >= 75 ? 'text-success' : report.score >= 50 ? 'text-warning' : 'text-destructive'}`}>
                      {report.score}/100
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance Cards */}
            <div className="lg:col-span-3 space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3" /> Room-by-Room Analysis
              </h4>
              {report.breakdown.map(check => (
                <ComplianceCard key={check.rule.label} check={check} />
              ))}
            </div>
          </div>

          {/* Brahmasthan Warnings */}
          {report.brahmasthanViolations.length > 0 && (
            <div className="glass-card border-destructive/20 bg-destructive/5">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-destructive mb-1">Brahmasthan (Central Zone) Violations</p>
                  <p className="text-[10px] text-muted-foreground mb-3">
                    The central zone of the plot should remain functionally clear. Placing high-load or wet functions at the center creates both directional and structural planning conflicts.
                  </p>
                  <div className="space-y-2">
                    {report.brahmasthanViolations.map(v => (
                      <div key={v.room.id} className="flex items-start gap-2 bg-destructive/10 rounded-lg p-2.5 border border-destructive/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-bold text-foreground">{v.room.name}</span>
                          <p className="text-[9px] text-muted-foreground leading-relaxed">{v.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Structural Override Notice */}
          {report.hasStructuralOverride && (
            <div className="glass-card border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-primary mb-1">Structural Safety Prioritized</p>
                  <p className="text-[10px] text-muted-foreground">
                    One or more structural elements (e.g., staircase) are in a zone flagged by Vastu rules. Structural and circulation safety takes precedence over directional placement. The advisory score reflects this but no layout change has been applied.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Advisory Notes */}
          {(localMode as string) !== 'Off' && report.breakdown.some(c => c.hasRoom && !c.compliant) && (
            <div className="glass-card border-info/20">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-info mb-2">Vastu Advisory Notes</p>
                  <div className="space-y-1.5">
                    {report.breakdown.filter(c => c.hasRoom && !c.compliant).map(c => (
                      <div key={c.rule.label} className="flex items-start gap-2">
                        <ArrowRight className="h-3 w-3 text-info shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{c.advisoryNote}</p>
                      </div>
                    ))}
                    {report.breakdown.filter(c => !c.hasRoom).map(c => (
                      <div key={c.rule.label} className="flex items-start gap-2">
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{c.advisoryNote}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VastuEngine;
