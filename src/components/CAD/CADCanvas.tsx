import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useAppState, BIMLayer, RoomData } from '../../context/AppContext';
import { CAD_GRID_SIZE, snapToGrid, getOrthoPoint, CADPoint } from '../../utils/cadEngine';
import { Hash } from 'lucide-react';

interface CADCanvasProps {
    tool: string;
    activeLayer: BIMLayer;
    viewMode: 'draft' | 'technical';
    zoom: number;
    setZoom: (v: number) => void;
    offset: CADPoint;
    setOffset: (v: CADPoint) => void;
    onSelect: (id: string | number | null) => void;
    selectedId: string | number | null;
}

const CADCanvas: React.FC<CADCanvasProps> = ({
    tool, activeLayer, viewMode, zoom, setZoom, offset, setOffset, onSelect, selectedId
}) => {
    const {
        floorPlan, state, setFloorPlan, updateBIMMetadata,
        plotWidth, plotHeight, plotSize
    } = useAppState();
    const svgRef = useRef<SVGSVGElement>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [lastMousePos, setLastMousePos] = useState<CADPoint | null>(null);
    const [previewLine, setPreviewLine] = useState<{ start: CADPoint; end: CADPoint } | null>(null);

    const screenToWorld = (clientX: number, clientY: number): CADPoint => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: (clientX - rect.left - offset.x) / zoom,
            y: (clientY - rect.top - offset.y) / zoom,
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || tool === 'pan') {
            setIsPanning(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
            return;
        }

        const worldPoint = screenToWorld(e.clientX, e.clientY);
        const snapped = snapToGrid(worldPoint);

        if (tool === 'wall' || tool === 'beam') {
            setPreviewLine({ start: snapped, end: snapped });
        }

        if (tool === 'column') {
            updateBIMMetadata('columns', `col-${Date.now()}`, {
                material: 'Concrete',
                structuralRole: 'load-bearing',
                width: 0.3,
                depth: 0.3,
                costContribution: 5000,
                orientation: `${snapped.x},${snapped.y}`
            });
        }

        if (tool === 'door' || tool === 'window') {
            // Find closest room edge
            let bestDist = 0.5; // Snap distance
            let bestOpening = null;

            for (const room of floorPlan) {
                const pts = [
                    { x: room.x, y: room.y },
                    { x: room.x + room.width, y: room.y },
                    { x: room.x + room.width, y: room.y + room.height },
                    { x: room.x, y: room.y + room.height }
                ];

                for (let i = 0; i < 4; i++) {
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % 4];

                    // Point-to-segment distance
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const mag = Math.sqrt(dx * dx + dy * dy);
                    const u = ((worldPoint.x - p1.x) * dx + (worldPoint.y - p1.y) * dy) / (mag * mag);

                    if (u >= 0 && u <= 1) {
                        const px = p1.x + u * dx;
                        const py = p1.y + u * dy;
                        const dist = Math.sqrt(Math.pow(worldPoint.x - px, 2) + Math.pow(worldPoint.y - py, 2));

                        if (dist < bestDist) {
                            bestDist = dist;
                            bestOpening = {
                                roomId: room.id,
                                wallIndex: i,
                                t: u,
                                type: tool
                            };
                        }
                    }
                }
            }

            if (bestOpening) {
                const id = `opening-${Date.now()}`;
                updateBIMMetadata('openings', id, {
                    material: tool === 'door' ? 'Wood' : 'Glass',
                    width: tool === 'door' ? 0.3 : 1.0,
                    height: 2.1,
                    orientation: `${bestOpening.roomId}:${bestOpening.wallIndex}:${bestOpening.t.toFixed(3)}`,
                    ventilationData: bestOpening.type // Using ventilationData to store subtype for now
                });
                onSelect(id);
            }
        }

        if (tool === 'select') {
            onSelect(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning && lastMousePos) {
            setOffset({
                x: offset.x + (e.clientX - lastMousePos.x),
                y: offset.y + (e.clientY - lastMousePos.y),
            });
            setLastMousePos({ x: e.clientX, y: e.clientY });
            return;
        }

        const worldPoint = screenToWorld(e.clientX, e.clientY);

        if (previewLine) {
            let snapped = snapToGrid(worldPoint);
            if (e.shiftKey) {
                snapped = getOrthoPoint(previewLine.start, snapped);
            }
            setPreviewLine({ ...previewLine, end: snapped });
        }
    };

    const handleMouseUp = () => {
        if (!previewLine || isPanning) {
            setIsPanning(false);
            return;
        }

        const { start, end } = previewLine;
        const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

        if (length > 0.1) {
            if (tool === 'wall') {
                const newRoom: RoomData = {
                    id: Date.now(),
                    name: `Room ${floorPlan.length + 1}`,
                    x: Math.min(start.x, end.x),
                    y: Math.min(start.y, end.y),
                    width: Math.abs(end.x - start.x),
                    height: Math.abs(end.y - start.y),
                    color: "#3b82f6",
                    area: Math.abs(end.x - start.x) * Math.abs(end.y - start.y),
                    floor: 0,
                    zone: 'public'
                };
                const newRooms = [...floorPlan, newRoom];
                setFloorPlan(newRooms, plotWidth, plotHeight, plotSize);
            }
        }

        setPreviewLine(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(zoom * delta, 5), 200);
        setZoom(newZoom);
    };

    const gridLines = useMemo(() => {
        const lines = [];
        const size = 100;
        const step = CAD_GRID_SIZE;
        for (let i = -size; i <= size; i += step) {
            lines.push(
                <line key={`v-${i}`} x1={i} y1={-size} x2={i} y2={size}
                    stroke={viewMode === 'technical' ? (i % 5 === 0 ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.03)") : (i % 5 === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)")}
                    strokeWidth={1 / zoom} />
            );
            lines.push(
                <line key={`h-${i}`} x1={-size} y1={i} x2={size} y2={i}
                    stroke={viewMode === 'technical' ? (i % 5 === 0 ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.03)") : (i % 5 === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)")}
                    strokeWidth={1 / zoom} />
            );
        }
        return lines;
    }, [zoom, viewMode]);

    return (
        <div className={`w-full h-full relative overflow-hidden cursor-crosshair transition-colors duration-500 ${viewMode === 'technical' ? 'bg-white' : 'bg-[#0f172a]'}`}>
            <svg
                ref={svgRef}
                className="w-full h-full"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
            >
                <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`}>
                    {/* Grid */}
                    {gridLines}

                    {/* Existing Rooms */}
                    {floorPlan.map((room) => (
                        <g
                            key={room.id}
                            opacity={state.bimLayers.architectural ? 1 : 0.2}
                            onClick={(e) => { e.stopPropagation(); onSelect(room.id); }}
                            className="cursor-pointer"
                        >
                            <rect
                                x={room.x}
                                y={room.y}
                                width={room.width}
                                height={room.height}
                                fill={viewMode === 'technical' ? "none" : (selectedId === room.id ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.1)")}
                                stroke={viewMode === 'technical' ? "#000" : (selectedId === room.id ? "#60a5fa" : "#3b82f6")}
                                strokeWidth={(selectedId === room.id ? 4 : 2) / zoom}
                            />
                            <text
                                x={room.x + room.width / 2}
                                y={room.y + room.height / 2}
                                fontSize={12 / zoom}
                                fill={viewMode === 'technical' ? "#000" : "#94a3b8"}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                style={{
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                    fontWeight: viewMode === 'technical' ? 'bold' : 'normal'
                                }}
                            >
                                {room.name}
                                {viewMode === 'technical' && <tspan x={room.x + room.width / 2} dy={15 / zoom} fontSize={10 / zoom}>{room.area.toFixed(1)} FT²</tspan>}
                            </text>
                        </g>
                    ))}

                    {/* BIM Columns */}
                    {Object.entries(state.bimModel.columns).map(([id, meta]) => {
                        const [cx, cy] = (meta.orientation || "0,0").split(',').map(Number);
                        return (
                            <rect
                                key={id}
                                onClick={(e) => { e.stopPropagation(); onSelect(id); }}
                                className="cursor-pointer"
                                x={cx - (meta.width || 0.3) / 2}
                                y={cy - (meta.depth || 0.3) / 2}
                                width={meta.width || 0.3}
                                height={meta.depth || 0.3}
                                fill={viewMode === 'technical' ? "#000" : (selectedId === id ? "#f87171" : "#fca5a5")}
                                stroke={viewMode === 'technical' ? "#000" : (selectedId === id ? "#ef4444" : "#f87171")}
                                strokeWidth={(selectedId === id ? 2 : 1) / zoom}
                                opacity={state.bimLayers.structural ? 1 : 0.1}
                            />
                        );
                    })}

                    {/* BIM Openings (Doors/Windows) */}
                    {Object.entries(state.bimModel.openings).map(([id, meta]) => {
                        const [roomIdStr, wallIdxStr, tStr] = (meta.orientation || "").split(':');
                        const roomId = Number(roomIdStr);
                        const wallIdx = Number(wallIdxStr);
                        const t = Number(tStr);
                        const room = floorPlan.find(r => r.id === roomId);
                        if (!room) return null;

                        const pts = [
                            { x: room.x, y: room.y },
                            { x: room.x + room.width, y: room.y },
                            { x: room.x + room.width, y: room.y + room.height },
                            { x: room.x, y: room.y + room.height }
                        ];
                        const p1 = pts[wallIdx];
                        const p2 = pts[(wallIdx + 1) % 4];
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const px = p1.x + dx * t;
                        const py = p1.y + dy * t;

                        const isSelected = selectedId === id;
                        const isDoor = meta.material === 'Wood';
                        const color = isDoor ? "#fb923c" : "#38bdf8";

                        return (
                            <g key={id} onClick={(e) => { e.stopPropagation(); onSelect(id); }} className="cursor-pointer">
                                <circle
                                    cx={px} cy={py} r={0.2}
                                    fill={isSelected ? "#fff" : color}
                                    stroke={color}
                                    strokeWidth={2 / zoom}
                                />
                                <line
                                    x1={px - (isDoor ? 0.15 : 0.5)}
                                    y1={py}
                                    x2={px + (isDoor ? 0.15 : 0.5)}
                                    y2={py}
                                    stroke={color}
                                    strokeWidth={4 / zoom}
                                    transform={`rotate(${Math.atan2(dy, dx) * 180 / Math.PI}, ${px}, ${py})`}
                                />
                            </g>
                        );
                    })}

                    {/* Preview Element */}
                    {previewLine && (
                        <line
                            x1={previewLine.start.x}
                            y1={previewLine.start.y}
                            x2={previewLine.end.x}
                            y2={previewLine.end.y}
                            stroke={viewMode === 'technical' ? "#000" : "#fbbf24"}
                            strokeWidth={3 / zoom}
                            strokeDasharray={5 / zoom}
                        />
                    )}

                    {/* Axis Labels */}
                    {viewMode === 'draft' && (
                        <>
                            <line x1={-100} y1={0} x2={100} y2={0} stroke="rgba(239, 68, 68, 0.3)" strokeWidth={1 / zoom} />
                            <line x1={0} y1={-100} x2={0} y2={100} stroke="rgba(34, 197, 94, 0.3)" strokeWidth={1 / zoom} />
                        </>
                    )}
                </g>
            </svg>

            {/* Internal Controls HUD */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <div className={`glass-card px-3 py-1.5 flex items-center gap-4 text-[10px] font-mono transition-colors ${viewMode === 'technical' ? '!bg-white/80 !text-black border-black/10' : '!bg-black/60 !text-white/70 border-white/10'}`}>
                    <div className="flex items-center gap-1.5">
                        <Hash className={`h-3 w-3 ${viewMode === 'technical' ? 'text-black' : 'text-primary'}`} />
                        GRID: {CAD_GRID_SIZE}m
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={viewMode === 'technical' ? 'text-black font-bold' : 'text-primary'}>ZOOM:</span> {(zoom / 10).toFixed(1)}x
                    </div>
                    <div className="flex items-center gap-1.5">
                        <kbd className={`px-1 rounded ${viewMode === 'technical' ? 'bg-black/10 text-black' : 'bg-white/10 text-white/50'}`}>SHIFT</kbd> Ortho Lock
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CADCanvas;
