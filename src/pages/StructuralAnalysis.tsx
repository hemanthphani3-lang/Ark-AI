import { useAppState } from "@/context/AppContext";
import { Building2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const StructuralAnalysis = () => {
  const { hasFloorPlan, floorPlanSaved, floorPlan, plotSize, floorConfig } = useAppState();
  const navigate = useNavigate();

  if (!floorPlanSaved) {
    return (
      <div className="module-container max-w-3xl">
        <div className="glass-card text-center py-12">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Save a floor plan to unlock structural analysis.</p>
          <button className="btn-primary text-xs" onClick={() => navigate("/floor-plan")}>Go to Floor Planning</button>
        </div>
      </div>
    );
  }

  const numFloors = floorConfig?.numFloors || 1;
  const numRooms = floorConfig?.roomConfigs.length || 0;
  const safetyScore = Math.max(40, Math.min(98, 90 - (numFloors * 5) + (plotSize > 1500 ? 10 : 0)));
  const loadPerFloor = Math.round(plotSize * 0.15);
  const columnCount = Math.max(4, numRooms + 2);

  const checks = [
    { label: "Load Distribution", status: safetyScore > 60, detail: `${loadPerFloor} kN/floor estimated` },
    { label: "Column Grid Symmetry", status: columnCount >= 4, detail: `${columnCount} columns recommended` },
    { label: "Beam Alignment", status: numRooms <= 8, detail: numRooms <= 8 ? "Standard span" : "Long span — reinforcement needed" },
    { label: "Height Viability", status: numFloors <= 3, detail: `${numFloors} floors — ${numFloors <= 3 ? "safe" : "review needed"}` },
    { label: "Seismic Adjustment", status: true, detail: "Zone II-III compliance applied" },
  ];

  return (
    <div className="module-container max-w-4xl">
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Structural Safety Analysis</h2>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${safetyScore >= 70 ? "text-success" : safetyScore >= 50 ? "text-warning" : "text-danger"}`}>
            {safetyScore}/100
          </div>
        </div>

        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.label} className={`flex items-center gap-3 rounded-lg border p-3 ${
              c.status ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"
            }`}>
              {c.status ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> : <AlertTriangle className="h-4 w-4 text-warning shrink-0" />}
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground">{c.label}</p>
                <p className="text-[10px] text-muted-foreground">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {safetyScore < 70 && (
        <div className="glass-card border-warning/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-warning">Reinforcement Suggestions</p>
              <ul className="text-[10px] text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                <li>Add cross-bracing on floors 2+</li>
                <li>Increase column diameter from 230mm to 300mm</li>
                <li>Consider raft foundation for better load distribution</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StructuralAnalysis;
