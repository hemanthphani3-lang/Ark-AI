import { useState, useMemo } from "react";
import { MapPin, AlertTriangle, CheckCircle2, Waves, Microscope, Shovel } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAppState } from "@/context/AppContext";

interface LandData {
  plotWidth: number;
  plotLength: number;
  latitude: number;
  longitude: number;
  facing: string;
}

interface RiskResult {
  seismicZone: string;
  floodRisk: number;
  soilBearing: string;
  monsoonExposure: string;
  groundwaterSensitivity: string;
  landRiskScore: number;
  foundationRec: string;
  plinthHeight: string;
  maxFloors: number;
  groundwaterDepth: number; // in meters
  soilMoisture: number; // percentage
  bedrockDepth: number; // in meters
  waterLevelHistory: { month: string; level: number }[];
  address: string;
  borewellDepth: number;
}

function calculateRisk(data: LandData): RiskResult {
  const lat = data.latitude;
  const lng = data.longitude;
  const absLat = Math.abs(lat);

  // Synthetic derivation based on coordinates
  const seismicZone = absLat > 30 ? "Zone IV–V (High)" : absLat > 20 ? "Zone III (Moderate)" : "Zone II (Low)";
  const floodRisk = absLat < 15 ? 72 : absLat < 25 ? 45 : 20;
  const soilBearing = data.plotWidth * data.plotLength > 2000 ? "Medium Clay" : "Hard Laterite";
  const monsoonExposure = lng > 75 && lng < 80 ? "High" : "Moderate";
  const groundwaterSensitivity = absLat < 15 ? "Sensitive" : "Normal";

  // Groundwater analysis (Synthetic but logically varied)
  const baseDepth = 5 + (Math.sin(lat * 0.5) * 2) + (Math.cos(lng * 0.3) * 3);
  const groundwaterDepth = Math.max(1.5, Math.abs(baseDepth));
  const soilMoisture = Math.min(100, Math.max(0, 40 + (Math.sin(lat) * 20)));
  const bedrockDepth = 10 + (Math.cos(lng) * 5);

  // Regulatory Floor Limit Calculation
  // Factors: Plot Size, Seismic Zone, and synthetic "Road Width" (derived from long)
  const plotArea = data.plotWidth * data.plotLength;
  const roadWidth = 20 + (Math.abs(lng) % 40); // Synthetic road width (20-60ft)

  let far = 1.5; // Base Floor Area Ratio
  if (roadWidth > 40) far = 2.5;
  else if (roadWidth > 30) far = 2.0;

  // Max floors = (PlotArea * FAR) / (PlotArea * 0.75 coverage) = FAR / 0.75
  let maxFloorsHeuristic = Math.ceil(far / 0.75);

  // Safety caps
  if (seismicZone.includes("High")) maxFloorsHeuristic = Math.min(maxFloorsHeuristic, 2);
  if (floodRisk > 60) maxFloorsHeuristic = Math.min(maxFloorsHeuristic, 3);

  const maxFloors = Math.max(1, maxFloorsHeuristic);

  const landRiskScore = Math.max(0, Math.min(100, 100 - floodRisk - (seismicZone.includes("High") ? 20 : 5)));
  const foundationRec = seismicZone.includes("High") ? "Raft Foundation with seismic ties" : "Isolated Footing";
  const plinthHeight = floodRisk > 50 ? "750mm (elevated)" : "450mm (standard)";

  // Generate seasonal water level history for the graph
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const waterLevelHistory = months.map((month, i) => {
    // Seasonal variation: lower in summer (Mar-May), higher in monsoon (Jun-Sep)
    const seasonalFactor = Math.sin((i - 5) * (Math.PI / 6)) * 1.5;
    return {
      month,
      level: Number((groundwaterDepth + seasonalFactor).toFixed(1))
    };
  });

  // Synthetic Borewell Depth Calculation: Must be deeper than bedrock and lowest groundwater level
  // Usually involves adding a safety margin (e.g. 50-100m deeper depending on location)
  const lowestWaterLevel = Math.max(...waterLevelHistory.map(w => w.level));
  const borewellDepth = Math.ceil(Math.max(bedrockDepth + 20, lowestWaterLevel + 40) + (Math.abs(lng) % 30));

  // Synthetic Reverse Geocoding Hash
  const countries = ["India", "USA", "Australia", "UK", "Brazil"];
  const states = ["Karnataka", "California", "Victoria", "London", "São Paulo", "Maharashtra", "Texas", "NSW"];
  const cities = ["Bengaluru", "San Francisco", "Melbourne", "Westminster", "Campinas", "Mumbai", "Austin", "Sydney"];
  const streets = ["MG Road", "Market St", "Collins St", "Baker St", "Paulista Ave", "Linking Rd", "6th St", "George St"];

  const hash = Math.floor(absLat * 100 + Math.abs(lng) * 100);
  const country = countries[hash % countries.length];
  const stateVal = states[hash % states.length];
  const city = cities[hash % cities.length];
  const street = streets[hash % streets.length];
  const buildingNum = (hash % 999) + 1;
  const address = `${buildingNum} ${street}, ${city}, ${stateVal}, ${country}`;

  return {
    seismicZone, floodRisk, soilBearing, monsoonExposure, groundwaterSensitivity,
    landRiskScore, foundationRec, plinthHeight, maxFloors,
    groundwaterDepth, soilMoisture, bedrockDepth, waterLevelHistory,
    address, borewellDepth
  };
}

const LandIntelligence = () => {
  const { setLandAnalysis, setProjectMeta } = useAppState();
  const [data, setData] = useState<LandData>({ plotWidth: 40, plotLength: 60, latitude: 12.97, longitude: 77.59, facing: "North" });
  const [result, setResult] = useState<RiskResult | null>(null);

  const analyze = () => {
    const res = calculateRisk(data);
    setResult(res);
    setLandAnalysis({ ...res, ...data });
    // Auto-sync project metadata
    setProjectMeta({
      facing: data.facing as any,
      roadSide: data.facing as any,
      latLong: `${data.latitude}, ${data.longitude}`
    });
  };

  const riskColor = (score: number) => score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-danger";

  return (
    <div className="module-container max-w-5xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="glass-card">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Plot Configuration</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Plot Width (ft)</label>
                <input type="number" className="input-dark" value={data.plotWidth} onChange={e => setData({ ...data, plotWidth: +e.target.value })} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Plot Length (ft)</label>
                <input type="number" className="input-dark" value={data.plotLength} onChange={e => setData({ ...data, plotLength: +e.target.value })} />
              </div>
              <div className="col-span-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-[10px] font-semibold text-primary mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Plot Center Coordinates
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Latitude</label>
                    <input type="number" step="0.0001" className="input-dark bg-background/50" value={data.latitude} onChange={e => setData({ ...data, latitude: +e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Longitude</label>
                    <input type="number" step="0.0001" className="input-dark bg-background/50" value={data.longitude} onChange={e => setData({ ...data, longitude: +e.target.value })} />
                  </div>
                </div>
                {result && (
                  <div className="mt-3 pt-3 border-t border-primary/20">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Estimated Site Address</p>
                    <p className="text-xs font-semibold text-foreground truncate">{result.address}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Facing Direction</label>
              <div className="flex gap-2">
                {["North", "South", "East", "West"].map(d => (
                  <button key={d} onClick={() => setData({ ...data, facing: d })}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${data.facing === d ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:border-primary/30"
                      }`}>{d}</button>
                ))}
              </div>
            </div>

            <button className="btn-primary w-full" onClick={analyze}>Analyze Land & Groundwater</button>
          </div>

          {result && (
            <div className="glass-card animate-fade-in border-t-4 border-primary">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-foreground">Land Risk Score</h3>
                <div className={`text-2xl font-bold tabular-nums ${riskColor(result.landRiskScore)}`}>
                  {result.landRiskScore}/100
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Seismic Zone", value: result.seismicZone },
                  { label: "Flood Risk", value: `${result.floodRisk}%` },
                  { label: "Soil Bearing", value: result.soilBearing },
                  { label: "Max Floors", value: `${result.maxFloors}` },
                ].map(item => (
                  <div key={item.label} className="rounded-lg border border-border bg-muted/50 p-2.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</p>
                    <p className="text-xs font-semibold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {result ? (
            <>
              <div className="glass-card animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <Waves className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-foreground">Groundwater Analysis</h3>
                </div>

                <div className="h-[200px] w-full mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.waterLevelHistory}>
                      <defs>
                        <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis fontSize={10} axisLine={false} tickLine={false} unit="m" mirror />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", fontSize: "10px" }}
                        itemStyle={{ color: "#3b82f6" }}
                      />
                      <Area type="monotone" dataKey="level" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLevel)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <p className="text-[9px] text-muted-foreground mb-1 uppercase">Avg Depth</p>
                    <p className="text-sm font-bold text-blue-400">{result.groundwaterDepth.toFixed(1)}m</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <p className="text-[9px] text-muted-foreground mb-1 uppercase">Soil Moisture</p>
                    <p className="text-sm font-bold text-blue-400">{result.soilMoisture.toFixed(0)}%</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                    <p className="text-[9px] text-indigo-400/80 mb-1 uppercase font-bold">Dig Depth</p>
                    <p className="text-sm font-bold text-indigo-400">{result.borewellDepth.toFixed(1)}m</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <p className="text-[9px] text-muted-foreground mb-1 uppercase">History</p>
                    <p className="text-sm font-bold text-blue-400">Stable</p>
                  </div>
                </div>
              </div>

              <div className="glass-card animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <Shovel className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-bold text-foreground">Construction Parameters</h3>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Microscope className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Bedrock Depth</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{result.bedrockDepth.toFixed(1)}m</span>
                  </div>

                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <p className="text-[10px] font-bold text-foreground uppercase tracking-wider">Foundation Recommendation</p>
                    </div>
                    <p className="text-xs text-foreground font-medium mb-1">{result.foundationRec}</p>
                    <p className="text-[10px] text-muted-foreground">Necessary plinth height: {result.plinthHeight}</p>
                  </div>

                  {result.landRiskScore < 50 && (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                      <p className="text-[10px] text-warning">High-risk zone detected. Additional engineering review of geotechnical reports is recommended.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="glass-card h-full flex flex-col items-center justify-center text-center p-12 opacity-50">
              <Microscope className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-bold text-foreground mb-1">Analysis Pending</h3>
              <p className="text-xs text-muted-foreground">Configure your plot and coordinates to see detailed groundwater and environmental analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LandIntelligence;
