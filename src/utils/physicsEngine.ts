import { RoomData, FloorConfig } from '../context/AppContext';

// ─── Physics Mode ─────────────────────────────────────────────────────────────

export type PhysicsMode = 'Physics' | 'Hybrid' | 'Off';

// ─── Seismic Zone Mapping ────────────────────────────────────────────────────
// Simplified Indian seismic zone map based on latitude bands (very coarse approximation)
// Zone II = 1.0, Zone III = 1.2, Zone IV = 1.5, Zone V = 1.8

interface LatLngPoint { lat: number; lng: number }

function parseLatLng(latLong: string): LatLngPoint | null {
    if (!latLong) return null;
    const parts = latLong.split(',').map(s => parseFloat(s.trim()));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return { lat: parts[0], lng: parts[1] };
}

function getSeismicMultiplier(latLng: LatLngPoint | null): { zone: string; multiplier: number } {
    if (!latLng) return { zone: 'Zone III', multiplier: 1.2 };
    const { lat, lng } = latLng;
    // Very high seismic: Himalayan belt, NE India
    if (lat > 30 && lng > 72 && lng < 98) return { zone: 'Zone V', multiplier: 1.8 };
    // High seismic: Gujarat, parts of Maharashtra, Bihar
    if ((lat > 22 && lat < 28 && lng > 69 && lng < 79) || (lat > 24 && lat < 27 && lng > 83 && lng < 87))
        return { zone: 'Zone IV', multiplier: 1.5 };
    // Moderate: peninsular plateau, parts of Karnataka, AP
    if (lat > 12 && lat < 22 && lng > 74 && lng < 84)
        return { zone: 'Zone III', multiplier: 1.2 };
    // Low: far south Tamil Nadu, coastal Kerala
    return { zone: 'Zone II', multiplier: 1.0 };
}

// ─── Wind Load Estimation ────────────────────────────────────────────────────

function getWindPressure(latLng: LatLngPoint | null, numFloors: number): { pressure: number; description: string } {
    // Basic Vb (basic wind speed) estimate by latitude (India coastal vs inland)
    let baseSpeed = 39; // m/s default (Zone 2)
    if (latLng) {
        const { lat, lng } = latLng;
        // Coastal (heavy wind belt)
        if (lng < 74 || lng > 88 || (lat < 15 && lat > 8)) baseSpeed = 55;
        else if (lat < 20) baseSpeed = 44;
        else baseSpeed = 39;
    }
    const heightFactor = 1 + (numFloors - 1) * 0.15;
    const pressure = Math.round(0.6 * Math.pow(baseSpeed * heightFactor, 2) / 1000 * 10) / 10; // kPa approx
    const description = pressure > 3.5
        ? `High wind zone — ${pressure} kPa. Column grid reinforcement advised.`
        : pressure > 2.0
            ? `Moderate wind exposure — ${pressure} kPa. Standard design adequate.`
            : `Low wind exposure — ${pressure} kPa. Safe for residential construction.`;
    return { pressure, description };
}

// ─── Warning & Metric Types ───────────────────────────────────────────────────

export type PhysicsSeverity = 'safe' | 'moderate' | 'risk';

export interface PhysicsWarning {
    id: string;
    severity: PhysicsSeverity;
    category: string;
    message: string;
}

export interface PhysicsMetric {
    label: string;
    score: number;     // 0–100
    severity: PhysicsSeverity;
    detail: string;
}

export interface LoadArrow {
    x: number; y: number;
    dx: number; dy: number;
    floor: number;
}

export interface StressZone {
    roomId: number;
    level: PhysicsSeverity;
}

export interface VentPath {
    x1: number; y1: number;
    x2: number; y2: number;
}

// ─── What-If Result ───────────────────────────────────────────────────────────

export interface WhatIfResult {
    columnLoadIncreasePct: number;
    foundationStressPct: number;
    costDeltaINR: number;
    newRiskScore: number;
    newRiskSeverity: PhysicsSeverity;
    summary: string;
}

// ─── Full Physics Report ──────────────────────────────────────────────────────

export interface PhysicsReport {
    mode: PhysicsMode;
    overallRiskScore: number;    // 0–100 (higher = safer)
    structuralStabilityScore: number;
    loadDistributionScore: number;
    seismicScore: number;
    windScore: number;
    thermalComfortScore: number;
    cantileverScore: number;
    circulationScore: number;
    warnings: PhysicsWarning[];
    loadArrows: LoadArrow[];
    stressZones: StressZone[];
    ventPaths: VentPath[];
    seismicZone: string;
    windPressure: number;       // kPa
    windDescription: string;
    numFloors: number;
    isHybridBlended: boolean;
    vastuBlendedScore?: number; // final blended score when Hybrid
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severity(score: number): PhysicsSeverity {
    return score >= 70 ? 'safe' : score >= 40 ? 'moderate' : 'risk';
}

function clamp(val: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, val));
}

function getRoomCentroid(room: RoomData): { cx: number; cy: number } {
    if (room.polygon && room.polygon.length > 0) {
        const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
        const cy = room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length;
        return { cx, cy };
    }
    return { cx: room.x + room.width / 2, cy: room.y + room.height / 2 };
}

// ─── 1. Load Path Validation ─────────────────────────────────────────────────

function analyzeLoadPath(
    rooms: RoomData[],
    plotW: number,
    plotH: number,
    numFloors: number
): { score: number; warnings: PhysicsWarning[]; loadArrows: LoadArrow[]; stressZones: StressZone[] } {
    const warnings: PhysicsWarning[] = [];
    const loadArrows: LoadArrow[] = [];
    const stressZones: StressZone[] = [];
    let penalty = 0;

    // Check for excessively wide rooms (beam span proxy: width > 5m → 500cm)
    const MAX_SPAN_CM = 500; // ~5 metres
    const groundFloor = rooms.filter(r => r.floor === 0);

    groundFloor.forEach(room => {
        const spanW = room.width;
        const spanH = room.height;
        const maxSpan = Math.max(spanW, spanH);
        if (maxSpan > MAX_SPAN_CM) {
            penalty += 15;
            warnings.push({
                id: `span-${room.id}`,
                severity: 'moderate',
                category: 'Load Path',
                message: `"${room.name}": Beam span exceeds recommended residential limit (${Math.round(maxSpan / 100 * 10) / 10}m > 5m). Consider adding an intermediate column or beam.`,
            });
            stressZones.push({ roomId: room.id, level: 'moderate' });
        }
    });

    // Simulate floating walls: rooms on upper floor with no matching footprint below
    if (numFloors > 1) {
        const upperRooms = rooms.filter(r => r.floor > 0);
        upperRooms.forEach(upper => {
            const { cx: ucx, cy: ucy } = getRoomCentroid(upper);
            const hasSupport = groundFloor.some(lower => {
                const { cx: lcx, cy: lcy } = getRoomCentroid(lower);
                return Math.abs(ucx - lcx) < lower.width * 0.75 && Math.abs(ucy - lcy) < lower.height * 0.75;
            });
            if (!hasSupport) {
                penalty += 20;
                warnings.push({
                    id: `floating-${upper.id}`,
                    severity: 'risk',
                    category: 'Load Path',
                    message: `"${upper.name}" on floor ${upper.floor + 1} appears unsupported — no matching load-bearing room below. Risk of structural instability.`,
                });
                stressZones.push({ roomId: upper.id, level: 'risk' });
            }
        });
    }

    // Build load arrows (from centroid of each upper floor room downward)
    rooms.filter(r => r.floor > 0).forEach(room => {
        const { cx, cy } = getRoomCentroid(room);
        loadArrows.push({ x: cx, y: cy, dx: 0, dy: 40, floor: room.floor });
    });
    // Ground floor corners also get arrows
    [{ x: plotW * 0.1, y: plotH * 0.1 }, { x: plotW * 0.9, y: plotH * 0.1 },
    { x: plotW * 0.1, y: plotH * 0.9 }, { x: plotW * 0.9, y: plotH * 0.9 }].forEach(pt => {
        loadArrows.push({ x: pt.x, y: pt.y, dx: 0, dy: 30, floor: 0 });
    });

    const score = clamp(100 - penalty);
    return { score, warnings, loadArrows, stressZones };
}

// ─── 2. Column Continuity ────────────────────────────────────────────────────

function analyzeColumnContinuity(
    rooms: RoomData[],
    numFloors: number
): { score: number; warnings: PhysicsWarning[] } {
    const warnings: PhysicsWarning[] = [];
    let penalty = 0;

    if (numFloors < 2) return { score: 100, warnings }; // single floor, no issue

    // Check staircase placement — if asymmetric (in far edge), load imbalance
    const staircases = rooms.filter(r => r.name.toLowerCase().includes('staircase'));
    if (staircases.length === 0 && numFloors > 1) {
        penalty += 15;
        warnings.push({
            id: 'no-staircase',
            severity: 'moderate',
            category: 'Column Continuity',
            message: `Multi-floor plan detected (${numFloors} floors) with no staircase room. Vertical circulation and structural continuity cannot be verified.`,
        });
    }

    staircases.forEach(sc => {
        const { cx } = getRoomCentroid(sc);
        // Check if staircase is near plot center — good; if near corners, flag
        // We'll treat center 40–60% of plot as ideal
        // We don't have plotW here; use relative positioning by percentage not available.
        // Instead: check if staircase is on floor 0
        if (sc.floor !== 0) {
            penalty += 10;
            warnings.push({
                id: `stair-floor-${sc.id}`,
                severity: 'moderate',
                category: 'Column Continuity',
                message: `Staircase "${sc.name}" does not start at ground floor — upper floor staircase without ground-floor continuity detected.`,
            });
        }
    });

    // Check for rooms that span > 2 floors without matching structural column area
    const floorGroups: Record<number, RoomData[]> = {};
    rooms.forEach(r => { floorGroups[r.floor] = [...(floorGroups[r.floor] || []), r]; });

    const floors = Object.keys(floorGroups).map(Number).sort();
    floors.slice(1).forEach(f => {
        const upper = floorGroups[f];
        const lower = floorGroups[f - 1] || [];
        upper.forEach(u => {
            const { cx: ux, cy: uy } = getRoomCentroid(u);
            const hasColumnBelow = lower.some(l => {
                const { cx: lx, cy: ly } = getRoomCentroid(l);
                return Math.abs(ux - lx) < (l.width / 2 + 50) && Math.abs(uy - ly) < (l.height / 2 + 50);
            });
            if (!hasColumnBelow) {
                penalty += 12;
                warnings.push({
                    id: `misaligned-col-${u.id}`,
                    severity: 'moderate',
                    category: 'Column Continuity',
                    message: `"${u.name}" (Floor ${f + 1}) has no aligned structural zone below. Column misalignment risk.`,
                });
            }
        });
    });

    return { score: clamp(100 - penalty), warnings };
}

// ─── 3. Cantilever Detection ─────────────────────────────────────────────────

function analyzeCantilever(rooms: RoomData[], plotW: number, plotH: number): { score: number; warnings: PhysicsWarning[] } {
    const warnings: PhysicsWarning[] = [];
    let penalty = 0;
    const MAX_PROJECTION_CM = 150; // 1.5 metres safe residential cantilever

    const balconies = rooms.filter(r =>
        r.name.toLowerCase().includes('balcony') ||
        r.name.toLowerCase().includes('terrace') ||
        r.name.toLowerCase().includes('overhang')
    );

    balconies.forEach(room => {
        const projection = Math.min(room.width, room.height);
        if (projection > MAX_PROJECTION_CM) {
            penalty += 20;
            warnings.push({
                id: `cantilever-${room.id}`,
                severity: 'risk',
                category: 'Cantilever',
                message: `"${room.name}": Cantilever projection estimated at ${Math.round(projection / 100 * 10) / 10}m — exceeds recommended safe residential limit of 1.5m. Verify structural support and consider tie-back beams.`,
            });
        } else if (projection > MAX_PROJECTION_CM * 0.7) {
            penalty += 8;
            warnings.push({
                id: `cantilever-mod-${room.id}`,
                severity: 'moderate',
                category: 'Cantilever',
                message: `"${room.name}": Projection of ${Math.round(projection / 100 * 10) / 10}m approaches safe cantilever limit. Ensure adequate upstand beam depth.`,
            });
        }
    });

    // Slab corners: look for rooms at extreme plot edges (> 85% of plotW or plotH from origin)
    rooms.filter(r => r.floor === 0).forEach(room => {
        const rx2 = room.x + room.width;
        const ry2 = room.y + room.height;
        if (rx2 > plotW * 0.92 || ry2 > plotH * 0.92 || room.x < plotW * 0.05 || room.y < plotH * 0.05) {
            // Edge room — mild flag only if no balcony keyword
            if (!room.name.toLowerCase().includes('balcony')) return;
        }
    });

    return { score: clamp(100 - penalty), warnings };
}

// ─── 4. Wind Load ────────────────────────────────────────────────────────────

function analyzeWind(
    latLng: LatLngPoint | null,
    numFloors: number,
    rooms: RoomData[]
): { score: number; warnings: PhysicsWarning[]; pressure: number; description: string } {
    const warnings: PhysicsWarning[] = [];
    const { pressure, description } = getWindPressure(latLng, numFloors);
    let penalty = 0;

    if (pressure > 3.5) {
        penalty += 20;
        warnings.push({
            id: 'wind-high',
            severity: 'risk',
            category: 'Wind Load',
            message: `High wind pressure zone (${pressure} kPa). For ${numFloors}-floor structure, column grid reinforcement and wind bracing are strongly recommended.`,
        });
    } else if (pressure > 2.0) {
        penalty += 8;
        warnings.push({
            id: 'wind-mod',
            severity: 'moderate',
            category: 'Wind Load',
            message: `Moderate wind exposure (${pressure} kPa). Standard residential detailing is adequate but verify column sizing on upper floors.`,
        });
    }

    // Tall + asymmetric column grid amplifies wind risk
    if (numFloors > 2 && rooms.filter(r => r.floor === 0).length < 4) {
        penalty += 10;
        warnings.push({
            id: 'wind-tall-weak',
            severity: 'moderate',
            category: 'Wind Load',
            message: `Tall structure (${numFloors} floors) with limited ground-floor rooms. Wind overturning risk increases — ensure minimum 4-column grid.`,
        });
    }

    return { score: clamp(100 - penalty), warnings, pressure, description };
}

// ─── 5. Seismic Sensitivity ──────────────────────────────────────────────────

function analyzeSeismic(
    latLng: LatLngPoint | null,
    rooms: RoomData[],
    numFloors: number,
    plotW: number,
    plotH: number
): { score: number; warnings: PhysicsWarning[]; zone: string } {
    const warnings: PhysicsWarning[] = [];
    const { zone, multiplier } = getSeismicMultiplier(latLng);
    let penalty = (multiplier - 1.0) * 30; // Zone II → 0, Zone V → 24

    // Mass asymmetry: staircase skewed to one side increases seismic risk
    const staircases = rooms.filter(r => r.name.toLowerCase().includes('staircase'));
    staircases.forEach(sc => {
        const { cx } = getRoomCentroid(sc);
        const centerX = plotW / 2;
        const offset = Math.abs(cx - centerX) / plotW; // 0 = center, 0.5 = edge
        if (offset > 0.35) {
            penalty += 15 * multiplier;
            warnings.push({
                id: `seismic-stair-${sc.id}`,
                severity: multiplier > 1.3 ? 'risk' : 'moderate',
                category: 'Seismic',
                message: `Staircase "${sc.name}" is significantly off-center (${Math.round(offset * 100)}% offset). Combined with ${zone}, this creates an irregular mass distribution — increases seismic vulnerability.`,
            });
        }
    });

    if (multiplier >= 1.5) {
        warnings.push({
            id: 'seismic-zone',
            severity: multiplier >= 1.8 ? 'risk' : 'moderate',
            category: 'Seismic',
            message: `Site is in Seismic ${zone} (multiplier ×${multiplier}). Ensure IS:1893-2016 compliant ductile detailing for all beams and columns.`,
        });
    }

    return { score: clamp(100 - penalty), warnings, zone };
}

// ─── 6. Environmental / Thermal ──────────────────────────────────────────────

function analyzeThermal(
    rooms: RoomData[],
    plotW: number,
    plotH: number
): { score: number; warnings: PhysicsWarning[]; ventPaths: VentPath[] } {
    const warnings: PhysicsWarning[] = [];
    const ventPaths: VentPath[] = [];
    let score = 70; // baseline

    // Check for cross-ventilation: need rooms on opposite sides (east vs west, or north vs south)
    const groundRooms = rooms.filter(r => r.floor === 0);
    const eastRooms = groundRooms.filter(r => (r.x + r.width / 2) > plotW * 0.6);
    const westRooms = groundRooms.filter(r => (r.x + r.width / 2) < plotW * 0.4);
    const hasCrossVent = eastRooms.length > 0 && westRooms.length > 0;

    if (!hasCrossVent) {
        score -= 20;
        warnings.push({
            id: 'cross-vent',
            severity: 'moderate',
            category: 'Thermal',
            message: 'No east–west cross-ventilation detected. Consider placing openings on opposite sides to promote air movement and reduce heat build-up.',
        });
    } else {
        // Draw ventilation paths between east and west rooms
        eastRooms.slice(0, 2).forEach(er => {
            westRooms.slice(0, 2).forEach(wr => {
                const { cx: ex, cy: ey } = getRoomCentroid(er);
                const { cx: wx, cy: wy } = getRoomCentroid(wr);
                ventPaths.push({ x1: wx, y1: wy, x2: ex, y2: ey });
            });
        });
    }

    // Sun exposure: kitchen ideally not on west (heat gain in afternoon)
    const kitchens = groundRooms.filter(r => r.name.toLowerCase().includes('kitchen'));
    kitchens.forEach(k => {
        const { cx } = getRoomCentroid(k);
        if (cx > plotW * 0.65) {
            score -= 10;
            warnings.push({
                id: `kitchen-west-${k.id}`,
                severity: 'moderate',
                category: 'Thermal',
                message: `Kitchen "${k.name}" is on the west side — afternoon solar heat gain will increase kitchen temperature significantly. Relocating to southeast or adding shading is recommended.`,
            });
        }
    });

    // Master bedroom in south/southwest = good for India (cooler nights in summer)
    const masterBed = groundRooms.filter(r => r.name.toLowerCase().includes('master'));
    masterBed.forEach(mb => {
        const { cy } = getRoomCentroid(mb);
        if (cy < plotH * 0.35) {
            // North = hotter in summer in India
            score -= 5;
        }
    });

    return { score: clamp(score), warnings, ventPaths };
}

// ─── 7. Circulation Physics ──────────────────────────────────────────────────

function analyzeCirculation(rooms: RoomData[], plotW: number, plotH: number, numFloors: number): { score: number; warnings: PhysicsWarning[] } {
    const warnings: PhysicsWarning[] = [];
    let score = 85;

    // Dead-end detection: rooms with no connections and far from corridor/staircase
    const groundRooms = rooms.filter(r => r.floor === 0);
    const corridors = groundRooms.filter(r =>
        r.name.toLowerCase().includes('corridor') ||
        r.name.toLowerCase().includes('hallway') ||
        r.name.toLowerCase().includes('passage')
    );
    const staircases = rooms.filter(r => r.name.toLowerCase().includes('staircase'));

    // Private rooms far from any corridor = poor circulation
    const privateRooms = groundRooms.filter(r =>
        r.zone === 'private' &&
        !r.name.toLowerCase().includes('staircase')
    );

    const hasCirculationCore = corridors.length > 0 || staircases.length > 0;
    if (!hasCirculationCore && groundRooms.length > 4) {
        score -= 20;
        warnings.push({
            id: 'no-corridor',
            severity: 'moderate',
            category: 'Circulation',
            message: 'No corridor or hallway detected. For plans with more than 4 rooms, a circulation spine significantly improves movement efficiency and emergency egress.',
        });
    }

    // Multi-floor: check staircase reachability
    if (numFloors > 1 && staircases.length === 0) {
        score -= 25;
        warnings.push({
            id: 'circ-no-stair',
            severity: 'risk',
            category: 'Circulation',
            message: `${numFloors}-floor plan has no staircase. Vertical circulation is completely missing — this is an unsafe configuration.`,
        });
    }

    // Walking distance check: if house is large (>150m²) and no corridor, flag
    const totalArea = groundRooms.reduce((s, r) => s + r.area, 0);
    if (totalArea > 1500 && !hasCirculationCore) { // area in sqft
        score -= 10;
        warnings.push({
            id: 'long-walk',
            severity: 'moderate',
            category: 'Circulation',
            message: `Large floor plan (${Math.round(totalArea / 10.764)} m²) with no dedicated circulation spine. Walking distances will be inefficient — consider adding a hallway.`,
        });
    }

    return { score: clamp(score), warnings };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function runPhysicsAnalysis(
    rooms: RoomData[],
    plotW: number,
    plotH: number,
    floorConfig: FloorConfig | null,
    latLong: string = '',
    vastuScore?: number,
    mode: PhysicsMode = 'Physics'
): PhysicsReport {
    if (mode === 'Off') {
        return {
            mode,
            overallRiskScore: 0,
            structuralStabilityScore: 0,
            loadDistributionScore: 0,
            seismicScore: 0,
            windScore: 0,
            thermalComfortScore: 0,
            cantileverScore: 0,
            circulationScore: 0,
            warnings: [],
            loadArrows: [],
            stressZones: [],
            ventPaths: [],
            seismicZone: 'N/A',
            windPressure: 0,
            windDescription: '',
            numFloors: floorConfig?.numFloors || 1,
            isHybridBlended: false,
        };
    }

    const numFloors = floorConfig?.numFloors || 1;
    const latLng = parseLatLng(latLong);

    const loadResult = analyzeLoadPath(rooms, plotW, plotH, numFloors);
    const columnResult = analyzeColumnContinuity(rooms, numFloors);
    const cantileverResult = analyzeCantilever(rooms, plotW, plotH);
    const windResult = analyzeWind(latLng, numFloors, rooms);
    const seismicResult = analyzeSeismic(latLng, rooms, numFloors, plotW, plotH);
    const thermalResult = analyzeThermal(rooms, plotW, plotH);
    const circResult = analyzeCirculation(rooms, plotW, plotH, numFloors);

    // Merge load path + column continuity into structural stability
    const structuralStabilityScore = Math.round((loadResult.score + columnResult.score) / 2);
    const loadDistributionScore = loadResult.score;
    const cantileverScore = cantileverResult.score;
    const windScore = windResult.score;
    const seismicScore = seismicResult.score;
    const thermalComfortScore = thermalResult.score;
    const circulationScore = circResult.score;

    // Weighted composite risk score (physics)
    const physicsScore = Math.round(
        structuralStabilityScore * 0.25 +
        loadDistributionScore * 0.15 +
        seismicScore * 0.15 +
        windScore * 0.10 +
        thermalComfortScore * 0.15 +
        cantileverScore * 0.10 +
        circulationScore * 0.10
    );

    const allWarnings = [
        ...loadResult.warnings,
        ...columnResult.warnings,
        ...cantileverResult.warnings,
        ...windResult.warnings,
        ...seismicResult.warnings,
        ...thermalResult.warnings,
        ...circResult.warnings,
    ].sort((a, b) => {
        const ord: Record<PhysicsSeverity, number> = { risk: 0, moderate: 1, safe: 2 };
        return ord[a.severity] - ord[b.severity];
    });

    // Hybrid blending
    const isHybridBlended = mode === 'Hybrid' && vastuScore !== undefined;
    const blendedScore = isHybridBlended
        ? Math.round((physicsScore * 0.5) + ((vastuScore as number) * 0.5))
        : physicsScore;

    return {
        mode,
        overallRiskScore: blendedScore,
        structuralStabilityScore,
        loadDistributionScore,
        seismicScore,
        windScore,
        thermalComfortScore,
        cantileverScore,
        circulationScore,
        warnings: allWarnings,
        loadArrows: loadResult.loadArrows,
        stressZones: loadResult.stressZones,
        ventPaths: thermalResult.ventPaths,
        seismicZone: seismicResult.zone,
        windPressure: windResult.pressure,
        windDescription: windResult.description,
        numFloors,
        isHybridBlended,
        vastuBlendedScore: isHybridBlended ? blendedScore : undefined,
    };
}

// ─── What-If Simulation ───────────────────────────────────────────────────────

export function runWhatIfSimulation(
    report: PhysicsReport,
    extraFloors: number = 1
): WhatIfResult {
    const targetFloors = report.numFloors + extraFloors;
    const loadIncreasePct = Math.round(((targetFloors / report.numFloors) - 1) * 100);
    const foundationStressPct = Math.round(Math.min(100, (targetFloors / 3) * 35));
    const costDeltaINR = Math.round(targetFloors * 750000 * 0.8); // ~₹7.5L per floor × 80%

    // New risk: structural score degrades with more floors
    const seismicPenalty = targetFloors > 3 ? 15 : targetFloors > 2 ? 8 : 0;
    const newPhysicsScore = Math.max(30, report.overallRiskScore - seismicPenalty - loadIncreasePct * 0.3);
    const newRiskScore = Math.round(newPhysicsScore);
    const newRiskSeverity = severity(newRiskScore);

    const summary = `Adding ${extraFloors} floor(s) increases column load by ~${loadIncreasePct}%, puts foundation at ${foundationStressPct}% capacity, and would cost approximately ₹${(costDeltaINR / 100000).toFixed(1)}L more. Structural risk score changes from ${report.overallRiskScore} → ${newRiskScore} (${newRiskSeverity}).`;

    return {
        columnLoadIncreasePct: loadIncreasePct,
        foundationStressPct,
        costDeltaINR,
        newRiskScore,
        newRiskSeverity,
        summary,
    };
}
