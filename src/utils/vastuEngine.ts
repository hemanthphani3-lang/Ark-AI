import { RoomData } from '../context/AppContext';

// ─── Zone Types ───────────────────────────────────────────────────────────────

export type VastuZone =
    | 'NE' | 'N' | 'NW'
    | 'E' | 'Center' | 'W'
    | 'SE' | 'S' | 'SW';

export type VastuMode = 'Strict' | 'Hybrid' | 'Off';

export type VastuFacing = 'North' | 'South' | 'East' | 'West';

// ─── Rule Schema ─────────────────────────────────────────────────────────────

export interface VastuRule {
    roomKeyword: string;       // matched against room name (lowercase)
    label: string;
    preferred: VastuZone[];
    acceptable: VastuZone[];
    avoid: VastuZone[];
    weight: number;            // max score contribution (0–20)
    avoidPenalty: number;      // penalty for placing in avoid zone
}

/**
 * Core Vastu Shastra placement rules for Indian residential planning.
 * Based on directional element theory — purely positional, non-religious.
 */
export const VASTU_RULES: VastuRule[] = [
    {
        roomKeyword: 'entrance|foyer|main door',
        label: 'Main Entrance / Foyer',
        preferred: ['NE', 'N', 'E'],
        acceptable: ['NW', 'SE'],
        avoid: ['SW', 'S'],
        weight: 20,
        avoidPenalty: 15,
    },
    {
        roomKeyword: 'kitchen',
        label: 'Kitchen',
        preferred: ['SE'],
        acceptable: ['NW'],
        avoid: ['NE', 'SW', 'Center'],
        weight: 20,
        avoidPenalty: 15,
    },
    {
        roomKeyword: 'master bedroom|master bed',
        label: 'Master Bedroom',
        preferred: ['SW'],
        acceptable: ['S', 'W'],
        avoid: ['NE', 'Center'],
        weight: 20,
        avoidPenalty: 12,
    },
    {
        roomKeyword: 'pooja|prayer|puja|mandir',
        label: 'Pooja / Prayer Room',
        preferred: ['NE'],
        acceptable: ['N', 'E'],
        avoid: ['SW', 'S', 'Center'],
        weight: 15,
        avoidPenalty: 15,
    },
    {
        roomKeyword: 'toilet|bathroom|bath|wc|washroom',
        label: 'Toilet / Bathroom',
        preferred: ['NW', 'W'],
        acceptable: ['S', 'SE'],
        avoid: ['NE', 'Center', 'SW'],
        weight: 15,
        avoidPenalty: 20,
    },
    {
        roomKeyword: 'staircase',
        label: 'Staircase',
        preferred: ['S', 'SW', 'W'],
        acceptable: ['SE'],
        avoid: ['NE', 'Center'],
        weight: 10,
        avoidPenalty: 12,
    },
];

// ─── Zone Geometry ─────────────────────────────────────────────────────────

/**
 * Maps a room centroid to one of 9 Vastu zones.
 * North = top of plot (y=0), East = right (x=plotW).
 * The facing direction rotates this map.
 */
export function getZone(
    cx: number, cy: number,
    plotW: number, plotH: number,
    facing: VastuFacing = 'North'
): VastuZone {
    // Normalize to [0,1] space
    let nx = cx / (plotW || 1);
    let ny = cy / (plotH || 1);

    // Rotate coordinate space based on facing direction
    // Facing North = no rotation (North is top/y=0)
    // Facing South = 180° rotation
    // Facing East  = 90° clockwise
    // Facing West  = 90° counter-clockwise
    switch (facing) {
        case 'South': nx = 1 - nx; ny = 1 - ny; break;
        case 'East': { const tmp = nx; nx = ny; ny = 1 - tmp; break; }
        case 'West': { const tmp = nx; nx = 1 - ny; ny = tmp; break; }
    }

    const col = nx < 0.333 ? 0 : nx < 0.667 ? 1 : 2; // 0=W, 1=Center, 2=E
    const row = ny < 0.333 ? 0 : ny < 0.667 ? 1 : 2; // 0=N, 1=Center, 2=S

    const MAP: VastuZone[][] = [
        ['NW', 'N', 'NE'],
        ['W', 'Center', 'E'],
        ['SW', 'S', 'SE'],
    ];
    return MAP[row][col];
}

// ─── Zone Rect Calculation ─────────────────────────────────────────────────

export interface ZoneRect {
    zone: VastuZone;
    x: number; y: number; w: number; h: number;
}

/**
 * Returns the (x, y, w, h) bounding boxes for each of the 9 zones
 * in plot-coordinate space, accounting for facing direction.
 */
export function getZoneRects(plotW: number, plotH: number, facing: VastuFacing): ZoneRect[] {
    const cW = plotW / 3;
    const cH = plotH / 3;

    // Standard (North-facing) layout: NW=top-left, NE=top-right, SW=bottom-left...
    const standard: ZoneRect[] = [
        { zone: 'NW', x: 0, y: 0, w: cW, h: cH },
        { zone: 'N', x: cW, y: 0, w: cW, h: cH },
        { zone: 'NE', x: 2 * cW, y: 0, w: cW, h: cH },
        { zone: 'W', x: 0, y: cH, w: cW, h: cH },
        { zone: 'Center', x: cW, y: cH, w: cW, h: cH },
        { zone: 'E', x: 2 * cW, y: cH, w: cW, h: cH },
        { zone: 'SW', x: 0, y: 2 * cH, w: cW, h: cH },
        { zone: 'S', x: cW, y: 2 * cH, w: cW, h: cH },
        { zone: 'SE', x: 2 * cW, y: 2 * cH, w: cW, h: cH },
    ];

    // Rotate rects based on facing (re-map zone labels)
    const rotateMap: Record<VastuFacing, Record<VastuZone, VastuZone>> = {
        North: { NW: 'NW', N: 'N', NE: 'NE', W: 'W', Center: 'Center', E: 'E', SW: 'SW', S: 'S', SE: 'SE' },
        South: { NW: 'SE', N: 'S', NE: 'SW', W: 'E', Center: 'Center', E: 'W', SW: 'NE', S: 'N', SE: 'NW' },
        East: { NW: 'SW', N: 'W', NE: 'NW', W: 'S', Center: 'Center', E: 'N', SW: 'SE', S: 'E', SE: 'NE' },
        West: { NW: 'NE', N: 'E', NE: 'SE', W: 'N', Center: 'Center', E: 'S', SW: 'NW', S: 'W', SE: 'SW' },
    };

    return standard.map(r => ({ ...r, zone: rotateMap[facing][r.zone] }));
}

// ─── Room Centroid ─────────────────────────────────────────────────────────

function getRoomCentroid(room: RoomData): { cx: number; cy: number } {
    if (room.polygon && room.polygon.length > 0) {
        const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
        const cy = room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length;
        return { cx, cy };
    }
    return { cx: room.x + room.width / 2, cy: room.y + room.height / 2 };
}

// ─── Rule Matcher ──────────────────────────────────────────────────────────

function matchesRule(room: RoomData, rule: VastuRule): boolean {
    const name = room.name.toLowerCase();
    return rule.roomKeyword.split('|').some(kw => name.includes(kw.trim()));
}

// ─── Advisory Notes ────────────────────────────────────────────────────────

function getAdvisoryNote(
    label: string, zone: VastuZone, rule: VastuRule, compliant: boolean
): string {
    if (compliant) {
        return `${label} is well-positioned in the ${zone} zone, aligning with directional planning principles.`;
    }

    const preferred = rule.preferred.join(' or ');
    const avoid = rule.avoid.includes(zone);

    if (avoid) {
        return `${label} in the ${zone} zone creates a directional conflict. Relocating to the ${preferred} zone is recommended to improve compliance.`;
    }
    return `${label} is in the ${zone} zone — acceptable but not optimal. The ${preferred} zone would provide better directional alignment.`;
}

// ─── Per-room Check Result ─────────────────────────────────────────────────

export interface VastuCheckResult {
    rule: VastuRule;
    rooms: RoomData[];
    zone: VastuZone | null;
    compliant: boolean;
    inAvoid: boolean;
    score: number;
    maxScore: number;
    advisoryNote: string;
    hasRoom: boolean;
}

// ─── Brahmasthan Analysis ─────────────────────────────────────────────────

export interface BrahmasthanViolation {
    room: RoomData;
    reason: string;
}

export function detectBrahmasthan(
    rooms: RoomData[], plotW: number, plotH: number
): BrahmasthanViolation[] {
    const violations: BrahmasthanViolation[] = [];
    const cx1 = plotW * 0.333, cx2 = plotW * 0.667;
    const cy1 = plotH * 0.333, cy2 = plotH * 0.667;

    rooms.forEach(room => {
        const { cx, cy } = getRoomCentroid(room);
        const inCenter = cx > cx1 && cx < cx2 && cy > cy1 && cy < cy2;
        if (!inCenter) return;

        const name = room.name.toLowerCase();
        if (name.includes('toilet') || name.includes('bathroom') || name.includes('bath') || name.includes('wc')) {
            violations.push({ room, reason: `Toilet in central (Brahmasthan) zone creates a functional planning conflict.` });
        } else if (name.includes('staircase')) {
            violations.push({ room, reason: `Staircase concentrated at the center disrupts circulation and load distribution.` });
        } else if (name.includes('kitchen')) {
            violations.push({ room, reason: `Kitchen at center increases plumbing and ventilation complexity.` });
        }
    });

    return violations;
}

// ─── Full Vastu Report ─────────────────────────────────────────────────────

export interface VastuReport {
    score: number; // 0–100
    breakdown: VastuCheckResult[];
    brahmasthanViolations: BrahmasthanViolation[];
    totalRulesChecked: number;
    mode: VastuMode;
    facing: VastuFacing;
    hasStructuralOverride: boolean;
}

/**
 * Main Vastu analysis entry point.
 * Returns a complete scored report for the given floor plan.
 */
export function runVastuAnalysis(
    floorPlan: RoomData[],
    plotW: number,
    plotH: number,
    facing: VastuFacing = 'North',
    mode: VastuMode = 'Hybrid',
): VastuReport {
    if (mode === 'Off') {
        return {
            score: 0,
            breakdown: [],
            brahmasthanViolations: [],
            totalRulesChecked: 0,
            mode,
            facing,
            hasStructuralOverride: false,
        };
    }

    // Ground floor only for Vastu (floor 0)
    const groundRooms = floorPlan.filter(r => r.floor === 0);

    const breakdown: VastuCheckResult[] = VASTU_RULES.map(rule => {
        const matchedRooms = groundRooms.filter(r => matchesRule(r, rule));

        if (matchedRooms.length === 0) {
            return {
                rule,
                rooms: [],
                zone: null,
                compliant: false,
                inAvoid: false,
                score: 0,
                maxScore: rule.weight,
                advisoryNote: `No ${rule.label} found in the plan. Adding one in the ${rule.preferred[0]} zone is recommended.`,
                hasRoom: false,
            };
        }

        // Evaluate each matched room; take the best result
        const results = matchedRooms.map(room => {
            const { cx, cy } = getRoomCentroid(room);
            const zone = getZone(cx, cy, plotW, plotH, facing);
            const inPreferred = rule.preferred.includes(zone);
            const inAcceptable = rule.acceptable.includes(zone);
            const inAvoid = rule.avoid.includes(zone);

            let score = 0;
            if (inPreferred) score = rule.weight;
            else if (inAcceptable) score = Math.round(rule.weight * 0.6);
            else if (!inAvoid) score = Math.round(rule.weight * 0.3);
            else score = Math.max(0, rule.weight - rule.avoidPenalty);

            // In Strict mode: no partial credit for acceptable zones
            if (mode === 'Strict' && !inPreferred) {
                score = inAvoid ? Math.max(0, rule.weight - rule.avoidPenalty) : Math.round(rule.weight * 0.2);
            }

            return { room, zone, score, inPreferred, inAcceptable, inAvoid };
        });

        // Use best-scoring room for overall result
        const best = results.reduce((b, r) => r.score > b.score ? r : b, results[0]);
        const compliant = mode === 'Strict' ? best.inPreferred : best.inPreferred || best.inAcceptable;

        return {
            rule,
            rooms: matchedRooms,
            zone: best.zone,
            compliant,
            inAvoid: best.inAvoid,
            score: best.score,
            maxScore: rule.weight,
            advisoryNote: getAdvisoryNote(rule.label, best.zone, rule, compliant),
            hasRoom: true,
        };
    });

    const totalScore = breakdown.reduce((s, r) => s + r.score, 0);
    const maxPossible = breakdown.reduce((s, r) => s + r.maxScore, 0);
    const score = Math.round((totalScore / (maxPossible || 1)) * 100);

    const brahmasthanViolations = detectBrahmasthan(groundRooms, plotW, plotH);

    // Structural override check: if staircase is in NE (structurally unsafe for Vastu but may be required)
    const staircaseCheck = breakdown.find(r => r.rule.roomKeyword.includes('staircase'));
    const hasStructuralOverride = !!(staircaseCheck?.inAvoid && staircaseCheck.rooms.length > 0);

    return {
        score,
        breakdown,
        brahmasthanViolations,
        totalRulesChecked: VASTU_RULES.length,
        mode,
        facing,
        hasStructuralOverride,
    };
}
