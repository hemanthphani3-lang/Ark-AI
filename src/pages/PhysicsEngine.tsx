import { useAppState } from "@/context/AppContext";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Atom, AlertTriangle, CheckCircle2, XCircle, Info,
    Zap, Wind, Thermometer, Activity, ArrowRight,
    Building2, RotateCcw, ChevronRight, Layers, Shield
} from "lucide-react";
import {
    runPhysicsAnalysis, runWhatIfSimulation,
    PhysicsMode, PhysicsReport, PhysicsSeverity,
    PhysicsWarning, LoadArrow, StressZone, VentPath
} from "@/utils/physicsEngine";
import { VastuMode } from "@/utils/vastuEngine";

// ─── Score Gauge ─────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
    const r = 44;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;
    const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
    return (
        <svg width={120} height={70} viewBox="0 0 120 70">
            <defs>
                <linearGradient id="phys-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} />
                </linearGradient>
            </defs>
            <circle cx={60} cy={60} r={r} fill="none" stroke="hsl(215,20%,15%)" strokeWidth={8} />
            <circle
                cx={60} cy={60} r={r} fill="none"
                stroke="url(#phys-arc-grad)" strokeWidth={8}
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

// ─── Score Bar Card ───────────────────────────────────────────────────────────

interface MetricCardProps {
    label: string;
    score: number;
    icon: React.ReactNode;
    detail?: string;
}

function MetricCard({ label, score, icon, detail }: MetricCardProps) {
    const sev: PhysicsSeverity = score >= 70 ? 'safe' : score >= 40 ? 'moderate' : 'risk';
    const colorClass = sev === 'safe' ? 'text-success' : sev === 'moderate' ? 'text-warning' : 'text-destructive';
    const bgClass = sev === 'safe' ? 'bg-success/5 border-success/20' : sev === 'moderate' ? 'bg-warning/5 border-warning/20' : 'bg-destructive/5 border-destructive/20';
    const barClass = sev === 'safe' ? 'bg-success' : sev === 'moderate' ? 'bg-warning' : 'bg-destructive';
    const dot = sev === 'safe' ? '🟢' : sev === 'moderate' ? '🟡' : '🔴';

    return (
        <div className={`rounded-xl border ${bgClass} p-3.5 space-y-2.5`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{icon}</span>
                    <span className="text-[11px] font-bold text-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px]">{dot}</span>
                    <span className={`text-[15px] font-black tabular-nums ${colorClass}`}>{score}</span>
                    <span className="text-[9px] text-muted-foreground">/100</span>
                </div>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${barClass}`}
                    style={{ width: `${score}%` }}
                />
            </div>
            {detail && <p className="text-[9px] text-muted-foreground leading-relaxed">{detail}</p>}
        </div>
    );
}

// ─── Warning Card ─────────────────────────────────────────────────────────────

function WarningCard({ w }: { w: PhysicsWarning }) {
    const icon = w.severity === 'risk'
        ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
        : w.severity === 'moderate'
            ? <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />;
    const bg = w.severity === 'risk' ? 'bg-destructive/5 border-destructive/20'
        : w.severity === 'moderate' ? 'bg-warning/5 border-warning/20'
            : 'bg-success/5 border-success/20';
    const catColor = w.severity === 'risk' ? 'text-destructive' : w.severity === 'moderate' ? 'text-warning' : 'text-success';

    return (
        <div className={`rounded-xl border ${bg} p-3 flex items-start gap-2.5`}>
            {icon}
            <div className="space-y-0.5">
                <span className={`text-[9px] font-bold uppercase tracking-wider ${catColor}`}>{w.category}</span>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{w.message}</p>
            </div>
        </div>
    );
}

// ─── Physics Overlay SVG ──────────────────────────────────────────────────────

function PhysicsOverlaySVG({
    rooms, plotW, plotH,
    loadArrows, stressZones, ventPaths, showOverlay
}: {
    rooms: ReturnType<typeof useAppState>['floorPlan'];
    plotW: number; plotH: number;
    loadArrows: LoadArrow[];
    stressZones: StressZone[];
    ventPaths: VentPath[];
    showOverlay: boolean;
}) {
    const SVG_W = 260, SVG_H = 180;
    const scaleX = SVG_W / (plotW || 1);
    const scaleY = SVG_H / (plotH || 1);
    const groundRooms = rooms.filter(r => r.floor === 0);

    const stressMap: Record<number, string> = {};
    stressZones.forEach(sz => {
        stressMap[sz.roomId] = sz.level === 'risk' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.14)';
    });

    return (
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full rounded-xl border border-border overflow-hidden" style={{ maxHeight: 200 }}>
            {/* Room footprints */}
            {groundRooms.map(room => {
                const fill = stressMap[room.id] || 'rgba(255,255,255,0.03)';
                return (
                    <g key={room.id}>
                        <rect
                            x={room.x * scaleX} y={room.y * scaleY}
                            width={room.width * scaleX} height={room.height * scaleY}
                            fill={fill} stroke="hsl(215,20%,30%)" strokeWidth={0.6}
                        />
                        <text
                            x={(room.x + room.width / 2) * scaleX}
                            y={(room.y + room.height / 2) * scaleY + 3}
                            textAnchor="middle" fill="hsl(215,20%,70%)" fontSize={5} fontWeight={600}
                        >
                            {room.name.substring(0, 8)}
                        </text>
                    </g>
                );
            })}

            {/* Load arrows */}
            {showOverlay && loadArrows.filter(a => a.floor === 0).slice(0, 12).map((a, i) => {
                const x1 = a.x * scaleX, y1 = a.y * scaleY;
                const x2 = x1 + a.dx * scaleX * 0.3, y2 = y1 + a.dy * scaleY * 0.3;
                return (
                    <g key={`la-${i}`} opacity={0.7}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#60a5fa" strokeWidth={1.2} strokeLinecap="round" />
                        <polygon
                            points={`${x2},${y2} ${x2 - 2},${y2 - 4} ${x2 + 2},${y2 - 4}`}
                            fill="#60a5fa" transform={`rotate(180, ${x2}, ${y2})`}
                        />
                    </g>
                );
            })}

            {/* Ventilation paths */}
            {showOverlay && ventPaths.map((vp, i) => (
                <line
                    key={`vp-${i}`}
                    x1={vp.x1 * scaleX} y1={vp.y1 * scaleY}
                    x2={vp.x2 * scaleX} y2={vp.y2 * scaleY}
                    stroke="#2dd4bf" strokeWidth={1.4} strokeLinecap="round"
                    strokeDasharray="4 3" opacity={0.65}
                />
            ))}

            {/* Stress zone highlight borders */}
            {showOverlay && stressZones.map(sz => {
                const room = groundRooms.find(r => r.id === sz.roomId);
                if (!room) return null;
                return (
                    <rect
                        key={`sz-${sz.roomId}`}
                        x={room.x * scaleX} y={room.y * scaleY}
                        width={room.width * scaleX} height={room.height * scaleY}
                        fill="none"
                        stroke={sz.level === 'risk' ? '#ef4444' : '#f59e0b'}
                        strokeWidth={1.5} strokeDasharray="3 2"
                        opacity={0.8}
                    />
                );
            })}

            {/* Legend */}
            {showOverlay && (
                <g>
                    <circle cx={6} cy={SVG_H - 14} r={2.5} fill="#60a5fa" />
                    <text x={11} y={SVG_H - 11} fill="hsl(215,20%,60%)" fontSize={4.5}>Load path</text>
                    <circle cx={50} cy={SVG_H - 14} r={2.5} fill="#2dd4bf" />
                    <text x={55} y={SVG_H - 11} fill="hsl(215,20%,60%)" fontSize={4.5}>Ventilation</text>
                    <rect x={88} y={SVG_H - 17} width={5} height={5} fill="none" stroke="#ef4444" strokeWidth={1} />
                    <text x={95} y={SVG_H - 11} fill="hsl(215,20%,60%)" fontSize={4.5}>Stress zone</text>
                </g>
            )}
        </svg>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PhysicsEngine = () => {
    const {
        floorPlan, floorPlanSaved, plotWidth, plotHeight,
        state, setProjectMeta, setScores, floorConfig
    } = useAppState();
    const navigate = useNavigate();

    const storedMode = (state.projectMeta as any).physicsMode as PhysicsMode | undefined;
    const [localMode, setLocalMode] = useState<PhysicsMode>(storedMode || 'Physics');
    const [showOverlay, setShowOverlay] = useState(false);
    const [whatIfResult, setWhatIfResult] = useState<ReturnType<typeof runWhatIfSimulation> | null>(null);
    const [whatIfFloors, setWhatIfFloors] = useState(1);

    const vastuScore = state.scores.vastu || 0;

    const report = useMemo<PhysicsReport | null>(() => {
        if (!floorPlanSaved || !floorPlan.length) return null;
        const r = runPhysicsAnalysis(
            floorPlan, plotWidth, plotHeight,
            floorConfig, state.projectMeta.latLong || '',
            vastuScore, localMode
        );
        setScores({ physics: r.overallRiskScore } as any);
        return r;
    }, [floorPlan, floorPlanSaved, plotWidth, plotHeight, floorConfig, state.projectMeta.latLong, vastuScore, localMode]);

    const handleModeChange = (mode: PhysicsMode) => {
        setLocalMode(mode);
        setProjectMeta({ physicsMode: mode } as any);
        setWhatIfResult(null);
    };

    const handleWhatIf = () => {
        if (!report) return;
        setWhatIfResult(runWhatIfSimulation(report, whatIfFloors));
    };

    // ── Empty state ─────────────────────────────────────────────
    if (!floorPlanSaved || !floorPlan.length) {
        return (
            <div className="module-container max-w-3xl">
                <div className="glass-card text-center py-16 space-y-4">
                    <Atom className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                        <p className="text-sm font-semibold text-foreground mb-1">Physics Intelligence Engine</p>
                        <p className="text-xs text-muted-foreground">Save a floor plan first to run structural physics validation.</p>
                    </div>
                    <button className="btn-primary text-xs" onClick={() => navigate("/floor-plan")}>
                        Go to Floor Planning <ArrowRight className="h-3 w-3 inline ml-1" />
                    </button>
                </div>
            </div>
        );
    }

    const vastuMode = state.projectMeta.vastuMode as VastuMode;

    return (
        <div className="module-container max-w-5xl space-y-6">

            {/* Header */}
            <div className="glass-card">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                            <Atom className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-foreground">Physics Intelligence Engine</h2>
                            <p className="text-[10px] text-muted-foreground">
                                Structural validation · {floorConfig?.numFloors || 1} floor{(floorConfig?.numFloors || 1) > 1 ? 's' : ''}
                                {report?.seismicZone && ` · Seismic ${report.seismicZone}`}
                            </p>
                        </div>
                    </div>
                    {report && localMode !== 'Off' && <ScoreGauge score={report.overallRiskScore} />}
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-2 mb-4">
                    {(['Physics', 'Hybrid', 'Off'] as PhysicsMode[]).map(m => (
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
                                {m === 'Physics' ? 'Physics-only validation — safety first'
                                    : m === 'Hybrid' ? `Blends Physics + Vastu (${vastuMode !== 'Off' ? '50/50' : 'Vastu is Off'})`
                                        : 'Physics validation disabled'}
                            </p>
                        </button>
                    ))}
                </div>

                {/* Physics Overlay Toggle */}
                {localMode !== 'Off' && (
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary" />
                            <div>
                                <p className="text-[11px] font-bold text-foreground">Physics Mode Overlay</p>
                                <p className="text-[9px] text-muted-foreground">Show load arrows, stress zones & ventilation flow on floor plan</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowOverlay(p => !p)}
                            className={`relative h-6 w-11 rounded-full transition-colors ${showOverlay ? 'bg-primary' : 'bg-muted'}`}
                        >
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${showOverlay ? 'left-5.5' : 'left-0.5'}`}
                                style={{ left: showOverlay ? '1.375rem' : '0.125rem' }}
                            />
                        </button>
                    </div>
                )}
            </div>

            {/* OFF STATE */}
            {localMode === 'Off' ? (
                <div className="glass-card text-center py-10">
                    <Info className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground">Physics Analysis Disabled</p>
                    <p className="text-xs text-muted-foreground mt-1">Switch to Physics or Hybrid mode to run structural validation.</p>
                </div>
            ) : report && (
                <>
                    {/* Hybrid blending notice */}
                    {report.isHybridBlended && (
                        <div className="glass-card border-primary/20 bg-primary/5">
                            <div className="flex items-start gap-3">
                                <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-primary mb-1">Hybrid Mode Active</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        Overall score is a 50/50 blend of Physics ({report.structuralStabilityScore} structural base) and
                                        Vastu ({vastuScore} Vastu score). Physics warnings always take priority — structural safety overrides aesthetic or directional adjustments.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main grid: SVG overlay + Dashboard */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                        {/* Left: Overlay + Wind/Seismic summary */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="glass-card !p-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                                    <Activity className="h-3 w-3" /> Structural Overview
                                </h4>
                                <PhysicsOverlaySVG
                                    rooms={floorPlan}
                                    plotW={plotWidth}
                                    plotH={plotHeight}
                                    loadArrows={report.loadArrows}
                                    stressZones={report.stressZones}
                                    ventPaths={report.ventPaths}
                                    showOverlay={showOverlay}
                                />
                                {!showOverlay && (
                                    <p className="text-[9px] text-muted-foreground text-center mt-2">Enable Physics Overlay to see load arrows, stress zones & ventilation</p>
                                )}
                                {/* Wind / Seismic block */}
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <div className="rounded-lg bg-muted/30 border border-border p-2">
                                        <div className="flex items-center gap-1 mb-1">
                                            <Wind className="h-3 w-3 text-blue-400" />
                                            <span className="text-[9px] font-bold text-foreground">Wind</span>
                                        </div>
                                        <p className="text-[11px] font-black text-blue-400">{report.windPressure} kPa</p>
                                        <p className="text-[8px] text-muted-foreground leading-tight mt-0.5">
                                            {report.windPressure > 3.5 ? 'High exposure' : report.windPressure > 2 ? 'Moderate' : 'Low exposure'}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-muted/30 border border-border p-2">
                                        <div className="flex items-center gap-1 mb-1">
                                            <Zap className="h-3 w-3 text-orange-400" />
                                            <span className="text-[9px] font-bold text-foreground">Seismic</span>
                                        </div>
                                        <p className="text-[11px] font-black text-orange-400">{report.seismicZone}</p>
                                        <p className="text-[8px] text-muted-foreground leading-tight mt-0.5">IS:1893-2016 ref</p>
                                    </div>
                                </div>
                            </div>

                            {/* Safety priority notice */}
                            <div className="glass-card !p-3 border-primary/15 bg-primary/5">
                                <div className="flex items-start gap-2">
                                    <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] font-bold text-primary mb-0.5">Physics Priority Rule</p>
                                        <p className="text-[9px] text-muted-foreground leading-relaxed">
                                            Physics engine overrides Vastu, aesthetics, and space maximization. No layout with a structural risk warning will be approved automatically.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: 6-score Dashboard */}
                        <div className="lg:col-span-3 space-y-4">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                <Building2 className="h-3 w-3" /> Risk Dashboard
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <MetricCard
                                    label="Structural Stability"
                                    score={report.structuralStabilityScore}
                                    icon={<Building2 className="h-3.5 w-3.5" />}
                                    detail={report.structuralStabilityScore >= 70 ? 'Load path valid. No floating elements detected.' : 'Structural issues detected — review warnings.'}
                                />
                                <MetricCard
                                    label="Load Distribution"
                                    score={report.loadDistributionScore}
                                    icon={<Layers className="h-3.5 w-3.5" />}
                                    detail={report.loadDistributionScore >= 70 ? 'Beam spans within residential limits.' : 'Long-span beams or unsupported slabs detected.'}
                                />
                                <MetricCard
                                    label="Seismic Sensitivity"
                                    score={report.seismicScore}
                                    icon={<Zap className="h-3.5 w-3.5" />}
                                    detail={`${report.seismicZone} — ${report.seismicScore >= 70 ? 'mass distribution acceptable.' : 'irregular mass distribution risk.'}`}
                                />
                                <MetricCard
                                    label="Wind Stability"
                                    score={report.windScore}
                                    icon={<Wind className="h-3.5 w-3.5" />}
                                    detail={report.windDescription}
                                />
                                <MetricCard
                                    label="Thermal Comfort"
                                    score={report.thermalComfortScore}
                                    icon={<Thermometer className="h-3.5 w-3.5" />}
                                    detail={report.thermalComfortScore >= 70 ? 'Good cross-ventilation & solar orientation.' : 'Ventilation or solar heat gain issues detected.'}
                                />
                                <MetricCard
                                    label="Cantilever Safety"
                                    score={report.cantileverScore}
                                    icon={<ChevronRight className="h-3.5 w-3.5" />}
                                    detail={report.cantileverScore >= 70 ? 'No excessive cantilever projections.' : 'Balcony/overhang exceeds safe residential limit.'}
                                />
                            </div>

                            {/* Circulation metric (full width) */}
                            <MetricCard
                                label="Circulation Efficiency"
                                score={report.circulationScore}
                                icon={<Activity className="h-3.5 w-3.5" />}
                                detail={report.circulationScore >= 70 ? 'Good movement flow, stair accessibility confirmed.' : 'Dead-ends or missing circulation spine detected.'}
                            />
                        </div>
                    </div>

                    {/* Warnings */}
                    {report.warnings.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                <AlertTriangle className="h-3 w-3" /> Structural Warnings ({report.warnings.length})
                            </h4>
                            {report.warnings.map(w => <WarningCard key={w.id} w={w} />)}
                        </div>
                    )}

                    {report.warnings.length === 0 && (
                        <div className="glass-card border-success/20 bg-success/5">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-success">All Physics Checks Passed</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        No structural, cantilever, or circulation issues detected in the current layout.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* What-If Simulation */}
                    <div className="glass-card space-y-4">
                        <div className="flex items-center gap-2">
                            <RotateCcw className="h-4 w-4 text-primary" />
                            <h4 className="text-xs font-bold text-foreground">What-If Simulation</h4>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Predict the structural impact of adding extra floors on column load, foundation stress, cost, and overall risk score.
                        </p>
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] text-muted-foreground shrink-0">Add</span>
                            <div className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border p-1">
                                <button
                                    onClick={() => setWhatIfFloors(f => Math.max(1, f - 1))}
                                    className="h-7 w-7 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-bold flex items-center justify-center"
                                >−</button>
                                <span className="text-sm font-black text-foreground w-6 text-center tabular-nums">{whatIfFloors}</span>
                                <button
                                    onClick={() => setWhatIfFloors(f => Math.min(5, f + 1))}
                                    className="h-7 w-7 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-bold flex items-center justify-center"
                                >+</button>
                            </div>
                            <span className="text-[11px] text-muted-foreground shrink-0">floor{whatIfFloors > 1 ? 's' : ''}</span>
                            <button
                                onClick={handleWhatIf}
                                className="btn-primary text-xs ml-auto"
                            >
                                Simulate <ArrowRight className="h-3 w-3 inline ml-1" />
                            </button>
                        </div>

                        {whatIfResult && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                                <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary">Simulation Results</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Column Load', value: `+${whatIfResult.columnLoadIncreasePct}%`, sub: 'increase' },
                                        { label: 'Foundation Stress', value: `${whatIfResult.foundationStressPct}%`, sub: 'of capacity' },
                                        { label: 'Cost Impact', value: `₹${(whatIfResult.costDeltaINR / 100000).toFixed(1)}L`, sub: 'additional' },
                                        { label: 'New Risk Score', value: `${whatIfResult.newRiskScore}`, sub: whatIfResult.newRiskSeverity },
                                    ].map(item => (
                                        <div key={item.label} className="text-center rounded-lg bg-muted/30 border border-border p-2.5">
                                            <p className="text-[8px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                                            <p className={`text-[16px] font-black tabular-nums mt-1 ${item.label === 'New Risk Score'
                                                ? whatIfResult.newRiskSeverity === 'safe' ? 'text-success' : whatIfResult.newRiskSeverity === 'moderate' ? 'text-warning' : 'text-destructive'
                                                : 'text-foreground'}`}>{item.value}</p>
                                            <p className="text-[8px] text-muted-foreground capitalize">{item.sub}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-3">{whatIfResult.summary}</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default PhysicsEngine;
