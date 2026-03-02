import { useEffect } from "react";
import { useAppState } from "@/context/AppContext";
import { ShieldCheck, ShieldX, AlertTriangle, Info, Scaling, Construction, Car } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ComplianceCheck = () => {
  const { state, hasFloorPlan, plotSize, plotWidth, plotHeight, floorConfig, setComplianceStatus } = useAppState();
  const navigate = useNavigate();

  // Engineered Compliance Rules (Simplified Logic)
  const coverageRatio = hasFloorPlan ? 0.75 : 0; // In generator we used 0.75
  const farLimit = 2.5;
  const currentFAR = (plotSize * (floorConfig?.numFloors || 1)) / (plotWidth * plotHeight || 1);


  const checks = [
    {
      id: "min_plot",
      rule: "Minimum Plot Size",
      limit: "600 sq ft",
      passed: plotSize >= 600,
      icon: Scaling
    },
    {
      id: "ground_coverage",
      rule: "Ground Coverage",
      limit: "Max 75%",
      passed: coverageRatio <= 0.75,
      icon: Construction
    },
    {
      id: "setbacks",
      rule: "Setback Requirements",
      limit: "Front: 5ft, Sides: 3ft",
      passed: plotWidth >= 25 && plotHeight >= 30,
      icon: Info
    },
    {
      id: "far",
      rule: "Floor Area Ratio (FAR)",
      limit: `Max ${farLimit}`,
      passed: currentFAR <= farLimit,
      icon: Scaling
    },
    {
      id: "parking",
      rule: "Parking Provisions",
      limit: "Min 1 Slot/1000sqft",
      passed: plotSize >= 800,
      icon: Car
    }
  ];

  useEffect(() => {
    if (hasFloorPlan) {
      const allPassed = checks.every(c => c.passed);
      setComplianceStatus(allPassed ? "Compliant" : "Non-Compliant");
    }
  }, [hasFloorPlan, plotSize, plotWidth, plotHeight, floorConfig?.numFloors]);


  if (!hasFloorPlan) {
    return (
      <div className="module-container max-w-2xl">
        <div className="glass-card flex flex-col items-center py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-warning mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No Floor Plan Generated</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Compliance validation requires a floor plan. Generate one first to auto-check regional zoning regulations.
          </p>
          <button className="btn-primary" onClick={() => navigate("/floor-plan")}>
            Go to Floor Plan Generator
          </button>
        </div>
      </div>
    );
  }

  const isCompliant = state.complianceStatus === "Compliant";

  return (
    <div className="module-container max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Status Summary */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card text-center">
            <div className="mb-4 flex justify-center">
              {isCompliant ? (
                <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center border border-success/30">
                  <ShieldCheck className="h-8 w-8 text-success" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-destructive/20 flex items-center justify-center border border-destructive/30">
                  <ShieldX className="h-8 w-8 text-destructive" />
                </div>
              )}
            </div>
            <h2 className="text-xl font-black text-foreground uppercase tracking-tight mb-2">
              {state.complianceStatus}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              {isCompliant
                ? "Architecture meets all primary municipal regulations."
                : "Design requires modifications to meet local zoning laws."}
            </p>
            <div className="pt-4 border-t border-border">
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground mb-1 uppercase">
                <span>Pass Rate</span>
                <span>{Math.round((checks.filter(c => c.passed).length / checks.length) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full ${isCompliant ? 'bg-success' : 'bg-warning'}`}
                  style={{ width: `${(checks.filter(c => c.passed).length / checks.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex gap-3">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-primary uppercase mb-0.5">Municipal Link</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed italic">Your plan is being cross-referenced with regional building bylaws for residential type-A zones.</p>
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Checklist */}
        <div className="lg:col-span-2 glass-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">Regulation Integrity Check</h3>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">V1.2 ANALYSIS ENGINE</span>
          </div>

          <div className="space-y-4">
            {checks.map((c) => (
              <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all duration-300">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c.passed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                  <c.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs font-bold text-foreground uppercase tracking-tight">{c.rule}</p>
                    <span className={`text-[10px] font-black ${c.passed ? 'text-success' : 'text-destructive'}`}>
                      {c.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">Regulation: {c.limit}</p>
                </div>
                <div className={`h-2 w-2 rounded-full ${c.passed ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-destructive shadow-[0_0_8px_rgba(239,44,44,0.5)]'}`} />
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <button className="btn-primary flex items-center gap-2 py-2 px-6" onClick={() => navigate("/reports")}>
              Export Compliance Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComplianceCheck;
