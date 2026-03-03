import { QTOReport } from './bimEngine';
import { MaterialRequirement } from '../context/AppContext';

/**
 * Material Rates (Average Market Rates)
 * These can be updated to "real-time" via API in the future
 */
const RATES = {
    CEMENT: 450,        // Per 50kg bag
    STEEL: 72,         // Per kg
    BRICKS: 9,         // Per brick
    SAND: 65,          // Per cu ft
    AGGREGATE: 75,     // Per cu ft
    PAINT: 350,        // Per liter
    TILES: 85,         // Per sq ft
    PIPES: 120,        // Per meter
    FITTINGS: 1500,    // Per fixture group
    WIRE: 1250,        // Per coil (90m)
    SWITCHES: 85,      // Per unit
};

/**
 * Constants for volume to material conversion
 */
const CONCRETE_MIX = {
    CEMENT_BAGS_PER_M3: 8,
    SAND_CFT_PER_M3: 15,
    AGGREGATE_CFT_PER_M3: 30,
};

const BRICKWORK_MIX = {
    BRICKS_PER_M3: 500,
    CEMENT_BAGS_PER_M3: 1.2,
    SAND_CFT_PER_M3: 4.5,
};

export function calculateDetailedMaterials(qto: QTOReport): MaterialRequirement[] {
    const reqs: MaterialRequirement[] = [];

    // 1. Structural Materials (Concrete based)
    const structuralCement = qto.concreteVolume * CONCRETE_MIX.CEMENT_BAGS_PER_M3;
    const structuralSand = qto.concreteVolume * CONCRETE_MIX.SAND_CFT_PER_M3;
    const structuralAggregate = qto.concreteVolume * CONCRETE_MIX.AGGREGATE_CFT_PER_M3;
    const steelWeight = qto.steelEstimate;

    // 2. Brickwork Materials
    const bricksCount = qto.brickVolume * BRICKWORK_MIX.BRICKS_PER_M3;
    const brickworkCement = qto.brickVolume * BRICKWORK_MIX.CEMENT_BAGS_PER_M3;
    const brickworkSand = qto.brickVolume * BRICKWORK_MIX.SAND_CFT_PER_M3;

    // Totals
    const totalCementBags = Math.round(structuralCement + brickworkCement);
    const totalSandCft = Math.round(structuralSand + brickworkSand);
    const totalAggregateCft = Math.round(structuralAggregate);

    reqs.push({
        id: 'mat-cement',
        name: 'Cement (OPC/PPC)',
        quantity: totalCementBags,
        unit: 'Bags',
        rate: RATES.CEMENT,
        total: totalCementBags * RATES.CEMENT,
        category: 'structural'
    });

    reqs.push({
        id: 'mat-steel',
        name: 'TMT Steel Bars',
        quantity: Math.round(steelWeight),
        unit: 'Kg',
        rate: RATES.STEEL,
        total: Math.round(steelWeight) * RATES.STEEL,
        category: 'structural'
    });

    reqs.push({
        id: 'mat-bricks',
        name: 'First Class Red Bricks',
        quantity: Math.round(bricksCount),
        unit: 'Nos',
        rate: RATES.BRICKS,
        total: Math.round(bricksCount) * RATES.BRICKS,
        category: 'structural'
    });

    reqs.push({
        id: 'mat-sand',
        name: 'Coarse Sand (M-Sand)',
        quantity: totalSandCft,
        unit: 'Cu.Ft',
        rate: RATES.SAND,
        total: totalSandCft * RATES.SAND,
        category: 'structural'
    });

    reqs.push({
        id: 'mat-aggregate',
        name: 'Crushed Aggregate (20mm)',
        quantity: totalAggregateCft,
        unit: 'Cu.Ft',
        rate: RATES.AGGREGATE,
        total: totalAggregateCft * RATES.AGGREGATE,
        category: 'structural'
    });

    // 3. Finishing Materials
    const paintLiters = Math.round(qto.paintArea / 10); // ~10m2 per liter
    const tilesSqFt = Math.round(qto.tileArea * 10.764); // m2 to sqft

    reqs.push({
        id: 'mat-paint',
        name: 'Premium Interior Paint',
        quantity: paintLiters,
        unit: 'Liters',
        rate: RATES.PAINT,
        total: paintLiters * RATES.PAINT,
        category: 'painting'
    });

    reqs.push({
        id: 'mat-tiles',
        name: 'Vitrified Floor Tiles',
        quantity: tilesSqFt,
        unit: 'Sq.Ft',
        rate: RATES.TILES,
        total: tilesSqFt * RATES.TILES,
        category: 'finishing'
    });

    // 4. Plumbing Materials
    const wetAreas = qto.wetAreaCount || 1;
    const pipeMeters = Math.round(qto.totalArea * 0.5); // Proxy

    reqs.push({
        id: 'mat-pipes',
        name: 'CPVC/PVC Plumbing Pipes',
        quantity: pipeMeters,
        unit: 'Meters',
        rate: RATES.PIPES,
        total: pipeMeters * RATES.PIPES,
        category: 'plumbing'
    });

    reqs.push({
        id: 'mat-fittings',
        name: 'Taps & Sanitary Fittings',
        quantity: wetAreas,
        unit: 'Sets',
        rate: RATES.FITTINGS,
        total: wetAreas * RATES.FITTINGS,
        category: 'plumbing'
    });

    // 5. Electrical Materials
    const wireCoils = Math.max(1, Math.round(qto.totalArea / 50)); // 1 coil per 50 sqft approx
    const switchesCount = Math.round(qto.totalArea / 10); // 1 switch per 10 sqft approx

    reqs.push({
        id: 'mat-wire',
        name: 'Copper Wiring (FR/LHS)',
        quantity: wireCoils,
        unit: 'Coils',
        rate: RATES.WIRE,
        total: wireCoils * RATES.WIRE,
        category: 'electrical'
    });

    reqs.push({
        id: 'mat-switches',
        name: 'Modular Switches & Plates',
        quantity: switchesCount,
        unit: 'Nos',
        rate: RATES.SWITCHES,
        total: switchesCount * RATES.SWITCHES,
        category: 'electrical'
    });

    return reqs;
}
