import { RoomData, BIMModel, BIMMetadata } from '../context/AppContext';

export interface QTOReport {
    concreteVolume: number; // m3
    brickVolume: number;    // m3
    steelEstimate: number;  // kg
    tileArea: number;       // m2
    paintArea: number;      // m2
    plumbingPoints: number;
}

export interface ClashWarning {
    id: string;
    type: 'overlap' | 'functional' | 'structural';
    severity: 'low' | 'medium' | 'high';
    message: string;
    elements: (string | number)[];
}

const SCALE = 0.1; // 0.1 unit = 1ft
const FT_TO_M = 0.3048;

/**
 * Calculates Quantity Take-Off based on current floor plan and BIM metadata
 */
export function calculateQTO(floorPlan: RoomData[], bimModel: BIMModel): QTOReport {
    let concreteVolume = 0;
    let brickVolume = 0;
    let tileArea = 0;
    let paintArea = 0;
    let plumbingPoints = 0;

    floorPlan.forEach(room => {
        const areaSqFt = room.width * room.height;
        const areaM2 = areaSqFt * FT_TO_M * FT_TO_M;

        // 1. Tile Area
        if (!room.name.toLowerCase().includes("balcony") && !room.name.toLowerCase().includes("terrace")) {
            tileArea += areaM2;
        }

        // 2. Concrete (Slabs)
        const slabHeight = bimModel.slabs[room.floor]?.thickness || 0.1;
        concreteVolume += areaM2 * (slabHeight * FT_TO_M);

        // 3. Paint & Brick (Walls)
        const perimeterFt = 2 * (room.width + room.height);
        const wallHeight = bimModel.walls[room.id]?.height || 0.9; // 9ft
        const wallThickness = bimModel.walls[room.id]?.thickness || 0.06; // ~7 inch

        const wallSurfaceAreaM2 = perimeterFt * FT_TO_M * (wallHeight * FT_TO_M);
        paintArea += wallSurfaceAreaM2 * 2; // both sides approx
        brickVolume += (perimeterFt * FT_TO_M) * (wallHeight * FT_TO_M) * (wallThickness * FT_TO_M);

        // 4. Plumbing
        if (room.isWetArea || room.name.toLowerCase().includes("bath") || room.name.toLowerCase().includes("toilet")) {
            plumbingPoints += 4; // average points per wet room
        }
    });

    // Calculate Column Concrete
    Object.values(bimModel.columns).forEach(col => {
        const vol = (col.width || 0.1) * (col.depth || 0.1) * (col.height || 0.9) * Math.pow(FT_TO_M, 3);
        concreteVolume += vol;
    });

    // Steel Estimate: Roughly 80kg per m3 of concrete for residential
    const steelEstimate = concreteVolume * 80;

    return {
        concreteVolume,
        brickVolume,
        steelEstimate,
        tileArea,
        paintArea,
        plumbingPoints
    };
}

/**
 * Basic Clash Detection logic
 */
export function detectClashes(floorPlan: RoomData[]): ClashWarning[] {
    const clashes: ClashWarning[] = [];

    // 1. Functional Clash: Toilet above Pooja
    const toilets = floorPlan.filter(r => r.name.toLowerCase().includes("toilet") || r.name.toLowerCase().includes("bath"));
    const poojaRooms = floorPlan.filter(r => r.name.toLowerCase().includes("pooja"));

    toilets.forEach(toilet => {
        poojaRooms.forEach(pooja => {
            if (toilet.floor === pooja.floor + 1) {
                // Simple bounding box check for vertical overlap
                if (
                    toilet.x < pooja.x + pooja.width &&
                    toilet.x + toilet.width > pooja.x &&
                    toilet.y < pooja.y + pooja.height &&
                    toilet.y + toilet.height > pooja.y
                ) {
                    clashes.push({
                        id: `clash-pooja-${toilet.id}-${pooja.id}`,
                        type: 'functional',
                        severity: 'high',
                        message: "Privacy/Vastu Conflict: Toilet located directly above Pooja room.",
                        elements: [toilet.id, pooja.id]
                    });
                }
            }
        });
    });

    // 2. Circulation Clash: Door swing or overlap (conceptual for now)
    // 3. Structural Clash: Staircase vs Beam (checking for floor openings)

    return clashes;
}
