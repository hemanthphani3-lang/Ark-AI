import * as THREE from 'three';
import { RoomData, BIMMetadata } from '../context/AppContext';

export interface CADPoint {
    x: number;
    y: number;
}

export interface CADElement {
    id: string;
    type: 'wall' | 'column' | 'beam' | 'door' | 'window' | 'dimension' | 'text';
    points: CADPoint[];
    metadata: BIMMetadata;
    layer: string;
    isSelected?: boolean;
}

export const CAD_GRID_SIZE = 0.5; // 0.5 meter grid

/**
 * Snaps a point to the nearest grid intersection
 */
export function snapToGrid(point: CADPoint, gridSize: number = CAD_GRID_SIZE): CADPoint {
    return {
        x: Math.round(point.x / gridSize) * gridSize,
        y: Math.round(point.y / gridSize) * gridSize,
    };
}

/**
 * Calculates orthogonal point relative to origin (Shift-lock)
 */
export function getOrthoPoint(origin: CADPoint, target: CADPoint): CADPoint {
    const dx = Math.abs(target.x - origin.x);
    const dy = Math.abs(target.y - origin.y);

    if (dx > dy) {
        return { x: target.x, y: origin.y };
    } else {
        return { x: origin.x, y: target.y };
    }
}

/**
 * Calculate distance between two points
 */
export function getDistance(p1: CADPoint, p2: CADPoint): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculate area of a polygon using Shoelace formula
 */
export function calculatePolygonArea(points: CADPoint[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

/**
 * Formats a distance value to feet or meters
 */
export function formatDistance(meters: number, unit: 'm' | 'ft' = 'm'): string {
    if (unit === 'ft') {
        const feet = meters * 3.28084;
        return `${feet.toFixed(2)}'`;
    }
    return `${meters.toFixed(2)}m`;
}

/**
 * Check if a point is within a certain distance of a line segment
 */
export function isPointNearSegment(p: CADPoint, s1: CADPoint, s2: CADPoint, threshold: number = 0.1): boolean {
    const l2 = Math.pow(getDistance(s1, s2), 2);
    if (l2 === 0) return getDistance(p, s1) < threshold;

    let t = ((p.x - s1.x) * (s2.x - s1.x) + (p.y - s1.y) * (s2.y - s1.y)) / l2;
    t = Math.max(0, Math.min(1, t));

    const projection = {
        x: s1.x + t * (s2.x - s1.x),
        y: s1.y + t * (s2.y - s1.y)
    };

    return getDistance(p, projection) < threshold;
}
