import { useState, useRef, useEffect } from "react";
import { useAppState, RoomData, FloorConfig, CostBreakdown, BIMLayer, BIMModel, BIMMetadata } from "@/context/AppContext";
import { Save, RotateCcw, Compass, ChevronRight, ChevronLeft, Shield, Activity, GraduationCap, Coins, Info, Layers, Layout, Plus, Trash2, Check, X, DoorOpen, Box, Ruler, Pipette, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { calculateQTO, detectClashes, QTOReport, ClashWarning } from "@/utils/bimEngine";
import { runVastuAnalysis, getZoneRects, VastuFacing, VastuZone } from "@/utils/vastuEngine";

const ROOM_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)",
  "hsl(199, 89%, 48%)", "hsl(280, 60%, 55%)", "hsl(340, 75%, 55%)",
  "hsl(160, 60%, 45%)", "hsl(45, 90%, 50%)", "hsl(210, 50%, 50%)",
  "hsl(100, 50%, 45%)", "hsl(15, 80%, 55%)", "hsl(260, 50%, 60%)",
];

const DEFAULT_ROOM_NAMES = [
  "Living Room", "Master Bedroom", "Kitchen", "Bathroom",
  "Bedroom 2", "Dining Room", "Study Room", "Store Room",
  "Guest Room", "Pooja Room", "Balcony", "Utility",
];

// Per-floor room config type
type FloorRoomConfig = { name: string; sizeSqFt: number; bathType?: 'attached' | 'common' | 'none' }[];

/**
 * Build a polygon for an L-shaped bedroom (rectangle minus top-right corner for attached bath).
 * bathW and bathH are in floor-plan coordinate units.
 */
function lShapePolygon(rx: number, ry: number, rw: number, rh: number, bathW: number, bathH: number) {
  // L-shape: full rect minus top-right corner
  return [
    { x: rx, y: ry },
    { x: rx + rw - bathW, y: ry },           // notch start (top)
    { x: rx + rw - bathW, y: ry + bathH },   // notch end (inner corner)
    { x: rx + rw, y: ry + bathH },   // rejoin right side
    { x: rx + rw, y: ry + rh },      // bottom-right
    { x: rx, y: ry + rh },      // bottom-left
  ];
}

/** Small random variance (±val) for organic-feel polygon rooms */
function jitter(val: number, seed: number) {
  const s = Math.sin(seed * 127.1) * 0.5 + 0.5;
  return (s - 0.5) * val * 2;
}

/** Slightly irregular rectangle polygon — only jitters corners that are NOT on a shared boundary.
 * lockedEdges: { left, top, right, bottom } = true means that edge is shared with another room and must not be jittered.
 */
function organicRect(
  rx: number, ry: number, rw: number, rh: number, id: number,
  lockedEdges: { left?: boolean; top?: boolean; right?: boolean; bottom?: boolean } = {}
): { x: number; y: number }[] {
  const j = (n: number) => jitter(0.3, id + n);

  // A corner is made of two edges. If either touching edge is locked, that axis is NOT jittered for that corner.
  // Corners: TL=[left,top], TR=[right,top], BR=[right,bottom], BL=[left,bottom]
  return [
    { // Top-Left
      x: rx + (lockedEdges.left ? 0 : j(1)),
      y: ry + (lockedEdges.top ? 0 : j(2)),
    },
    { // Top-Right
      x: rx + rw + (lockedEdges.right ? 0 : j(3)),
      y: ry + (lockedEdges.top ? 0 : j(4)),
    },
    { // Bottom-Right
      x: rx + rw + (lockedEdges.right ? 0 : j(5)),
      y: ry + rh + (lockedEdges.bottom ? 0 : j(6)),
    },
    { // Bottom-Left
      x: rx + (lockedEdges.left ? 0 : j(7)),
      y: ry + rh + (lockedEdges.bottom ? 0 : j(8)),
    },
  ];
}

function generateLayout(
  totalArea: number,
  numFloors: number,
  perFloorConfigs: FloorRoomConfig[],
): { rooms: RoomData[]; plotW: number; plotH: number; totalSqFt: number } {
  const floorSqFt = totalArea / numFloors;
  const ratio = 1.4;
  const plotW = Math.sqrt(floorSqFt * ratio);
  const plotH = floorSqFt / plotW;

  const rooms: RoomData[] = [];

  // STAIRCASE & ENTRANCE CORRIDOR (Space before entrance horizontally)
  // We allocate a fixed corridor of 6 physical feet at the bottom/front.
  const corridorDepth = 6;
  const STAIR_W = numFloors > 1 ? plotW / 3 : 0; // Staircase gets 1/3 of that horizontal space
  const STAIR_H = numFloors > 1 ? corridorDepth : 0;

  const usablePlotH = plotH - corridorDepth;

  for (let floor = 0; floor < numFloors; floor++) {
    if (numFloors > 1) {
      rooms.push({
        id: floor * 1000 + 999,
        name: "Staircase",
        x: plotW - STAIR_W,         // Right side of corridor
        y: usablePlotH,             // Bottom section
        width: STAIR_W,
        height: STAIR_H,
        color: "hsl(215, 20%, 35%)",
        area: STAIR_W * STAIR_H,
        floor,
        zone: 'core',
        polygon: organicRect(plotW - STAIR_W, usablePlotH, STAIR_W, STAIR_H, floor * 1000 + 999, { left: true, top: true }),
      });
    }

    // The remaining 2/3 of the horizontal space is open Entrance/Corridor
    rooms.push({
      id: floor * 1000 + 998,
      name: floor === 0 ? "Entrance Foyer" : "Corridor",
      x: 0,
      y: usablePlotH,
      width: plotW - STAIR_W,
      height: corridorDepth,
      color: "hsl(215, 15%, 50%)",
      area: (plotW - STAIR_W) * corridorDepth,
      floor,
      zone: 'public',
      polygon: organicRect(0, usablePlotH, plotW - STAIR_W, corridorDepth, floor * 1000 + 998, { top: true, right: true }),
    });

    const floorConfigs = perFloorConfigs[floor] || [];
    if (floorConfigs.length === 0) continue;

    // Sort: living first, then bathrooms/kitchen, then bedrooms/others
    const livingIdx = floorConfigs.findIndex(r => r.name.toLowerCase().includes("living"));
    const sorted = [...floorConfigs];
    if (livingIdx > 0) {
      const [lr] = sorted.splice(livingIdx, 1);
      sorted.unshift(lr);
    }
    const wet = sorted.filter((_, i) => i > 0 && (sorted[i].name.toLowerCase().includes("bath") || sorted[i].name.toLowerCase().includes("kitchen")));
    const dry = sorted.filter((_, i) => i > 0 && !sorted[i].name.toLowerCase().includes("bath") && !sorted[i].name.toLowerCase().includes("kitchen"));
    const finalSorted = [sorted[0], ...dry, ...wet]; // dry (bedrooms) before wet so baths can attach

    const numRooms = finalSorted.length;
    const lrWidth = plotW * 0.4;
    const otherWidth = plotW - lrWidth;
    const otherCount = numRooms - 1;
    const otherHeight = otherCount > 0 ? usablePlotH / otherCount : usablePlotH;

    // Identify attached-bath indices and which bedroom they attach to
    // Strategy: for each bathroom with bathType==='attached', find the preceding bedroom
    const attachedPairs: { bedI: number; bathI: number }[] = [];
    for (let i = 1; i < numRooms; i++) {
      const cfg = finalSorted[i];
      if (!cfg) continue;
      if (cfg.bathType === 'attached') {
        // Find preceding bedroom (closest dry room before this index)
        for (let j = i - 1; j >= 1; j--) {
          const prev = finalSorted[j];
          if (prev && !prev.name.toLowerCase().includes('bath') && !prev.name.toLowerCase().includes('kitchen')) {
            attachedPairs.push({ bedI: j, bathI: i });
            break;
          }
        }
      }
    }
    const attachedBathIndices = new Set(attachedPairs.map(p => p.bathI));

    // Living Room
    rooms.push({
      id: floor * 1000,
      name: finalSorted[0]?.name || "Living Room",
      x: 0,
      y: 0,
      width: lrWidth,
      height: usablePlotH,
      color: ROOM_COLORS[0],
      area: finalSorted[0]?.sizeSqFt || 200,
      floor,
      zone: 'public',
      // Living Room: left & top & bottom edges are exterior, RIGHT edge is shared with bedroom column
      polygon: organicRect(0, 0, lrWidth, usablePlotH, floor * 1000, { right: true, bottom: true }),
    });

    // Attached bath size: 30% of bedroom width × 35% of bedroom height
    const BATH_W_RATIO = 0.35;
    const BATH_H_RATIO = 0.40;

    // Other rooms placed on right side
    for (let i = 1; i < numRooms; i++) {
      const cfg = finalSorted[i];
      if (!cfg) continue;
      if (attachedBathIndices.has(i)) continue; // skip — will be rendered with its bedroom

      const name = cfg.name.toLowerCase();
      let zone: 'public' | 'private' | 'service' | 'core' = 'private';
      if (name.includes('bath') || name.includes('toilet') || name.includes('utility')) zone = 'service';
      else if (name.includes('dining') || name.includes('kitchen')) zone = 'public';

      const rx = lrWidth;
      const ry = (i - 1) * otherHeight;
      const rw = otherWidth;
      const rh = otherHeight;
      const roomId = floor * 1000 + i;

      // Check if this bedroom has an attached bath
      const pair = attachedPairs.find(p => p.bedI === i);
      if (pair) {
        const bathCfg = finalSorted[pair.bathI];
        const bathW = rw * BATH_W_RATIO;
        const bathH = rh * BATH_H_RATIO;
        const bathId = floor * 1000 + pair.bathI;

        // Bedroom as L-shape (rect minus top-right corner where bath sits)
        rooms.push({
          id: roomId,
          name: cfg.name,
          x: rx, y: ry, width: rw, height: rh,
          color: ROOM_COLORS[i % ROOM_COLORS.length],
          area: cfg.sizeSqFt,
          floor, zone: 'private',
          attachedBathId: bathId,
          polygon: lShapePolygon(rx, ry, rw, rh, bathW, bathH),
        });

        // Attached bathroom: small box in the top-right corner of the bedroom
        rooms.push({
          id: bathId,
          name: bathCfg?.name || "Attached Bath",
          x: rx + rw - bathW,
          y: ry,
          width: bathW,
          height: bathH,
          color: "hsl(210, 55%, 52%)",
          area: bathCfg?.sizeSqFt || bathW * bathH,
          floor, zone: 'service',
          isWetArea: true,
          attachedTo: roomId,
          // Bathroom: left edge shared with bedroom, top and right edges shared with grid
          polygon: organicRect(rx + rw - bathW, ry, bathW, bathH, bathId, { left: true, top: true, right: true }),
        });
      } else {
        // Standard room with slight organic shape
        rooms.push({
          id: roomId,
          name: cfg.name,
          x: rx, y: ry, width: rw, height: rh,
          color: name.includes('bath') ? "hsl(210, 50%, 50%)"
            : name.includes('kitchen') ? "hsl(38, 92%, 50%)"
              : ROOM_COLORS[i % ROOM_COLORS.length],
          area: cfg.sizeSqFt,
          floor, zone,
          isWetArea: zone === 'service' || name.includes('kitchen'),
          // Standard room: left edge shared with living room, top shared with room above (or top of building), bottom shared with room below
          polygon: organicRect(rx, ry, rw, rh, roomId, { left: true, top: (i === 1), bottom: true }),
        });
      }
    }
  }

  return { rooms, plotW, plotH, totalSqFt: totalArea };
}

type WizardStep = "area" | "rooms" | "blueprint";

const FloorPlanGenerator = () => {
  const {
    state, setProjectMeta, setScores, setCostBreakdown, setTotalRooms,
    setEstimatedCost, setFloorPlan, saveFloorPlan, floorPlanSaved,
    resetFloorPlan, setFloorConfig, landAnalysis, setBIMMode, setBIMLayerVisibility,
    saveProject
  } = useAppState();
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState("");
  const [step, setStep] = useState<WizardStep>("area");
  const [plotL, setPlotL] = useState(40);
  const [plotW, setPlotWidthLocal] = useState(30);
  const [numFloors, setNumFloors] = useState(1);
  const [stairType, setStairType] = useState<'straight' | 'l-shape' | 'u-shape' | 'dog-leg'>('dog-leg');
  // Per-floor active tab in rooms step
  const [activeConfigFloor, setActiveConfigFloor] = useState(0);

  // Per-floor room configs: array of floors, each with array of rooms
  const [perFloorConfigs, setPerFloorConfigs] = useState<FloorRoomConfig[]>([]);
  const [layout, setLayout] = useState<{ rooms: RoomData[]; plotW: number; plotH: number } | null>(null);
  const [activeFloor, setActiveFloor] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [showVastuCompass, setShowVastuCompass] = useState(true);
  // Add-room inline prompt state
  const [addingRoom, setAddingRoom] = useState<number | null>(null); // floorIdx or null
  const [newRoomName, setNewRoomName] = useState("");

  // Door Link Tool state
  const [isDoorToolActive, setIsDoorToolActive] = useState(false);
  const [selectedDoorRoom, setSelectedDoorRoom] = useState<number | null>(null);

  // Draggable joints state for the SVG canvas
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingPoint, setDraggingPoint] = useState<{ roomId: number; pointIdx: number } | null>(null);
  const [draggingSegment, setDraggingSegment] = useState<{ roomId: number; segmentIdx: number; startX: number; startY: number; initialPoly: { x: number, y: number }[] } | null>(null);

  // BIM Sync & Intelligence
  const [bimReport, setBimReport] = useState<QTOReport | null>(null);
  const [clashes, setClashes] = useState<ClashWarning[]>([]);

  useEffect(() => {
    if (layout?.rooms) {
      const report = calculateQTO(layout.rooms, state.bimModel);
      const warnings = detectClashes(layout.rooms);
      setBimReport(report);
      setClashes(warnings);

      if (report) {
        setCostBreakdown({
          brickwork: Math.round(report.brickVolume * 5500),
          structural: Math.round(report.concreteVolume * 12000),
          flooring: Math.round(report.tileArea * 1200),
          painting: Math.round(report.paintArea * 450),
        });
        setEstimatedCost(Math.round(report.brickVolume * 5500 + report.concreteVolume * 12000 + report.tileArea * 1200 + report.paintArea * 450 + 500000));
      }
    }
  }, [layout, state.bimModel, setCostBreakdown, setEstimatedCost]);

  // Auto-fill from Land Intelligence
  useEffect(() => {
    if (landAnalysis && step === "area") {
      setPlotL(landAnalysis.plotLength || 40);
      setPlotWidthLocal(landAnalysis.plotWidth || 30);
      setNumFloors(Math.min(numFloors, landAnalysis.maxFloors || 3));
    }
  }, [landAnalysis]);

  // Constrain number of floors when landAnalysis changes
  useEffect(() => {
    if (landAnalysis && numFloors > landAnalysis.maxFloors) {
      setNumFloors(landAnalysis.maxFloors);
    }
  }, [numFloors, landAnalysis]);

  const totalArea = plotL * plotW * 0.75;

  const proceedToRooms = () => {
    if (plotL * plotW < 200) return;
    const floorArea = Math.floor(totalArea / numFloors);
    const defaultCount = 4;
    const perRoom = Math.floor(floorArea / defaultCount);

    // Build default configs for each floor
    const configs: FloorRoomConfig[] = Array.from({ length: numFloors }, (_, fi) => {
      const names = fi === 0
        ? DEFAULT_ROOM_NAMES.slice(0, defaultCount)
        : ["Bedroom", "Bathroom", "Study Room", "Balcony"].slice(0, defaultCount);
      return names.map((name, i) => ({
        name,
        sizeSqFt: i === defaultCount - 1 ? floorArea - perRoom * (defaultCount - 1) : perRoom,
      }));
    });
    setPerFloorConfigs(configs);
    setActiveConfigFloor(0);
    setStep("rooms");
  };

  // Per-floor room CRUD
  const startAddRoom = (floorIdx: number) => {
    setAddingRoom(floorIdx);
    setNewRoomName("");
  };

  // Helper to keep total floor area constant by redistributing changes
  const rebalanceRooms = (rooms: FloorRoomConfig, targetTotal: number, changedIdx: number): FloorRoomConfig => {
    const minSizes = rooms.map(r => r.name.toLowerCase().includes('bath') ? 20 : 40);
    let nextFloor = rooms.map(r => ({ ...r }));

    let currentTotal = nextFloor.reduce((s, r) => s + r.sizeSqFt, 0);
    let diff = targetTotal - currentTotal;

    let iterations = 0;
    while (Math.abs(diff) > 0.1 && iterations < 10) {
      const flexibleRooms = nextFloor.filter((r, ri) => {
        if (ri === changedIdx) return false;
        if (diff > 0) return true;
        return r.sizeSqFt > minSizes[ri];
      });

      if (flexibleRooms.length === 0) break;

      const perRoomDiff = diff / flexibleRooms.length;
      flexibleRooms.forEach(r => {
        const idx = nextFloor.findIndex(nf => nf === r);
        const oldSize = r.sizeSqFt;
        const newSize = Math.max(minSizes[idx], oldSize + perRoomDiff);
        nextFloor[idx].sizeSqFt = newSize;
      });

      currentTotal = nextFloor.reduce((s, r) => s + r.sizeSqFt, 0);
      diff = targetTotal - currentTotal;
      iterations++;
    }

    const roundedFloor = nextFloor.map(r => ({ ...r, sizeSqFt: Math.round(r.sizeSqFt) }));
    const roundedTotal = roundedFloor.reduce((s, r) => s + r.sizeSqFt, 0);
    if (roundedTotal !== targetTotal) {
      const adjustIdx = roundedFloor.findIndex((r, ri) => ri !== changedIdx) !== -1
        ? roundedFloor.findIndex((r, ri) => ri !== changedIdx)
        : changedIdx;
      if (adjustIdx !== -1) roundedFloor[adjustIdx].sizeSqFt += (targetTotal - roundedTotal);
    }
    return roundedFloor;
  };

  const confirmAddRoom = (floorIdx: number) => {
    const name = newRoomName.trim() || `Room ${(perFloorConfigs[floorIdx]?.length || 0) + 1}`;
    setPerFloorConfigs(prev => prev.map((f, fi) => {
      if (fi !== floorIdx) return f;
      const targetTotal = Math.floor(totalArea / numFloors);
      const newRoom = { name, sizeSqFt: 40 }; // Start small and let rebalance fill it
      return rebalanceRooms([...f, newRoom], targetTotal, f.length);
    }));
    setAddingRoom(null);
    setNewRoomName("");
  };

  const cancelAddRoom = () => {
    setAddingRoom(null);
    setNewRoomName("");
  };

  const removeRoom = (floorIdx: number, roomIdx: number) => {
    setPerFloorConfigs(prev => prev.map((f, fi) => {
      if (fi !== floorIdx) return f;
      const targetTotal = Math.floor(totalArea / numFloors);
      const remaining = f.filter((_, ri) => ri !== roomIdx);
      return rebalanceRooms(remaining, targetTotal, -1); // -1 means all remaining rooms are flexible
    }));
  };

  const updateRoomName = (floorIdx: number, roomIdx: number, name: string) => {
    setPerFloorConfigs(prev => prev.map((f, fi) => fi !== floorIdx ? f :
      f.map((r, ri) => ri !== roomIdx ? r : { ...r, name })
    ));
  };

  const updateBathType = (floorIdx: number, roomIdx: number, bathType: 'attached' | 'common' | 'none') => {
    setPerFloorConfigs(prev => prev.map((f, fi) => fi !== floorIdx ? f :
      f.map((r, ri) => ri !== roomIdx ? r : { ...r, bathType })
    ));
  };

  const updateRoomSize = (floorIdx: number, roomIdx: number, newSize: number) => {
    setPerFloorConfigs(prev => prev.map((f, fi) => {
      if (fi !== floorIdx) return f;
      const targetTotal = Math.floor(totalArea / numFloors);
      const minSize = f[roomIdx].name.toLowerCase().includes('bath') ? 20 : 40;
      const maxSize = targetTotal - (f.length - 1) * 20; // Absolute max if others are at min
      const clampedSize = Math.max(minSize, Math.min(newSize, maxSize));
      const nextFloor = f.map((r, ri) => ri === roomIdx ? { ...r, sizeSqFt: clampedSize } : r);
      return rebalanceRooms(nextFloor, targetTotal, roomIdx);
    }));
  };

  const calculateMetrics = (rooms: RoomData[]) => {
    const totalSqFt = rooms.reduce((s, r) => s + r.area, 0);
    const wetRooms = rooms.filter(r => r.isWetArea);

    const breakdown: CostBreakdown = {
      foundation: totalSqFt * 600,
      structural: totalSqFt * 850,
      brickwork: totalSqFt * 320,
      electrical: totalSqFt * 160,
      plumbing: wetRooms.length * 48000,
      flooring: totalSqFt * 280,
      painting: totalSqFt * 110,
      finishing: totalSqFt * 550,
      miscellaneous: 180000,
    };

    const totalValue = Object.values(breakdown).reduce((a, b) => (a as number) + (b as number), 0) as number;
    setCostBreakdown(breakdown);
    setEstimatedCost(totalValue);

    setScores({
      structural: Math.min(95, 85 + (rooms.length < 8 ? 10 : 0)),
      circulation: Math.max(60, 90 - (rooms.filter(r => r.zone === 'private').length * 2)),
      vastu: state.projectMeta.vastuMode === 'Strict' ? 98 : 88,
      cost: totalValue < state.projectMeta.budgetRange[1] ? 92 : 68,
    });
  };

  const generateBlueprint = () => {
    // Flatten all room configs for FloorConfig
    const allRoomConfigs = perFloorConfigs.flat();
    const config: FloorConfig = { numFloors, roomConfigs: allRoomConfigs, staircaseType: stairType };
    const result = generateLayout(totalArea, numFloors, perFloorConfigs);
    setLayout(result);
    setTotalRooms(result.rooms.length);
    setFloorPlan(result.rooms, result.plotW, result.plotH, result.totalSqFt);
    setFloorConfig(config);
    calculateMetrics(result.rooms);
    setStep("blueprint");
  };

  const handlePointerDown = (roomId: number, pointIdx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingPoint({ roomId, pointIdx });
  };

  const handleSegmentPointerDown = (roomId: number, segmentIdx: number, e: React.PointerEvent, poly: { x: number, y: number }[]) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    setDraggingSegment({
      roomId,
      segmentIdx,
      startX: svgP.x / scale,
      startY: svgP.y / scale,
      initialPoly: [...poly]
    });
  };

  const handleSegmentDoubleClick = (roomId: number, segmentIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;

    // Transform click to SVG space
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const newPoint = { x: svgP.x / scale, y: svgP.y / scale };

    setLayout(prev => {
      if (!prev) return prev;
      const newRooms = prev.rooms.map(r => {
        if (r.id !== roomId || !r.polygon) return r;
        const newPoly = [...r.polygon];
        // Insert new point after segmentIdx
        newPoly.splice(segmentIdx + 1, 0, newPoint);
        return { ...r, polygon: newPoly };
      });
      return { ...prev, rooms: newRooms };
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current || !layout) return;
    if (!draggingPoint && !draggingSegment) return;

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const newX = Math.max(0, Math.min(svgP.x / scale, layout.plotW));
    const newY = Math.max(0, Math.min(svgP.y / scale, layout.plotH));

    if (draggingPoint) {
      setLayout(prev => {
        if (!prev) return prev;
        const newRooms = prev.rooms.map(r => {
          if (r.id !== draggingPoint.roomId || !r.polygon) return r;
          const newPoly = [...r.polygon];
          newPoly[draggingPoint.pointIdx] = { x: newX, y: newY };

          let area = 0;
          for (let i = 0; i < newPoly.length; i++) {
            let j = (i + 1) % newPoly.length;
            area += newPoly[i].x * newPoly[j].y;
            area -= newPoly[j].x * newPoly[i].y;
          }
          area = Math.abs(area / 2);
          return { ...r, polygon: newPoly, area };
        });
        return { ...prev, rooms: newRooms };
      });
    } else if (draggingSegment) {
      const targetX = svgP.x / scale;
      const targetY = svgP.y / scale;

      let dx = targetX - draggingSegment.startX;
      let dy = targetY - draggingSegment.startY;

      setLayout(prev => {
        if (!prev) return prev;
        const newRooms = prev.rooms.map(r => {
          if (r.id !== draggingSegment.roomId || !r.polygon) return r;
          const newPoly = [...draggingSegment.initialPoly];
          const p1 = draggingSegment.segmentIdx;
          const p2 = (draggingSegment.segmentIdx + 1) % newPoly.length;

          // Clamping logic for entire segment
          const pt1 = newPoly[p1];
          const pt2 = newPoly[p2];

          // Predicted positions
          let nx1 = pt1.x + dx;
          let ny1 = pt1.y + dy;
          let nx2 = pt2.x + dx;
          let ny2 = pt2.y + dy;

          // Clamp dx/dy so both points stay within [0, plotW] and [0, plotH]
          if (nx1 < 0) dx -= nx1;
          if (nx1 > prev.plotW) dx -= (nx1 - prev.plotW);
          if (nx2 < 0) dx -= nx2;
          if (nx2 > prev.plotW) dx -= (nx2 - prev.plotW);

          if (ny1 < 0) dy -= ny1;
          if (ny1 > prev.plotH) dy -= (ny1 - prev.plotH);
          if (ny2 < 0) dy -= ny2;
          if (ny2 > prev.plotH) dy -= (ny2 - prev.plotH);

          newPoly[p1] = { x: pt1.x + dx, y: pt1.y + dy };
          newPoly[p2] = { x: pt2.x + dx, y: pt2.y + dy };

          let area = 0;
          for (let i = 0; i < newPoly.length; i++) {
            let j = (i + 1) % newPoly.length;
            area += newPoly[i].x * newPoly[j].y;
            area -= newPoly[j].x * newPoly[i].y;
          }
          area = Math.abs(area / 2);
          return { ...r, polygon: newPoly, area };
        });
        return { ...prev, rooms: newRooms };
      });
    }
  };

  const handlePointerUp = () => {
    setDraggingPoint(null);
    setDraggingSegment(null);
  };

  const handleSave = () => {
    if (layout) {
      setFloorPlan(layout.rooms, layout.plotW, layout.plotH, totalArea);
      calculateMetrics(layout.rooms);
    }
    saveProject(projectName);
    saveFloorPlan();
  };

  const handleReset = () => {
    resetFloorPlan();
    setLayout(null);
    setStep("area");
    setPlotL(40);
    setPlotWidthLocal(30);
    setNumFloors(1);
    setPerFloorConfigs([]);
    setActiveFloor(0);
    setActiveConfigFloor(0);
    setCostBreakdown({});
    setEstimatedCost(0);
  };

  const CANVAS_W = 600;
  const scale = layout ? CANVAS_W / layout.plotW : 1;
  const CANVAS_H = layout ? layout.plotH * scale : 400;
  const floorRooms = layout ? layout.rooms.filter((r) => r.floor === activeFloor) : [];

  const currentFloorConfig = perFloorConfigs[activeConfigFloor] || [];
  const floorArea = Math.floor(totalArea / numFloors);

  return (
    <div className="module-container max-w-7xl">
      {/* Wizard Progress */}
      <div className="flex items-center gap-2 mb-4">
        {(["area", "rooms", "blueprint"] as WizardStep[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className={`h-px w-8 ${["rooms", "blueprint"].indexOf(step) >= i ? "bg-primary" : "bg-border"}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold tracking-tight uppercase transition-all ${step === s ? "bg-primary/15 text-primary border border-primary/30" : ["area", "rooms", "blueprint"].indexOf(step) > i ? "bg-success/15 text-success border border-success/30" : "bg-muted text-muted-foreground border border-border"}`}>
              {s === "area" ? "Initialization" : s === "rooms" ? "Room Configuration" : "Intelligence Output"}
            </div>
          </div>
        ))}
      </div>

      {/* BIM Intelligence & Clash HUD */}
      {clashes.length > 0 && state.bimMode && (
        <div className="absolute top-24 right-10 z-50 pointer-events-none">
          <div className="flex flex-col gap-2">
            {clashes.map(c => (
              <div key={c.id} className="bg-red-500/10 border border-red-500/30 backdrop-blur-md px-4 py-3 rounded-xl flex items-center gap-3 animate-in slide-in-from-right fade-in pointer-events-auto shadow-2xl">
                <Shield className="w-5 h-5 text-red-500" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-tighter">BIM CLASH DETECTED</span>
                  <span className="text-xs text-white/90">{c.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
      }

      {/* STEP 1: Area & Project Metadata */}
      {
        step === "area" && (
          <div className="glass-card animate-fade-in relative overflow-hidden">
            {!landAnalysis && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center p-8 text-center">
                <Shield className="h-12 w-12 text-primary mb-4 animate-pulse" />
                <h3 className="text-lg font-bold text-foreground mb-2">Land Analysis Required</h3>
                <p className="text-xs text-muted-foreground max-w-xs mb-6">
                  Floor planning is dependent on environmental and structural analysis. Please complete the Land Intelligence analysis first to set your plot boundaries and floor limits.
                </p>
                <button
                  onClick={() => navigate("/land-intelligence")}
                  className="btn-primary flex items-center gap-2"
                >
                  Go to Land Intelligence <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] text-primary">1</span>
                Project Initialization Panel
              </h2>
              {landAnalysis && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-success/10 border border-success/20 animate-pulse">
                  <Check className="h-3 w-3 text-success" />
                  <span className="text-[9px] font-bold text-success uppercase">Synced with Land Intelligence</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">
                    Plot Dimensions (L × W ft)
                  </label>
                  <div className="flex gap-2">
                    <input type="number" className={`input-dark flex-1 ${landAnalysis ? 'opacity-70 pointer-events-none' : ''}`} value={plotL} onChange={e => setPlotL(+e.target.value)} placeholder="Length" />
                    <span className="flex items-center text-muted-foreground">×</span>
                    <input type="number" className={`input-dark flex-1 ${landAnalysis ? 'opacity-70 pointer-events-none' : ''}`} value={plotW} onChange={e => setPlotWidthLocal(+e.target.value)} placeholder="Width" />
                  </div>
                  {landAnalysis && <p className="text-[9px] text-success mt-1">Locked to analyzed plot coordinates.</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">Road Side</label>
                    <select className="input-dark w-full text-xs" value={state.projectMeta.roadSide} onChange={(e) => setProjectMeta({ roadSide: e.target.value as any })}>
                      {['North', 'South', 'East', 'West'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">Facing</label>
                    <select className="input-dark w-full text-xs" value={state.projectMeta.facing} onChange={(e) => setProjectMeta({ facing: e.target.value as any })}>
                      {['North', 'South', 'East', 'West'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">Vastu Mode</label>
                  <div className="flex gap-2">
                    {(['Strict', 'Hybrid', 'Off'] as const).map((mode) => (
                      <button key={mode} onClick={() => setProjectMeta({ vastuMode: mode })} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all border ${state.projectMeta.vastuMode === mode ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>{mode}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">
                    Built-up Area: <span className="text-foreground">{Math.round(totalArea)} sq ft (75% coverage)</span>
                  </label>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: '75%' }} />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">
                    Number of Floors
                    {landAnalysis && <span className="ml-2 text-primary">(Limit: G+{landAnalysis.maxFloors - 1} based on area regulations)</span>}
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].filter(n => !landAnalysis || n <= (landAnalysis.maxFloors || 5)).map(n => (
                      <button key={n} onClick={() => setNumFloors(n)} className={`flex-1 py-2 rounded-md text-[10px] font-bold transition-all border ${numFloors === n ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                        {n === 1 ? 'G' : `G+${n - 1}`}
                      </button>
                    ))}
                  </div>
                </div>

                {numFloors > 1 && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block">Staircase Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['straight', 'l-shape', 'u-shape', 'dog-leg'] as const).map((type) => (
                        <button key={type} onClick={() => setStairType(type)} className={`py-1.5 rounded-md text-[10px] font-bold transition-all border ${stairType === type ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                          {type.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1 italic">Staircase occupies a compact 4ft structural strip — non-negotiable for G+1+.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-primary text-xs font-bold">FE</span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-primary uppercase mb-1">Structural Feasibility Check</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Per-floor room configuration — each floor can have any number and type of rooms independently.
                </p>
              </div>
              <button className="btn-primary ml-auto flex items-center gap-2 py-2 px-6" onClick={proceedToRooms} disabled={plotL * plotW < 200}>
                Configure Rooms <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      }

      {/* STEP 2: Per-Floor Room Configuration */}
      {
        step === "rooms" && (
          <div className="glass-card animate-fade-in">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] text-primary">2</span>
              Room Configuration — Per Floor
              <span className="ml-auto text-[10px] text-muted-foreground font-normal">Each floor is configured independently</span>
            </h2>

            {/* Floor Tabs */}
            {numFloors > 1 && (
              <div className="flex gap-1 mb-4 border-b border-border pb-1">
                {Array.from({ length: numFloors }).map((_, fi) => (
                  <button
                    key={fi}
                    onClick={() => setActiveConfigFloor(fi)}
                    className={`px-4 py-1.5 rounded-t-md text-[10px] font-bold transition-all border-b-2 ${activeConfigFloor === fi ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                  >
                    {fi === 0 ? '🏠 Ground Floor' : `🏢 Floor ${fi} (F${fi})`}
                    <span className="ml-1.5 text-[9px] opacity-70">({perFloorConfigs[fi]?.length || 0} rooms)</span>
                  </button>
                ))}
              </div>
            )}

            {/* Current Floor Config */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 mb-4">
              {currentFloorConfig.map((room, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: ROOM_COLORS[idx % ROOM_COLORS.length] }} />
                    <input
                      className="input-dark flex-1 py-1.5 text-sm"
                      value={room.name}
                      onChange={(e) => updateRoomName(activeConfigFloor, idx, e.target.value)}
                    />
                    <div className="flex items-center gap-1.5 ml-2">
                      <input
                        type="number"
                        className="input-dark w-[60px] py-1 px-1.5 text-xs text-right font-bold text-primary bg-primary/10 border-primary/20"
                        value={room.sizeSqFt}
                        onChange={(e) => updateRoomSize(activeConfigFloor, idx, parseInt(e.target.value) || 0)}
                      />
                      <span className="text-[10px] font-bold text-muted-foreground pt-0.5">ft²</span>
                    </div>
                    {currentFloorConfig.length > 2 && (
                      <button onClick={() => removeRoom(activeConfigFloor, idx)} className="h-6 w-6 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-all ml-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {room.name.toLowerCase().includes('bath') && (
                    <div className="flex gap-2 mb-3 mt-1">
                      {(['attached', 'common'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => updateBathType(activeConfigFloor, idx, type)}
                          className={`flex-1 py-1 text-[9px] font-bold uppercase rounded transition-all border ${room.bathType === type || (!room.bathType && type === 'common') ? 'bg-primary/20 text-primary border-primary/30' : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'}`}
                        >
                          {type} Bath
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Handle the range slider's dynamic max limits */}
                  {(() => {
                    const targetTotal = Math.floor(totalArea / numFloors);
                    const otherRoomsMinSum = currentFloorConfig.reduce((s, r, ri) => {
                      if (ri === idx) return s;
                      return s + (r.name.toLowerCase().includes('bath') ? 20 : 40);
                    }, 0);
                    const maxSliderValue = targetTotal - otherRoomsMinSum;

                    return (
                      <input
                        type="range"
                        min={room.name.toLowerCase().includes('bath') ? 20 : 40}
                        max={maxSliderValue}
                        value={room.sizeSqFt}
                        onChange={(e) => updateRoomSize(activeConfigFloor, idx, parseInt(e.target.value))}
                        className="w-full accent-primary h-1.5 cursor-pointer"
                      />
                    );
                  })()}
                </div>
              ))}
            </div>

            {/* Add Room button — shows inline prompt for name */}
            <div className="mt-2">
              {addingRoom === activeConfigFloor ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5">
                  <input
                    autoFocus
                    className="input-dark flex-1 py-1.5 text-xs"
                    placeholder="Room name (e.g. Guest Bedroom)"
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmAddRoom(activeConfigFloor);
                      if (e.key === 'Escape') cancelAddRoom();
                    }}
                  />
                  <button onClick={() => confirmAddRoom(activeConfigFloor)} className="h-7 w-7 rounded-md bg-success/20 text-success hover:bg-success/30 flex items-center justify-center transition-all">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={cancelAddRoom} className="h-7 w-7 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 flex items-center justify-center transition-all">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startAddRoom(activeConfigFloor)}
                  disabled={currentFloorConfig.length >= 10}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-[10px] font-bold text-primary hover:bg-primary/5 transition-all disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Room to this Floor
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("area")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button className="btn-primary flex items-center gap-2" onClick={generateBlueprint}>
                Generate Intelligence Output <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      }

      {/* STEP 3: Blueprint Output */}
      {
        step === "blueprint" && layout && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Canvas */}
              <div className="lg:col-span-8 glass-card !p-0 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-4">
                    <h3 className="text-xs font-bold uppercase tracking-tight text-foreground">Interactive Planning Canvas</h3>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        setIsDoorToolActive(!isDoorToolActive);
                        setSelectedDoorRoom(null);
                      }}
                        className={`p-1.5 rounded transition-all ${isDoorToolActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                        title="Manual Door Link Tool"
                      >
                        <DoorOpen className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setShowGrid(!showGrid)} className={`p-1.5 rounded transition-all ${showGrid ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Toggle Grid">
                        <Layout className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setShowVastuCompass(!showVastuCompass)} className={`p-1.5 rounded transition-all ${showVastuCompass ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Vastu orientation">
                        <Compass className="h-3.5 w-3.5" />
                      </button>
                      <button className="p-1.5 rounded text-muted-foreground hover:bg-muted"><Layers className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="text-[10px] text-primary/70 font-medium italic mr-2 bg-primary/5 px-2 py-1 rounded">
                      {isDoorToolActive ? "DOOR TOOL ACTIVE: Click two rooms to link them" : "TIP: Double-click any wall to add a joint for custom shapes"}
                    </div>
                    {numFloors > 1 && (
                      <div className="flex border border-border rounded-md overflow-hidden bg-muted/50">
                        {Array.from({ length: numFloors }).map((_, i) => (
                          <button key={i} onClick={() => setActiveFloor(i)} className={`px-3 py-1 text-[10px] font-bold transition-all ${activeFloor === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                            {i === 0 ? 'G' : `F${i}`}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 max-w-xs">
                      <input
                        type="text"
                        placeholder="Project Name..."
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        disabled={floorPlanSaved}
                        className="bg-black/20 border border-border rounded-md px-3 py-1 text-[10px] text-foreground focus:border-primary outline-none transition-all w-32"
                      />
                      <button onClick={handleSave} disabled={floorPlanSaved} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold transition-all ${floorPlanSaved ? "bg-success/20 text-success border border-success/30" : "btn-primary"}`}>
                        <Save className="h-3 w-3" /> {floorPlanSaved ? "Saved" : "Save Plan"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-6 bg-[hsl(222,47%,4%)] overflow-auto select-none"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}>
                  <svg ref={svgRef} viewBox={`-20 -20 ${CANVAS_W + 60} ${CANVAS_H + 60}`} style={{ maxHeight: 600, touchAction: 'none' }} className="mx-auto block">
                    <defs>
                      <pattern id="gridLarge" width={Math.max(1, 100 * scale / 10)} height={Math.max(1, 100 * scale / 10)} patternUnits="userSpaceOnUse">
                        <path d={`M ${100 * scale / 10} 0 L 0 0 0 ${100 * scale / 10}`} fill="none" stroke="hsl(217,33%,15%)" strokeWidth="1" />
                      </pattern>
                      <pattern id="gridSmall" width={Math.max(1, 20 * scale / 10)} height={Math.max(1, 20 * scale / 10)} patternUnits="userSpaceOnUse">
                        <path d={`M ${20 * scale / 10} 0 L 0 0 0 ${20 * scale / 10}`} fill="none" stroke="hsl(217,33%,10%)" strokeWidth="0.5" />
                      </pattern>
                      <pattern id="diagonalHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="8" stroke="hsl(215, 20%, 45%)" strokeWidth="1.5" />
                      </pattern>
                    </defs>

                    {/* Outer Void Area */}
                    <rect x={-20} y={-20} width={CANVAS_W + 40} height={CANVAS_H + 40} fill="hsl(222,47%,2%)" />

                    {showGrid && (
                      <g opacity={0.4}>
                        <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="url(#gridSmall)" />
                        <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="url(#gridLarge)" />
                      </g>
                    )}

                    {/* Vastu Directional Zone Overlay */}
                    {state.projectMeta.vastuMode !== 'Off' && layout && (() => {
                      const facing = (state.projectMeta.facing || 'North') as VastuFacing;
                      const rects = getZoneRects(layout.plotW, layout.plotH, facing);
                      const svgScaleX = CANVAS_W / layout.plotW;
                      const svgScaleY = CANVAS_H / layout.plotH;
                      const ZONE_FILLS: Record<VastuZone, string> = {
                        NE: 'hsl(174,60%,45%,0.10)', N: 'hsl(220,80%,55%,0.06)',
                        NW: 'hsl(270,60%,55%,0.08)', E: 'hsl(200,70%,50%,0.06)',
                        Center: 'hsl(0,70%,50%,0.08)', W: 'hsl(240,60%,55%,0.06)',
                        SE: 'hsl(38,80%,50%,0.10)', S: 'hsl(215,20%,40%,0.06)',
                        SW: 'hsl(215,30%,35%,0.10)',
                      };
                      const ZONE_STROKES: Record<VastuZone, string> = {
                        NE: 'hsl(174,60%,45%)', N: 'hsl(220,80%,55%)',
                        NW: 'hsl(270,60%,55%)', E: 'hsl(200,70%,50%)',
                        Center: 'hsl(0,70%,50%)', W: 'hsl(240,60%,55%)',
                        SE: 'hsl(38,80%,50%)', S: 'hsl(215,20%,40%)',
                        SW: 'hsl(215,30%,35%)',
                      };
                      return (
                        <g opacity={0.7} className="pointer-events-none">
                          {rects.map(({ zone, x, y, w, h }) => (
                            <g key={zone}>
                              <rect
                                x={x * svgScaleX} y={y * svgScaleY}
                                width={w * svgScaleX} height={h * svgScaleY}
                                fill={ZONE_FILLS[zone]}
                                stroke={ZONE_STROKES[zone]}
                                strokeWidth={0.5}
                                strokeDasharray={zone === 'Center' ? '3,3' : undefined}
                              />
                              <text
                                x={(x + w / 2) * svgScaleX}
                                y={(y + h / 2) * svgScaleY}
                                textAnchor="middle" dominantBaseline="middle"
                                fill={ZONE_STROKES[zone]} fontSize={Math.min(9, w * svgScaleX / 3)}
                                fontWeight={700} opacity={0.7}
                              >
                                {zone}
                              </text>
                            </g>
                          ))}
                        </g>
                      );
                    })()}

                    {/* Solid Plot Boundary */}
                    <rect
                      x={0} y={0}
                      width={CANVAS_W} height={CANVAS_H}
                      fill="hsl(222,47%,6%)"
                      stroke="hsl(215,20%,50%)"
                      strokeWidth={4}
                      strokeDasharray="8,4"
                      opacity={0.8}
                    />
                    <rect
                      x={-2} y={-2}
                      width={CANVAS_W + 4} height={CANVAS_H + 4}
                      fill="none"
                      stroke="primary"
                      strokeWidth={1}
                      opacity={0.3}
                    />

                    {/* Vastu Orientation Labels */}
                    {showVastuCompass && (
                      <g opacity={0.5} className="pointer-events-none uppercase font-bold" fontSize={8}>
                        <text x={CANVAS_W / 2} y={-8} textAnchor="middle" fill="hsl(215,20%,60%)">North (Vayu/Kuber)</text>
                        <text x={CANVAS_W / 2} y={CANVAS_H + 15} textAnchor="middle" fill="hsl(215,20%,60%)">South (Yama)</text>
                        <text x={CANVAS_W + 10} y={CANVAS_H / 2} transform={`rotate(90, ${CANVAS_W + 10}, ${CANVAS_H / 2})`} textAnchor="middle" fill="hsl(215,20%,60%)">East (Surya/Indra)</text>
                        <text x={-15} y={CANVAS_H / 2} transform={`rotate(-90, -15, ${CANVAS_H / 2})`} textAnchor="middle" fill="hsl(215,20%,60%)">West (Varun)</text>

                        {/* Vastu Quadrant Dividers */}
                        <line x1={CANVAS_W / 3} y1={0} x2={CANVAS_W / 3} y2={CANVAS_H} stroke="white" strokeWidth={0.5} strokeDasharray="4,8" opacity={0.2} />
                        <line x1={2 * CANVAS_W / 3} y1={0} x2={2 * CANVAS_W / 3} y2={CANVAS_H} stroke="white" strokeWidth={0.5} strokeDasharray="4,8" opacity={0.2} />
                        <line x1={0} y1={CANVAS_H / 3} x2={CANVAS_W} y2={CANVAS_H / 3} stroke="white" strokeWidth={0.5} strokeDasharray="4,8" opacity={0.2} />
                        <line x1={0} y1={2 * CANVAS_H / 3} x2={CANVAS_W} y2={2 * CANVAS_H / 3} stroke="white" strokeWidth={0.5} strokeDasharray="4,8" opacity={0.2} />

                        {/* Compass Rose */}
                        <g transform={`translate(${CANVAS_W - 30}, 30)`} opacity={0.8}>
                          <circle r={20} fill="none" stroke="hsl(215,20%,40%)" strokeWidth={0.5} />
                          <path d="M 0 -18 L 4 0 L 0 18 L -4 0 Z" fill="hsl(215,20%,60%)" />
                          <path d="M -18 0 L 0 -4 L 18 0 L 0 4 Z" fill="hsl(215,20%,40%)" />
                          <text y={-22} textAnchor="middle" fontSize={10} fill="white">N</text>
                        </g>
                      </g>
                    )}

                    {floorRooms.map((room) => {
                      const rx = room.x * scale;
                      const ry = room.y * scale;
                      const rw = room.width * scale;
                      const rh = room.height * scale;
                      const isCore = room.zone === 'core';

                      // Generate SVG path string if polygon exists
                      const pathD = room.polygon
                        ? `M ${room.polygon.map(p => `${p.x * scale},${p.y * scale}`).join(' L ')} Z`
                        : `M ${rx},${ry} L ${rx + rw},${ry} L ${rx + rw},${ry + rh} L ${rx},${ry + rh} Z`;

                      // Calculate centroid for text placement
                      let cx = rx + rw / 2;
                      let cy = ry + rh / 2;
                      if (room.polygon && room.polygon.length > 0) {
                        cx = room.polygon.reduce((sum, p) => sum + p.x, 0) / room.polygon.length * scale;
                        cy = room.polygon.reduce((sum, p) => sum + p.y, 0) / room.polygon.length * scale;
                      }

                      return (
                        <g key={room.id}>
                          {/* Vastu violation dashed outline */}
                          {state.projectMeta.vastuMode !== 'Off' && !isCore && (() => {
                            const vastuReport = layout ? runVastuAnalysis(
                              layout.rooms, layout.plotW, layout.plotH,
                              (state.projectMeta.facing || 'North') as VastuFacing,
                              state.projectMeta.vastuMode as any
                            ) : null;
                            const check = vastuReport?.breakdown.find(c => c.rooms.some(r => r.id === room.id));
                            if (!check || check.compliant) return null;
                            return (
                              <path d={pathD} fill="none"
                                stroke={check.inAvoid ? 'hsl(0,70%,55%)' : 'hsl(38,80%,55%)'}
                                strokeWidth={3} strokeDasharray="6,3" opacity={0.7}
                                className="pointer-events-none"
                              />
                            );
                          })()}
                          <path
                            d={pathD}
                            onClick={(e) => {
                              if (!isDoorToolActive || isCore) return;
                              e.stopPropagation();
                              if (selectedDoorRoom === null) {
                                setSelectedDoorRoom(room.id);
                              } else {
                                if (selectedDoorRoom === room.id) {
                                  setSelectedDoorRoom(null);
                                  return;
                                }
                                setLayout(prev => {
                                  if (!prev) return prev;
                                  const newRooms = prev.rooms.map(r => {
                                    if (r.id === room.id) {
                                      const current = r.customConnections || [];
                                      const hasConn = current.includes(selectedDoorRoom);
                                      return { ...r, customConnections: hasConn ? current.filter(id => id !== selectedDoorRoom) : [...current, selectedDoorRoom] };
                                    } else if (r.id === selectedDoorRoom) {
                                      const current = r.customConnections || [];
                                      const hasConn = current.includes(room.id);
                                      return { ...r, customConnections: hasConn ? current.filter(id => id !== room.id) : [...current, room.id] };
                                    }
                                    return r;
                                  });
                                  return { ...prev, rooms: newRooms };
                                });
                                setSelectedDoorRoom(null);
                              }
                            }}
                            fill={isDoorToolActive && selectedDoorRoom === room.id ? "hsl(45, 90%, 60%)" : (isCore ? "url(#diagonalHatch)" : room.color.replace(")", " / 0.15)"))}
                            stroke={isDoorToolActive && selectedDoorRoom === room.id ? "hsl(45, 90%, 50%)" : room.color}
                            strokeWidth={isDoorToolActive && selectedDoorRoom === room.id ? 4 : 2}
                            className={`transition-all duration-300 ${isDoorToolActive && !isCore ? "cursor-pointer hover:opacity-80" : ""}`}
                          />
                          {!isCore && (
                            <>
                              <text x={cx} y={cy - 5} textAnchor="middle" fill="white" fontSize={Math.max(7, Math.min(11, rw / 6))} fontWeight={700} className="pointer-events-none select-none">
                                {room.name.toUpperCase()}
                              </text>
                              <text x={cx} y={cy + 9} textAnchor="middle" fill="hsl(215,20%,60%)" fontSize={Math.max(6, Math.min(9, rw / 8))} className="pointer-events-none select-none">
                                {Math.round(room.area)} FT²
                              </text>
                            </>
                          )}
                          {isCore && (
                            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="hsl(215,20%,60%)" fontSize={7} fontWeight={700} className="pointer-events-none select-none">
                              STAIR
                            </text>
                          )}

                          {/* Draggable segment lines (walls) */}
                          {!isCore && room.polygon && room.polygon.map((pt, idx) => {
                            const nextPt = room.polygon![(idx + 1) % room.polygon!.length];
                            const isDragging = draggingSegment?.roomId === room.id && draggingSegment?.segmentIdx === idx;
                            return (
                              <line
                                key={`seg-${idx}`}
                                x1={pt.x * scale} y1={pt.y * scale}
                                x2={nextPt.x * scale} y2={nextPt.y * scale}
                                stroke={isDragging ? "hsl(45,90%,60%)" : "transparent"}
                                strokeWidth={10}
                                className="cursor-move hover:stroke-[hsl(45,90%,50%)] transition-colors opacity-80"
                                onPointerDown={(e) => handleSegmentPointerDown(room.id, idx, e, room.polygon!)}
                                onDoubleClick={(e) => handleSegmentDoubleClick(room.id, idx, e)}
                              />
                            );
                          })}

                          {/* Draggable joints (only for non-core rooms) */}
                          {!isCore && room.polygon && room.polygon.map((pt, idx) => (
                            <circle
                              key={idx}
                              cx={pt.x * scale}
                              cy={pt.y * scale}
                              r={draggingPoint?.roomId === room.id && draggingPoint?.pointIdx === idx ? 6 : 4}
                              fill={draggingPoint?.roomId === room.id && draggingPoint?.pointIdx === idx ? "hsl(45,90%,60%)" : "hsl(215,20%,80%)"}
                              stroke="hsl(222,47%,4%)"
                              strokeWidth={1.5}
                              className={`transition-colors ${isDoorToolActive ? "pointer-events-none" : "cursor-pointer hover:fill-[hsl(45,90%,70%)]"}`}
                              onPointerDown={(e) => { if (!isDoorToolActive) handlePointerDown(room.id, idx, e); }}
                            />
                          ))}

                          {/* Render manual door connection links */}
                          {room.customConnections?.map(targetId => {
                            if (targetId < room.id) return null; // Draw only one way to avoid duplicates
                            const targetRoom = layout.rooms.find(r => r.id === targetId);
                            if (!targetRoom || targetRoom.floor !== activeFloor) return null;

                            // calculate target centroid
                            let tcx = (targetRoom.x + targetRoom.width / 2) * scale;
                            let tcy = (targetRoom.y + targetRoom.height / 2) * scale;
                            if (targetRoom.polygon && targetRoom.polygon.length > 0) {
                              tcx = targetRoom.polygon.reduce((sum, p) => sum + p.x, 0) / targetRoom.polygon.length * scale;
                              tcy = targetRoom.polygon.reduce((sum, p) => sum + p.y, 0) / targetRoom.polygon.length * scale;
                            }

                            return (
                              <line
                                key={`conn-${room.id}-${targetId}`}
                                x1={cx} y1={cy}
                                x2={tcx} y2={tcy}
                                stroke="hsl(142, 71%, 45%)"
                                strokeWidth={3}
                                strokeDasharray="6,4"
                                className="pointer-events-none"
                              />
                            );
                          })}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="px-4 py-3 border-t border-border bg-muted/20 flex gap-4">
                  <button onClick={() => setStep("rooms")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="h-3.5 w-3.5" /> Back to Config
                  </button>
                  <button onClick={handleReset} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" /> Start Over
                  </button>
                  <div className="ml-auto flex items-center gap-4">
                    <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-primary" /><span className="text-[10px] font-bold text-muted-foreground">Public Hub</span></div>
                    <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-success" /><span className="text-[10px] font-bold text-muted-foreground">Private</span></div>
                    {numFloors > 1 && <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-[hsl(215,20%,40%)]" /><span className="text-[10px] font-bold text-muted-foreground">Stair</span></div>}
                  </div>
                </div>
              </div>

              {/* Right Panel: Scores & Costs */}
              <div className="lg:col-span-4 space-y-6">
                <div className="glass-card !p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2"><Activity className="h-3 w-3" /> Intelligence Scores</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Structural', score: state.scores.structural, icon: Shield, color: 'text-success' },
                      { label: 'Circulation', score: state.scores.circulation, icon: Layout, color: 'text-primary' },
                      { label: 'Vastu', score: state.scores.vastu, icon: GraduationCap, color: 'text-warning' },
                      { label: 'Cost Stability', score: state.scores.cost, icon: Coins, color: 'text-info' }
                    ].map((s) => (
                      <div key={s.label} className="p-3 rounded-lg bg-muted/40 border border-border flex flex-col gap-1">
                        <s.icon className={`h-3 w-3 ${s.color} mb-0.5`} />
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">{s.label}</span>
                        <span className="text-xl font-black text-foreground">{s.score}%</span>
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${s.color.replace('text', 'bg')}`} style={{ width: `${s.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card !p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2"><Coins className="h-3 w-3" /> Cost Estimation</h4>
                  <div className="space-y-2 mb-4">
                    {Object.entries(state.costBreakdown).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between group">
                        <span className="text-[10px] font-medium text-muted-foreground capitalize">{key}</span>
                        <div className="flex-1 mx-2 border-b border-dashed border-border mb-0.5" />
                        <span className="text-[11px] font-mono font-bold text-foreground">₹{(val as number).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-muted-foreground">TOTAL</span>
                      <span className="text-2xl font-black text-primary">₹{Math.round(state.estimatedCost).toLocaleString()}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground italic">*Area-indexed cost estimate.</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex gap-3">
                  <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed italic">Each floor was independently configured. The staircase occupies a slim 4ft structural strip on multi-floor builds.</p>
                </div>

                {/* BIM DATA INSPECTOR */}
                {state.bimMode && (
                  <div className="glass-card !p-4 border-primary/20 animate-in slide-in-from-bottom-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2"><Ruler className="h-3 w-3" /> BIM Data Inspector</div>
                      <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[8px]">PRO</span>
                    </h4>

                    <div className="space-y-4">
                      {/* Global Summary */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-white/5 border border-white/5">
                          <span className="text-[8px] text-gray-500 uppercase font-bold">Concrete Vol</span>
                          <div className="text-xs font-mono font-bold text-white">{bimReport?.concreteVolume.toFixed(2)} m³</div>
                        </div>
                        <div className="p-2 rounded bg-white/5 border border-white/5">
                          <span className="text-[8px] text-gray-500 uppercase font-bold">Steel Reinf.</span>
                          <div className="text-xs font-mono font-bold text-white">{bimReport?.steelEstimate.toFixed(0)} kg</div>
                        </div>
                      </div>

                      {/* Layer Controls */}
                      <div className="pt-2 border-t border-white/5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase mb-2 block">Structural Layers</span>
                        <div className="flex flex-wrap gap-2">
                          {(['structural', 'architectural', 'mep', 'finishing'] as BIMLayer[]).map(layer => (
                            <button
                              key={layer}
                              onClick={() => setBIMLayerVisibility(layer, !state.bimLayers[layer])}
                              className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${state.bimLayers[layer] ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/5 text-gray-500'}`}
                            >
                              {layer.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Element Specs */}
                      <div className="pt-2 border-t border-white/5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase mb-2 block">Element Specification</span>
                        <div className="bg-black/40 rounded p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500">Wall Material</span>
                            <select className="bg-transparent text-[10px] font-bold border-none text-white focus:ring-0 cursor-pointer">
                              <option>Fly Ash Brick</option>
                              <option>Red Clay Brick</option>
                              <option>AAC Block</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500">Concrete Grade</span>
                            <select className="bg-transparent text-[10px] font-bold border-none text-white focus:ring-0 cursor-pointer">
                              <option>M20</option>
                              <option>M25</option>
                              <option>M30</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default FloorPlanGenerator;
