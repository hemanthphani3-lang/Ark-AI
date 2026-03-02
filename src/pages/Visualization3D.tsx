import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, ContactShadows, OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useAppState, RoomData } from '@/context/AppContext';
import { Rotate3d, Compass } from 'lucide-react';

const WALL_HEIGHT = 0.9;
const WALL_THICKNESS = 0.06;
const SLAB_HEIGHT = 0.1;

function isBathroomRoom(name: string): boolean {
  const n = name.toLowerCase();
  return /(bathroom|bath|toilet|washroom|powder room|\bwc\b|attached|ensuite|lavatory|restroom)/i.test(n);
}

function isOpenSpaceRoom(name: string): boolean {
  const n = name.toLowerCase();
  return ["terrace", "balcony", "veranda", "porch", "deck", "garden", "lawn", "open"].some(k => n.includes(k));
}

/* ─── Single room at a given Y offset ─── */
function Room3D({ room, scale, offsetX, offsetZ, yBase, allFloorRooms }: {
  room: RoomData; scale: number; offsetX: number; offsetZ: number;
  yBase: number; allFloorRooms: RoomData[];
}) {
  const y0 = yBase;
  const color = new THREE.Color(room.color);
  const isCore = room.zone === "core";

  const pts = useMemo(() => {
    if (room.polygon && room.polygon.length > 0) {
      return room.polygon.map(p => new THREE.Vector2(p.x * scale - offsetX, p.y * scale - offsetZ));
    }
    const nx = room.x * scale - offsetX;
    const nz = room.y * scale - offsetZ;
    const nw = room.width * scale;
    const nd = room.height * scale;
    return [
      new THREE.Vector2(nx, nz),
      new THREE.Vector2(nx + nw, nz),
      new THREE.Vector2(nx + nw, nz + nd),
      new THREE.Vector2(nx, nz + nd),
    ];
  }, [room, scale, offsetX, offsetZ]);

  const floorShape = useMemo(() => {
    const shape = new THREE.Shape();
    if (pts.length > 0) {
      shape.moveTo(pts[0].x, -pts[0].y);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].y);
      shape.lineTo(pts[0].x, -pts[0].y);
    }
    return shape;
  }, [pts]);

  const wallSegments = useMemo(() => {
    const segs = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const length = p1.distanceTo(p2);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const cx = (p1.x + p2.x) / 2;
      const cz = (p1.y + p2.y) / 2;
      segs.push({ cx, cz, length, angle });
    }
    return segs;
  }, [pts]);

  let cx = 0, cz = 0;
  pts.forEach(p => { cx += p.x; cz += p.y; });
  if (pts.length > 0) { cx /= pts.length; cz /= pts.length; }

  if (isCore) {
    const RAILING_HEIGHT = 0.3;
    return (
      <group>
        <mesh position={[0, y0 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[floorShape]} />
          <meshStandardMaterial color="#334155" opacity={0.9} transparent />
        </mesh>
        {wallSegments.map((seg, i) => (
          <mesh key={`rail-${i}`} position={[seg.cx, y0 + RAILING_HEIGHT / 2, seg.cz]} rotation={[0, -seg.angle, 0]}>
            <boxGeometry args={[seg.length, RAILING_HEIGHT, 0.08]} />
            <meshStandardMaterial color="#94a3b8" opacity={0.65} transparent />
          </mesh>
        ))}
        <Text position={[cx, y0 + 0.1, cz]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.5} color="#94a3b8" anchorX="center" anchorY="middle">▲</Text>
      </group>
    );
  }

  const isOpenSpace = ["Entrance Foyer", "Corridor", "Staircase", "Balcony", "Veranda", "Open Terrace", "Foyer", "Porch"].some(n => room.name.includes(n));
  let bestSegmentIdx = -1;
  let requiresExteriorDoor = false;

  const isBathroom = isBathroomRoom(room.name);

  // Door probing logic - Sophisticated parametric overlap sync'd from FinalLook.tsx
  const segmentDoorData = wallSegments.map((seg, i) => {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dxS = p2.x - p1.x;
    const dzS = p2.y - p1.y;
    const len = seg.length;
    if (len < 0.01) return [];

    const ux = dxS / len;
    const uz = dzS / len;
    const nx = Math.sin(seg.angle);
    const nz = -Math.cos(seg.angle);
    const doors: { doorCenterT: number; doorWidth: number }[] = [];
    const detectedRoomIds = new Set<string | number>();

    for (let t = 0.15; t < len; t += 0.3) {
      const px = p1.x + ux * t;
      const pz = p1.y + uz * t;
      const testPoints = [{ x: px + nx * 0.15, z: pz + nz * 0.15 }, { x: px - nx * 0.15, z: pz - nz * 0.15 }];

      for (const other of allFloorRooms) {
        if (other.id === room.id || detectedRoomIds.has(other.id)) continue;
        const isCustomConnected = room.customConnections?.includes(other.id) || other.customConnections?.includes(room.id);
        if (!isCustomConnected) continue;

        const ox = other.x * scale - offsetX;
        const oz = other.y * scale - offsetZ;
        const ow = other.width * scale;
        const od = other.height * scale;
        const pad = 0.2;

        if (testPoints.some(tp => tp.x >= ox - pad && tp.x <= ox + ow + pad && tp.z >= oz - pad && tp.z <= oz + od + pad)) {
          // Parametric overlap calculation logic from FinalLook.tsx
          const otherPts2D = other.polygon && other.polygon.length > 0
            ? other.polygon.map(p => ({ x: p.x * scale - offsetX, z: p.y * scale - offsetZ }))
            : [{ x: ox, z: oz }, { x: ox + ow, z: oz }, { x: ox + ow, z: oz + od }, { x: ox, z: oz + od }];

          let globalMinT = Infinity;
          let globalMaxT = -Infinity;
          for (let k = 0; k < otherPts2D.length; k++) {
            const op1 = otherPts2D[k];
            const op2 = otherPts2D[(k + 1) % otherPts2D.length];
            const ta = (op1.x - p1.x) * ux + (op1.z - p1.y) * uz;
            const tb = (op2.x - p1.x) * ux + (op2.z - p1.y) * uz;
            const overlapMin = Math.max(0, Math.min(ta, tb));
            const overlapMax = Math.min(len, Math.max(ta, tb));
            if (overlapMax - overlapMin > 0.2) {
              if (overlapMin < globalMinT) globalMinT = overlapMin;
              if (overlapMax > globalMaxT) globalMaxT = overlapMax;
            }
          }

          if (globalMaxT > globalMinT) {
            const overlapLen = globalMaxT - globalMinT;
            const dWidth = overlapLen < 0.6 ? overlapLen / 2 : 0.6;
            doors.push({ doorCenterT: (globalMinT + globalMaxT) / 2, doorWidth: dWidth });
            detectedRoomIds.add(other.id);
          }
          break;
        }
      }
    }
    return doors.sort((a, b) => a.doorCenterT - b.doorCenterT);
  });

  if (!isOpenSpace && !isBathroom) {
    if (room.id % 1000 === 0 || room.id === allFloorRooms[0]?.id) requiresExteriorDoor = true;
    if (requiresExteriorDoor) {
      let maxZ = -Infinity;
      for (let j = 0; j < wallSegments.length; j++) {
        const ws = wallSegments[j];
        const isHorizontal = Math.abs(ws.angle) < 0.2 || Math.abs(Math.abs(ws.angle) - Math.PI) < 0.2;
        if (isHorizontal && ws.cz > maxZ) { maxZ = ws.cz; bestSegmentIdx = j; }
      }
    }
  }

  return (
    <group>
      <mesh position={[0, y0 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color={color} opacity={0.18} transparent />
      </mesh>

      {!isOpenSpace && (() => {
        let bathroomDoorCarved = false;
        return wallSegments.map((seg, i) => {
          const normalX = Math.sin(seg.angle);
          const normalZ = -Math.cos(seg.angle);
          const testX = seg.cx + normalX * 0.1;
          const testZ = seg.cz + normalZ * 0.1;

          let facesOpenSpace = false;
          const facesInternalRoom = allFloorRooms.some(other => {
            if (other.id === room.id) return false;
            const ox = other.x * scale - offsetX, oz = other.y * scale - offsetZ;
            const ow = other.width * scale, od = other.height * scale;
            const isInside = testX > ox && testX < ox + ow && testZ > oz && testZ < oz + od;
            if (isInside && isOpenSpaceRoom(other.name)) facesOpenSpace = true;
            return isInside;
          });

          const isExposed = !facesInternalRoom || facesOpenSpace;
          let doors = segmentDoorData[i] || [];

          if (isBathroom) {
            if (isExposed) doors = [];
            else if (doors.length > 0) {
              if (bathroomDoorCarved) doors = [];
              else { doors = [doors[0]]; bathroomDoorCarved = true; }
            }
          }

          const isExteriorFallbackDoor = (i === bestSegmentIdx && doors.length === 0 && !isBathroom);
          const doorSpans = doors.map(d => ({ startT: d.doorCenterT - d.doorWidth / 2, endT: d.doorCenterT + d.doorWidth / 2 }));
          if (isExteriorFallbackDoor) {
            const DOOR_W = 1.2;
            doorSpans.push({ startT: seg.length / 2 - DOOR_W / 2, endT: seg.length / 2 + DOOR_W / 2 });
          }

          const wallPillars = [];
          let currentT = 0;
          doorSpans.sort((a, b) => a.startT - b.startT).forEach(span => {
            if (span.startT > currentT + 0.01) wallPillars.push({ s: currentT, e: span.startT });
            currentT = Math.max(currentT, span.endT);
          });
          if (currentT < seg.length - 0.01) wallPillars.push({ s: currentT, e: seg.length });

          return (
            <group key={i} position={[seg.cx, y0, seg.cz]} rotation={[0, -seg.angle, 0]}>
              {wallPillars.map((p, pi) => (
                <mesh key={pi} position={[(p.s + p.e) / 2 - seg.length / 2, WALL_HEIGHT / 2, 0]}>
                  <boxGeometry args={[p.e - p.s + (pi === 0 || pi === wallPillars.length - 1 ? WALL_THICKNESS : 0), WALL_HEIGHT, WALL_THICKNESS]} />
                  <meshStandardMaterial color={color} opacity={0.65} transparent />
                </mesh>
              ))}
            </group>
          );
        });
      })()}
      <Text position={[cx, y0 + 0.08, cz]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.4} color="white" anchorX="center" anchorY="middle">{room.name}</Text>
    </group>
  );
}

function Storey({ rooms, houseBounds, floorIndex, scaleFactor, floorMap }: {
  rooms: RoomData[]; houseBounds: any; floorIndex: number; scaleFactor: number;
  floorMap: Record<number, RoomData[]>;
}) {
  const offsetX = houseBounds.centerX * scaleFactor;
  const offsetZ = houseBounds.centerY * scaleFactor;
  const yBase = floorIndex * (WALL_HEIGHT + SLAB_HEIGHT);

  const slabShape = useMemo(() => {
    const shape = new THREE.Shape();
    const pw = houseBounds.width * scaleFactor + 1;
    const ph = houseBounds.height * scaleFactor + 1;
    shape.moveTo(-pw / 2, -ph / 2);
    shape.lineTo(pw / 2, -ph / 2);
    shape.lineTo(pw / 2, ph / 2);
    shape.lineTo(-pw / 2, ph / 2);
    shape.lineTo(-pw / 2, -ph / 2);

    [...(floorMap[floorIndex] || []), ...(floorMap[floorIndex - 1] || [])]
      .filter(r => r.zone === "core" || r.name.toLowerCase().includes("staircase"))
      .forEach(room => {
        const holePath = new THREE.Path();
        const nx = room.x * scaleFactor - offsetX, nz = room.y * scaleFactor - offsetZ;
        const nw = room.width * scaleFactor, nd = room.height * scaleFactor;
        holePath.moveTo(nx, -nz); holePath.lineTo(nx + nw, -nz); holePath.lineTo(nx + nw, -(nz + nd)); holePath.lineTo(nx, -(nz + nd)); holePath.lineTo(nx, -nz);
        shape.holes.push(holePath);
      });
    return shape;
  }, [rooms, houseBounds, scaleFactor, offsetX, offsetZ, floorMap, floorIndex]);

  return (
    <group>
      <mesh position={[0, yBase, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[slabShape]} />
        <meshStandardMaterial color={floorIndex === 0 ? "#1e293b" : "#263046"} />
      </mesh>
      {rooms.map(room => (
        <Room3D key={room.id} room={room} scale={scaleFactor} offsetX={offsetX} offsetZ={offsetZ} yBase={yBase} allFloorRooms={rooms} />
      ))}
      <mesh position={[0, yBase + WALL_HEIGHT + SLAB_HEIGHT / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[slabShape]} />
        <meshStandardMaterial color="#334155" opacity={0.25} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function MultiFloorBuilding() {
  const { floorPlan } = useAppState();
  const groupRef = useRef<THREE.Group>(null);
  const scaleFactor = 0.1;

  useFrame((_, delta) => {
    // Manual rotation removed in favor of OrbitControls autoRotate
  });

  const houseBounds = useMemo(() => {
    if (!floorPlan.length) return { width: 10, height: 10, centerX: 0, centerY: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    floorPlan.forEach(r => {
      minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.width);
      minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.height);
    });
    return { width: maxX - minX, height: maxY - minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
  }, [floorPlan]);

  const floorMap: Record<number, RoomData[]> = {};
  floorPlan.forEach(r => { if (!floorMap[r.floor]) floorMap[r.floor] = []; floorMap[r.floor].push(r); });

  return (
    <group ref={groupRef}>
      {Object.entries(floorMap).map(([fi, rooms]) => {
        const fIdx = parseInt(fi);
        return <Storey key={fIdx} rooms={rooms} houseBounds={houseBounds} floorIndex={fIdx} scaleFactor={scaleFactor} floorMap={floorMap} />;
      })}
    </group>
  );
}

export default function Visualization3D() {
  const [autoRotate, setAutoRotate] = React.useState(true);

  return (
    <div className="w-full h-screen bg-[#0a0a0a]">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[12, 10, 12]} fov={40} />
        <OrbitControls
          makeDefault
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.1}
          autoRotate={autoRotate}
          autoRotateSpeed={2.0}
        />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 15, 10]} intensity={1.2} castShadow />
        <spotLight position={[-10, 20, -10]} angle={0.3} penumbra={1} intensity={1} castShadow />

        <React.Suspense fallback={null}>
          <MultiFloorBuilding />
          <ContactShadows resolution={1024} scale={20} blur={2} opacity={0.4} far={10} color="#000000" />
          <Environment preset="city" />
        </React.Suspense>

        <gridHelper args={[50, 50, "#222", "#111"]} position={[0, -0.1, 0]} />
      </Canvas>
      <div className="absolute top-6 left-6 z-10">
        <h1 className="text-xl font-bold text-white tracking-widest uppercase">Structural Preview</h1>
        <p className="text-[10px] text-primary font-bold uppercase tracking-widest mt-1">Live Architectural Engine Output</p>
      </div>

      {/* 360 Control */}
      <div className="absolute top-6 right-6 z-10 flex gap-2">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 ${autoRotate
              ? "bg-primary text-primary-foreground border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)]"
              : "bg-black/60 text-white/70 border-white/20 hover:border-white/40"
            }`}
        >
          <Rotate3d className={`h-4 w-4 ${autoRotate ? "animate-spin-slow" : ""}`} />
          <span className="text-[10px] font-black uppercase tracking-tighter">
            {autoRotate ? "360° SPIN ON" : "360° SPIN OFF"}
          </span>
        </button>
      </div>
    </div>
  );
}
