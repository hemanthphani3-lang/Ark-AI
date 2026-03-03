import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Environment, ContactShadows, PointerLockControls, Sky } from "@react-three/drei";
import { useRef, useState, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useAppState, BIMLayer, RoomData, BIMModel } from '../context/AppContext';
import { Link } from "react-router-dom";
import { ArrowLeft, Paintbrush, Sun, Moon, Footprints, Shield, Layers, Eye, EyeOff, Rotate3d } from "lucide-react";

const WALL_HEIGHT = 0.9; // 9ft (scale: 0.1 = 1ft)
const DOOR_HEIGHT = 0.7; // 7ft
const SLAB_HEIGHT = 0.1; // 1ft slab thickness
const WALL_THICKNESS = 0.06; // ~7 inches
const TRIM_HEIGHT = 0.04; // ~5 inch baseboard
const TRIM_THICKNESS = 0.01; // ~1 inch thick trim

const PAINT_THEMES: Record<string, { name: string; walls: string; accent: string; floor: string; roof: string; trim: string }> = {
  modern: { name: "Midnight Navy", walls: "#1e293b", accent: "#3b82f6", floor: "#c4a882", roof: "#0f172a", trim: "#94a3b8" },
  luxury: { name: "Luxury Gold", walls: "#171717", accent: "#b8860b", floor: "#3e2723", roof: "#0a0a0a", trim: "#d4af37" },
  forest: { name: "Emerald Forest", walls: "#064e3b", accent: "#10b981", floor: "#78350f", roof: "#022c22", trim: "#34d399" },
  warm: { name: "Warm Terracotta", walls: "#7c2d12", accent: "#f97316", floor: "#8b6914", roof: "#451a03", trim: "#fbbf24" },
  scandi: { name: "Nordic Slate", walls: "#f8fafc", accent: "#475569", floor: "#94a3b8", roof: "#1e293b", trim: "#cbd5e1" },
  minimalist: { name: "Zen White", walls: "#fdfcf0", accent: "#d4d4d4", floor: "#e5e5e5", roof: "#262626", trim: "#a3a3a3" },
  oceanic: { name: "Deep Sea", walls: "#0f172a", accent: "#0ea5e9", floor: "#0c4a6e", roof: "#020617", trim: "#38bdf8" },
  industrial: { name: "Urban Concrete", walls: "#404040", accent: "#ef4444", floor: "#171717", roof: "#0a0a0a", trim: "#d1d5db" },
  desert: { name: "Sand & Clay", walls: "#d6b591", accent: "#9a3412", floor: "#78350f", roof: "#431407", trim: "#c2410c" },
};

const ROOM_PAINT: Record<string, string> = {
  "Living Room": "#f0ead6",
  "Master Bedroom": "#e8e0f0",
  "Kitchen": "#fff8e7",
  "Bathroom": "#e0f0f0",
  "Bedroom": "#e6ecf0",
  "Dining Room": "#f5efe0",
  "Study Room": "#e8ebe4",
  "Guest Room": "#f0e8e0",
  "Pooja Room": "#fff0e0",
  "Balcony": "#e4ede0",
};

function isBathroomRoom(name: string): boolean {
  const n = name.toLowerCase();
  // Match keywords like bathroom, bath, toilet, wc, washroom, etc.
  return /(bathroom|bath|toilet|washroom|powder room|\bwc\b|attached|ensuite|lavatory|restroom)/i.test(n);
}

function isOpenSpaceRoom(name: string): boolean {
  const n = name.toLowerCase();
  return ["terrace", "balcony", "veranda", "porch", "deck", "garden", "lawn", "open"].some(k => n.includes(k));
}

function getRoomPaint(roomName: string, theme: string): string {
  const themeData = PAINT_THEMES[theme];
  const themeColor = new THREE.Color(themeData.walls);

  let baseColorHex = themeData.walls;
  for (const [key, color] of Object.entries(ROOM_PAINT)) {
    if (roomName.toLowerCase().includes(key.toLowerCase())) {
      baseColorHex = color;
      break;
    }
  }

  const baseColor = new THREE.Color(baseColorHex);
  // Blend theme color (50%) with room specific color (50%) for a balanced look
  themeColor.lerp(baseColor, 0.5);

  return `#${themeColor.getHexString()}`;
}

function FirstPersonCamera({ isActive, rooms, scale, offsetX, offsetZ, plotW, plotH, onPlaceWindow, onDeleteWindow }: {
  isActive: boolean; rooms: RoomData[]; scale: number; offsetX: number; offsetZ: number; plotW: number; plotH: number;
  onPlaceWindow: (pos: THREE.Vector3, normal: THREE.Vector3) => void;
  onDeleteWindow: (id: string) => void;
}) {
  const { camera, scene } = useThree();
  const moveSpeed = 0.035;
  const COLLISION_MARGIN = 0.15;
  const keys = useRef<Record<string, boolean>>({});
  const raycaster = useRef(new THREE.Raycaster());

  // Teleport to entrance when activated
  useEffect(() => {
    if (isActive) {
      const groundRooms = rooms.filter(r => r.floor === 0);
      const livingRoom = groundRooms.find(r => r.name.toLowerCase().includes("living room")) || groundRooms[0] || rooms[0];
      if (livingRoom) {
        camera.position.set(
          (livingRoom.x + livingRoom.width / 2) * scale - offsetX,
          0.8,
          (livingRoom.y + livingRoom.height / 2) * scale - offsetZ
        );
        camera.lookAt(0, 0.8, 0);
      }
    }
  }, [isActive, rooms, camera, scale, offsetX, offsetZ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const handleClick = () => {
      if (!isActive) return;
      raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
      const intersects = raycaster.current.intersectObjects(scene.children, true);
      const windowHit = intersects.find(i => {
        let curr: THREE.Object3D | null = i.object;
        while (curr) {
          if (curr.name === "custom-window") return true;
          curr = curr.parent;
        }
        return false;
      });
      if (windowHit) {
        let curr: THREE.Object3D | null = windowHit.object;
        while (curr) {
          if (curr.name === "custom-window" && curr.userData.windowId) {
            onDeleteWindow(curr.userData.windowId);
            return;
          }
          curr = curr.parent;
        }
      }
      const wallHit = intersects.find(i => i.object.type === "Mesh" && (i.object as THREE.Mesh).geometry.type === "BoxGeometry");
      if (wallHit && wallHit.distance < 5 && wallHit.face) {
        const worldQuaternion = new THREE.Quaternion();
        wallHit.object.getWorldQuaternion(worldQuaternion);
        const worldNormal = wallHit.face.normal.clone().applyQuaternion(worldQuaternion);
        if (Math.abs(worldNormal.y) < 0.1) {
          onPlaceWindow(wallHit.point, worldNormal);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("click", handleClick);
    };
  }, [isActive, camera, scene, onPlaceWindow, onDeleteWindow]);

  const isPositionValid = (pos: THREE.Vector3) => {
    const tx = (pos.x + offsetX) / scale;
    const tz = (pos.z + offsetZ) / scale;
    const currentFloor = Math.floor(pos.y / 1.0);
    const isInsideRoom = rooms.some(r => {
      const isRoomFloorValid = r.floor === currentFloor ||
        (r.name.toLowerCase().includes("staircase") && Math.abs(currentFloor - r.floor) <= 1);
      if (!isRoomFloorValid) return false;
      return (
        tx >= r.x - COLLISION_MARGIN &&
        tx <= r.x + r.width + COLLISION_MARGIN &&
        tz >= r.y - COLLISION_MARGIN &&
        tz <= r.y + r.height + COLLISION_MARGIN
      );
    });
    const isOutsidePlot = currentFloor === 0 && (tx >= -30 && tx <= plotW + 30 && tz >= -30 && tz <= plotH + 30);
    return isInsideRoom || isOutsidePlot;
  };

  const down = useMemo(() => new THREE.Vector3(0, -1, 0), []);
  const targetY = useRef(0.55);

  useFrame((state, delta) => {
    if (!isActive) return;
    const direction = new THREE.Vector3();
    const frontVector = new THREE.Vector3(0, 0, (keys.current["KeyS"] ? 1 : 0) - (keys.current["KeyW"] ? 1 : 0));
    const sideVector = new THREE.Vector3((keys.current["KeyD"] ? 1 : 0) - (keys.current["KeyA"] ? 1 : 0), 0, 0);
    const upVector = new THREE.Vector3(0, (keys.current["Space"] ? 1 : 0) - (keys.current["ShiftLeft"] || keys.current["Shift"] ? 1 : 0), 0);

    // Create move vector based on view direction
    const moveVector = new THREE.Vector3().addVectors(frontVector, sideVector).normalize().multiplyScalar(moveSpeed);
    moveVector.applyQuaternion(camera.quaternion);

    const verticalMove = upVector.multiplyScalar(moveSpeed);
    const isInStaircase = rooms.some(r => r.name.toLowerCase().includes("staircase") &&
      Math.abs(camera.position.y / 1.0 - r.floor) < 1.2);

    // Prevent vertical drift from WASD unless on a slope
    if (!isInStaircase && verticalMove.y === 0) {
      moveVector.y = 0;
    } else {
      moveVector.add(verticalMove);
    }

    if (moveVector.lengthSq() > 0) {
      const nextFullPos = camera.position.clone().add(moveVector);
      if (isPositionValid(nextFullPos)) {
        camera.position.add(moveVector);
      } else {
        const nextXPos = camera.position.clone().add(new THREE.Vector3(moveVector.x, 0, 0));
        if (isPositionValid(nextXPos)) camera.position.x = nextXPos.x;
        const nextZPos = camera.position.clone().add(new THREE.Vector3(0, 0, moveVector.z));
        if (isPositionValid(nextZPos)) camera.position.z = nextZPos.z;
      }
    }

    // Dynamic Elevation (Raycast Grounding)
    raycaster.current.set(camera.position.clone().add(new THREE.Vector3(0, 0.8, 0)), down);
    const floorMeshes: THREE.Object3D[] = [];
    scene.traverse(obj => {
      if (obj.name === "walkable-floor" || obj.name === "stair-slope") {
        floorMeshes.push(obj);
      }
    });

    const intersects = raycaster.current.intersectObjects(floorMeshes);
    const currentFeetY = camera.position.y - 0.55;
    const currentFloorBase = Math.floor(camera.position.y / 1.0) * 1.0 + 0.55;

    // Filter intersections to prevent snapping to floors SIGNIFICANTLY above us (ceilings)
    // Tighter tolerance (0.25) to avoid jumping to floors while walking near doors
    const validIntersects = intersects.filter(i => i.point.y < currentFeetY + 0.25);

    if (validIntersects.length > 0) {
      const sorted = validIntersects.sort((a, b) => b.point.y - a.point.y);
      const bestFloor = sorted[0];
      targetY.current = bestFloor.point.y + 0.55;
    } else {
      targetY.current = currentFloorBase;
    }

    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY.current, 0.15);
  });
  return isActive ? <PointerLockControls /> : null;
}

function FurnishedRoom({ room, scale, offsetX, offsetZ, theme, allRooms, isLayerVisible, bimModel }: {
  room: RoomData; scale: number; offsetX: number; offsetZ: number; theme: string; allRooms: RoomData[];
  isLayerVisible: (layer: BIMLayer) => boolean; bimModel: BIMModel;
}) {
  const paint = getRoomPaint(room.name, theme);
  const themeData = PAINT_THEMES[theme];
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
  const allFloorRooms = allRooms.filter(r => r.floor === room.floor);
  const isOpenSpace = ["Entrance Foyer", "Corridor", "Staircase", "Balcony", "Veranda", "Open Terrace", "Foyer", "Porch"].some(n => room.name.includes(n));
  let bestSegmentIdx = -1;
  let requiresExteriorDoor = false;

  // Point-in-expanded-bounding-box test (simpler and wall-thickness tolerant)
  function probeTouchesRoom(px: number, pz: number, other: RoomData): boolean {
    const ox = other.x * scale - offsetX;
    const oz = other.y * scale - offsetZ;
    const ow = other.width * scale;
    const od = other.height * scale;
    const pad = 0.3; // extra padding for wall thickness + jitter
    return px >= ox - pad && px <= ox + ow + pad && pz >= oz - pad && pz <= oz + od + pad;
  }

  // For each wall segment, cast outward-normal probes 0.15m from midpoint.
  // ONLY carve a door if the wall faces a room that is EXPLICITLY custom-connected by the user.
  // Returns hasDoor + doorCenterT (parametric position along segment where door center goes).
  const segmentDoorData = wallSegments.map((seg, i) => {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dxS = p2.x - p1.x;
    const dzS = p2.y - p1.y;
    const len = seg.length;
    if (len < 0.01) return [];

    const ux = dxS / len;
    const uz = dzS / len;
    // Outward normal
    const nx = Math.sin(seg.angle);
    const nz = -Math.cos(seg.angle);

    const doors: { doorCenterT: number; doorWidth: number }[] = [];
    const detectedRoomIds = new Set<string | number>();

    // Multi-point probing: every 0.3 units along the wall
    const step = 0.3;
    for (let t = 0.15; t < len; t += step) {
      const px = p1.x + ux * t;
      const pz = p1.y + uz * t;

      // Probe slightly outside and inside the wall
      const testPoints = [
        { x: px + nx * 0.15, z: pz + nz * 0.15 },
        { x: px - nx * 0.15, z: pz - nz * 0.15 }
      ];

      for (const other of allFloorRooms) {
        if (other.id === room.id || detectedRoomIds.has(other.id)) continue;
        const isCustomConnected = room.customConnections?.includes(other.id) || other.customConnections?.includes(room.id);
        if (!isCustomConnected) continue;

        const ox = other.x * scale - offsetX;
        const oz = other.y * scale - offsetZ;
        const ow = other.width * scale;
        const od = other.height * scale;
        const pad = 0.2;

        const isHit = testPoints.some(tp =>
          tp.x >= ox - pad && tp.x <= ox + ow + pad && tp.z >= oz - pad && tp.z <= oz + od + pad
        );

        if (isHit) {
          // Found a connection point for this room. 
          // Find the 1D overlap of this other room's geometry with OUR wall segment
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
            // External connections (to Balconies, Terraces, etc.) are 2x interior (1.2 units)
            const isExternalConnection = isOpenSpaceRoom(other.name);
            const DOOR_STD = isExternalConnection ? 1.2 : 0.6;

            const dWidth = overlapLen < DOOR_STD ? overlapLen / 2 : DOOR_STD;
            doors.push({
              doorCenterT: (globalMinT + globalMaxT) / 2,
              doorWidth: dWidth
            });
            detectedRoomIds.add(other.id);
          }
        }
      }
    }
    return doors.sort((a, b) => a.doorCenterT - b.doorCenterT);
  });

  if (!isOpenSpace) {
    const isBathroom = isBathroomRoom(room.name);
    // Hub rooms usually room.id % 1000 === 0. We also check if it's the first room.
    if ((room.id % 1000 === 0 || room.id === allRooms[0]?.id) && !isBathroom) requiresExteriorDoor = true;
    if (requiresExteriorDoor) {
      let maxZ = -Infinity;
      for (let j = 0; j < wallSegments.length; j++) {
        const ws = wallSegments[j];
        const isHorizontal = Math.abs(ws.angle) < 0.2 || Math.abs(Math.abs(ws.angle) - Math.PI) < 0.2;
        if (isHorizontal && ws.cz > maxZ) { maxZ = ws.cz; bestSegmentIdx = j; }
      }
    } else {
      // No fallback for non-hub rooms — only user-defined custom connections
    }
  }
  return (
    <group>
      {/* Room floor - ONLY if not a staircase room on upper floors */}
      {!(room.name.toLowerCase().includes("staircase") && room.floor > 0) && (
        <mesh name="walkable-floor" position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <shapeGeometry args={[floorShape]} />
          <meshStandardMaterial color={themeData.floor} roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
        </mesh>
      )}


      {!isOpenSpace && (() => {
        let bathroomDoorCarved = false;
        const isBathroom = isBathroomRoom(room.name);

        return wallSegments.map((seg, i) => {
          const normalX = Math.sin(seg.angle);
          const normalZ = -Math.cos(seg.angle);
          const testX = seg.cx + normalX * 0.1;
          const testZ = seg.cz + normalZ * 0.1;

          let facesOpenSpace = false;
          const facesInternalRoom = allFloorRooms.some(other => {
            if (other.id === room.id || isOpenSpaceRoom(room.name)) return false;
            const ox = other.x * scale - offsetX;
            const oz = other.y * scale - offsetZ;
            const ow = other.width * scale;
            const od = other.height * scale;
            const isInside = testX > ox && testX < ox + ow && testZ > oz && testZ < oz + od;
            if (isInside && isOpenSpaceRoom(other.name)) facesOpenSpace = true;
            return isInside;
          });

          const isExterior = !facesInternalRoom;
          const isExposed = isExterior || facesOpenSpace;
          let doors = segmentDoorData[i] || [];

          if (isBathroom) {
            if (isExposed) {
              doors = [];
            } else if (doors.length > 0) {
              if (bathroomDoorCarved) {
                doors = [];
              } else {
                doors = [doors[0]];
                bathroomDoorCarved = true;
              }
            }
          }

          const isExteriorFallbackDoor = (i === bestSegmentIdx && doors.length === 0 && !isBathroom);
          const doorSpans: { startT: number; endT: number }[] = doors.map(d => ({
            startT: d.doorCenterT - d.doorWidth / 2,
            endT: d.doorCenterT + d.doorWidth / 2
          }));

          // Add parametric openings from BIM model
          Object.entries(bimModel.openings).forEach(([opId, meta]) => {
            const m = meta as any; // Quick cast for BIMMetadata fields
            const [roomIdStr, wallIdxStr, tStr] = (m.orientation || "").split(':');
            if (Number(roomIdStr) === room.id && Number(wallIdxStr) === i) {
              const t = Number(tStr);
              const opWidth = m.width || 0.3;
              doorSpans.push({
                startT: t * seg.length - opWidth / 2,
                endT: t * seg.length + opWidth / 2
              });
            }
          });

          if (isExteriorFallbackDoor) {
            const DOOR_W = 1.2; // Standard exterior door (2x interior 0.6 = 1.2)
            doorSpans.push({ startT: seg.length / 2 - DOOR_W / 2, endT: seg.length / 2 + DOOR_W / 2 });
          }

          doorSpans.sort((a, b) => a.startT - b.startT);
          const wallPillars: { startT: number; endT: number }[] = [];
          let currentT = 0;
          for (const span of doorSpans) {
            const s = Math.max(currentT, span.startT);
            const e = Math.min(seg.length, span.endT);
            if (s > currentT + 0.01) wallPillars.push({ startT: currentT, endT: s });
            currentT = Math.max(currentT, e);
          }
          if (currentT < seg.length - 0.01) wallPillars.push({ startT: currentT, endT: seg.length });

          const wallColor = isExterior ? ((isExterior && (doors.length > 0)) ? themeData.accent : themeData.walls) : paint;
          const isStructural = isExterior; // Simplification: exterior walls are structural

          return isLayerVisible(isStructural ? 'structural' : 'architectural') && (
            <group key={i} position={[seg.cx, WALL_HEIGHT / 2, seg.cz]} rotation={[0, -seg.angle, 0]}>
              {wallPillars.map((pillar, pIdx) => {
                const pLen = pillar.endT - pillar.startT;
                const pCenter = (pillar.startT + pillar.endT) / 2 - seg.length / 2;
                return (
                  <group key={pIdx}>
                    <mesh position={[pCenter, 0, 0]} castShadow>
                      <boxGeometry args={[pLen + (pIdx === 0 || pIdx === wallPillars.length - 1 ? WALL_THICKNESS : 0), WALL_HEIGHT, WALL_THICKNESS]} />
                      <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0.05} />
                    </mesh>
                    {/* Baseboards */}
                    <mesh position={[pCenter, -WALL_HEIGHT / 2 + TRIM_HEIGHT / 2 + 0.005, WALL_THICKNESS / 2 + TRIM_THICKNESS / 2]} castShadow>
                      <boxGeometry args={[pLen, TRIM_HEIGHT, TRIM_THICKNESS]} />
                      <meshStandardMaterial color={themeData.trim} roughness={0.6} metalness={0.1} />
                    </mesh>
                    <mesh position={[pCenter, -WALL_HEIGHT / 2 + TRIM_HEIGHT / 2 + 0.005, -WALL_THICKNESS / 2 - TRIM_THICKNESS / 2]} castShadow>
                      <boxGeometry args={[pLen, TRIM_HEIGHT, TRIM_THICKNESS]} />
                      <meshStandardMaterial color={themeData.trim} roughness={0.6} metalness={0.1} />
                    </mesh>
                    {/* Crown Molding (Only for interior-facing walls) */}
                    {!isExterior && (
                      <>
                        <mesh position={[pCenter, WALL_HEIGHT / 2 - TRIM_HEIGHT / 2 - 0.005, WALL_THICKNESS / 2 + TRIM_THICKNESS / 2]} castShadow>
                          <boxGeometry args={[pLen, TRIM_HEIGHT * 1.2, TRIM_THICKNESS * 1.5]} />
                          <meshStandardMaterial color={themeData.trim} roughness={0.5} />
                        </mesh>
                        <mesh position={[pCenter, WALL_HEIGHT / 2 - TRIM_HEIGHT / 2 - 0.005, -WALL_THICKNESS / 2 - TRIM_THICKNESS / 2]} castShadow>
                          <boxGeometry args={[pLen, TRIM_HEIGHT * 1.2, TRIM_THICKNESS * 1.5]} />
                          <meshStandardMaterial color={themeData.trim} roughness={0.5} />
                        </mesh>
                      </>
                    )}
                  </group>
                );
              })}
              {/* Door headers and frames */}
              {doorSpans.map((span, sIdx) => {
                const hLen = span.endT - span.startT;
                const hCenter = (span.startT + span.endT) / 2 - seg.length / 2;
                const headerHeight = WALL_HEIGHT - DOOR_HEIGHT;
                const headerY = DOOR_HEIGHT / 2;
                return (
                  <group key={`h-${sIdx}`}>
                    {/* The actual header wall */}
                    <mesh position={[hCenter, headerY, 0]} castShadow>
                      <boxGeometry args={[hLen, headerHeight, WALL_THICKNESS]} />
                      <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0.05} />
                    </mesh>

                    {/* Door Frame/Casing and Jambs - Only for standard doors, skip for wide archways */}
                    {hLen < 1.3 && (
                      <>
                        {/* The horizontal casing at the top of the door opening */}
                        <mesh position={[hCenter, DOOR_HEIGHT - WALL_HEIGHT / 2, 0]} castShadow>
                          <boxGeometry args={[hLen + 0.04, 0.03, WALL_THICKNESS + 0.03]} />
                          <meshStandardMaterial color={themeData.trim} roughness={0.4} metalness={0.2} />
                        </mesh>
                        {/* Side Jambs */}
                        <mesh position={[hCenter - hLen / 2, DOOR_HEIGHT / 2 - WALL_HEIGHT / 2, 0]} castShadow>
                          <boxGeometry args={[0.03, DOOR_HEIGHT, WALL_THICKNESS + 0.025]} />
                          <meshStandardMaterial color={themeData.trim} roughness={0.4} metalness={0.2} />
                        </mesh>
                        <mesh position={[hCenter + hLen / 2, DOOR_HEIGHT / 2 - WALL_HEIGHT / 2, 0]} castShadow>
                          <boxGeometry args={[0.03, DOOR_HEIGHT, WALL_THICKNESS + 0.025]} />
                          <meshStandardMaterial color={themeData.trim} roughness={0.4} metalness={0.2} />
                        </mesh>
                      </>
                    )}
                  </group>
                );
              })}
            </group>
          );
        });
      })()
      }
      <Text position={[cx - offsetX, 0.06, cz - offsetZ]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.15} color="#555" anchorX="center" anchorY="middle">
        {room.name}
      </Text>
      {
        room.name.toLowerCase().includes("staircase") && room.floor < allRooms.reduce((max, r) => Math.max(max, r.floor || 0), 0) && (() => {
          const nx = room.x * scale - offsetX;
          const nz = room.y * scale - offsetZ;
          const nw = room.width * scale;
          const nd = room.height * scale;
          const isWider = nw > nd;
          const length = isWider ? nw : nd;
          const angle = Math.atan2(1.0, length);
          const hypotenuse = Math.sqrt(length * length + 1.0 * 1.0);
          return (
            <group position={[nx + nw / 2, 0, nz + nd / 2]}>
              <mesh name="stair-slope" position={[0, 0.5, 0]} rotation={[isWider ? 0 : -angle, 0, isWider ? angle : 0]} castShadow>
                <boxGeometry args={[isWider ? hypotenuse : nw * 0.9, 0.04, isWider ? nd * 0.9 : hypotenuse]} />
                <meshStandardMaterial color={themeData.floor} roughness={0.9} transparent opacity={0.1} />
              </mesh>
              {Array.from({ length: 10 }).map((_, i) => {
                const stepProgress = i / 10;
                const stepW = isWider ? nw / 10 : nw * 0.9;
                const stepD = isWider ? nd * 0.9 : nd / 10;
                const stepH = 0.1;
                const stepX = isWider ? (-nw / 2 + stepW / 2 + i * stepW) : 0;
                const stepZ = isWider ? 0 : (-nd / 2 + stepD / 2 + i * stepD);
                const stepY = stepProgress * 1.0;
                return (
                  <mesh key={i} name="walkable-floor" position={[stepX, stepY + stepH / 2, stepZ]} castShadow>
                    <boxGeometry args={[stepW, stepH, stepD]} />
                    <meshStandardMaterial color={themeData.floor} roughness={0.8} />
                  </mesh>
                );
              })}
            </group>
          );
        })()
      }
    </group >
  );
}

function FinishedBuilding({ rooms, numFloors, theme, customWindows, isLayerVisible, bimModel }: {
  rooms: RoomData[]; numFloors: number; theme: string;
  customWindows: { position: [number, number, number]; rotation: [number, number, number]; id: string }[];
  isLayerVisible: (layer: BIMLayer) => boolean; bimModel: BIMModel;
}) {
  const scaleFactor = 0.1;
  const themeData = PAINT_THEMES[theme];

  // Calculate actual house bounds to center it perfectly
  const houseBounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    rooms.forEach(r => {
      minX = Math.min(minX, r.x);
      maxX = Math.max(maxX, r.x + r.width);
      minY = Math.min(minY, r.y);
      maxY = Math.max(maxY, r.y + r.height);
    });
    // Add small buffer
    return {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }, [rooms]);

  const offsetX = houseBounds.centerX * scaleFactor;
  const offsetZ = houseBounds.centerY * scaleFactor;
  const pw = houseBounds.width * scaleFactor;
  const ph = houseBounds.height * scaleFactor;

  return (
    <group>
      {/* Ground with grass texture and depth */}
      <group position={[0, -0.05, 0]}>
        <mesh name="walkable-floor" position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[pw + 30, ph + 30]} />
          <meshStandardMaterial color="#2d4a22" roughness={1} metalness={0} />
        </mesh>
        {/* Foundation/Soil depth - lowered slightly to avoid Z-fighting */}
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[pw + 30.1, 0.5, ph + 30.1]} />
          <meshStandardMaterial color="#3d2b1f" roughness={1} />
        </mesh>
      </group>

      {/* Pathway */}
      <mesh name="walkable-floor" position={[0, -0.04, ph / 2 + 1.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 3]} />
        <meshStandardMaterial color="#b0a090" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Manually placed windows */}
      {customWindows.map((win) => (
        <group
          key={win.id}
          position={win.position}
          rotation={win.rotation}
          name="custom-window"
          userData={{ windowId: win.id }}
        >
          <mesh>
            <boxGeometry args={[0.3, 0.4, 0.04]} />
            <meshPhysicalMaterial
              color="#e0f0ff"
              transmission={0.9}
              thickness={0.05}
              roughness={0.05}
              envMapIntensity={1.5}
              clearcoat={1}
            />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <boxGeometry args={[0.32, 0.42, 0.03]} />
            <meshStandardMaterial color={themeData.trim} roughness={0.3} metalness={0.5} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: numFloors }).map((_, f) => {
        const floorRooms = rooms.filter((r) => r.floor === f);
        const floorY = f * (WALL_HEIGHT + SLAB_HEIGHT);

        const slabShape = new THREE.Shape();
        slabShape.moveTo(-pw / 2 - 0.15, -ph / 2 - 0.15);
        slabShape.lineTo(pw / 2 + 0.15, -ph / 2 - 0.15);
        slabShape.lineTo(pw / 2 + 0.15, ph / 2 + 0.15);
        slabShape.lineTo(-pw / 2 - 0.15, ph / 2 + 0.15);
        slabShape.lineTo(-pw / 2 - 0.15, -ph / 2 - 0.15);

        // Add holes for staircases (from BOTH current floor AND floor below)
        const relevantRooms = rooms.filter(r => r.floor === f || r.floor === f - 1);
        relevantRooms.filter(r => r.name.toLowerCase().includes("staircase")).forEach(room => {
          const holePath = new THREE.Path();
          if (room.polygon && room.polygon.length > 0) {
            const pts = room.polygon.map(p => new THREE.Vector2(p.x * scaleFactor - offsetX, p.y * scaleFactor - offsetZ));
            holePath.moveTo(pts[0].x, -pts[0].y);
            for (let i = 1; i < pts.length; i++) holePath.lineTo(pts[i].x, -pts[i].y);
            holePath.lineTo(pts[0].x, -pts[0].y);
          } else {
            const nx = room.x * scaleFactor - offsetX;
            const nz = room.y * scaleFactor - offsetZ;
            const nw = room.width * scaleFactor;
            const nd = room.height * scaleFactor;
            holePath.moveTo(nx, -nz);
            holePath.lineTo(nx + nw, -nz);
            holePath.lineTo(nx + nw, -(nz + nd));
            holePath.lineTo(nx, -(nz + nd));
            holePath.lineTo(nx, -nz);
          }
          slabShape.holes.push(holePath);
        });

        return (
          <group key={f} position={[0, floorY, 0]}>
            {/* Floor slab with holes */}
            {isLayerVisible('structural') && (
              <mesh name="walkable-floor" position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <shapeGeometry args={[slabShape]} />
                <meshStandardMaterial color={f === 0 ? "#d4c5a9" : "#e8e0d0"} roughness={0.6} side={THREE.DoubleSide} />
              </mesh>
            )}
            {/* Slab edge */}
            {f > 0 && isLayerVisible('structural') && (
              <mesh position={[0, -SLAB_HEIGHT / 2, 0]}>
                <boxGeometry args={[pw + 0.4, SLAB_HEIGHT, ph + 0.4]} />
                <meshStandardMaterial color="#c0b090" roughness={0.5} />
              </mesh>
            )}
            {floorRooms.map((room) => (
              <FurnishedRoom key={room.id} room={room} scale={scaleFactor} offsetX={offsetX} offsetZ={offsetZ} theme={theme} allRooms={rooms} isLayerVisible={isLayerVisible} bimModel={bimModel} />
            ))}
            {/* Interior Ceiling - slightly off-white for realism */}
            {isLayerVisible('architectural') && (
              <mesh position={[0, WALL_HEIGHT - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <shapeGeometry args={[slabShape]} />
                <meshStandardMaterial color="#fafafa" roughness={0.9} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Roof */}
      <group position={[0, numFloors * (WALL_HEIGHT + SLAB_HEIGHT), 0]}>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[pw + 0.6, 0.2, ph + 0.6]} />
          <meshStandardMaterial color={themeData.roof} roughness={0.5} />
        </mesh>
        {/* Roof parapet */}
        <mesh position={[0, 0.35, ph / 2 + 0.2]}>
          <boxGeometry args={[pw + 0.7, 0.5, 0.1]} />
          <meshStandardMaterial color={themeData.roof} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.35, -ph / 2 - 0.2]}>
          <boxGeometry args={[pw + 0.7, 0.5, 0.1]} />
          <meshStandardMaterial color={themeData.roof} roughness={0.5} />
        </mesh>
        <mesh position={[pw / 2 + 0.2, 0.35, 0]}>
          <boxGeometry args={[0.1, 0.5, ph + 0.5]} />
          <meshStandardMaterial color={themeData.roof} roughness={0.5} />
        </mesh>
        <mesh position={[-pw / 2 - 0.2, 0.35, 0]}>
          <boxGeometry args={[0.1, 0.5, ph + 0.5]} />
          <meshStandardMaterial color={themeData.roof} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

const FinalLook = () => {
  const {
    state, floorPlan, plotWidth, plotHeight, floorPlanSaved, floorConfig,
    setBIMMode, setBIMLayerVisibility
  } = useAppState();

  // BIM Layer Filters
  const isLayerVisible = (layer: BIMLayer) => !state.bimMode || state.bimLayers[layer];

  const [theme, setTheme] = useState("modern");
  const [lighting, setLighting] = useState<"day" | "night">("day");
  const [isWalkthrough, setIsWalkthrough] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [customWindows, setCustomWindows] = useState<{ position: [number, number, number]; rotation: [number, number, number]; id: string }[]>([]);

  const handlePlaceWindow = (pos: THREE.Vector3, normal: THREE.Vector3) => {
    // Determine if we hit an internal wall and find the nearest exterior counterpart
    const tx = (pos.x + offsetX) / scaleFactor;
    const tz = (pos.z + offsetZ) / scaleFactor;
    const floor = Math.floor(pos.y / 1.0);
    const floorRooms = floorPlan.filter(r => r.floor === floor);

    let finalPos = pos.clone();

    // Check if internal: Is there a room on BOTH sides of the hit?
    const normalOffset = 0.1 / scaleFactor;
    const pAhead = { x: tx + normal.x * normalOffset, z: tz + normal.z * normalOffset };
    const pBehind = { x: tx - normal.x * normalOffset, z: tz - normal.z * normalOffset };

    const inRoomAhead = floorRooms.some(r => pAhead.x >= r.x && pAhead.x <= r.x + r.width && pAhead.z >= r.y && pAhead.z <= r.y + r.height);
    const inRoomBehind = floorRooms.some(r => pBehind.x >= r.x && pBehind.x <= r.x + r.width && pBehind.z >= r.y && pBehind.z <= r.y + r.height);

    if (inRoomAhead && inRoomBehind) {
      // Internal wall detected. Relocate to nearest exterior wall in normal direction.
      const isXNormal = Math.abs(normal.x) > 0.5;
      let exteriorTarget: number | null = null;

      if (isXNormal) {
        // Find min/max X of entire building footprint at this specific Z
        let minX = Infinity, maxX = -Infinity;
        floorRooms.forEach(r => {
          if (tz >= r.y && tz <= r.y + r.height) {
            minX = Math.min(minX, r.x);
            maxX = Math.max(maxX, r.x + r.width);
          }
        });
        exteriorTarget = normal.x > 0 ? maxX : minX;
        finalPos.x = exteriorTarget * scaleFactor - offsetX;
      } else {
        // Find min/max Z of entire building footprint at this specific X
        let minZ = Infinity, maxZ = -Infinity;
        floorRooms.forEach(r => {
          if (tx >= r.x && tx <= r.x + r.width) {
            minZ = Math.min(minZ, r.y);
            maxZ = Math.max(maxZ, r.y + r.height);
          }
        });
        exteriorTarget = normal.z > 0 ? maxZ : minZ;
        finalPos.z = exteriorTarget * scaleFactor - offsetZ;
      }
    }

    // Robustly align window to wall normal using quaternions
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(defaultNormal, normal);
    const rotation = new THREE.Euler().setFromQuaternion(quat);

    setCustomWindows(prev => [
      ...prev,
      {
        position: [finalPos.x, finalPos.y, finalPos.z],
        rotation: [rotation.x, rotation.y, rotation.z],
        id: Math.random().toString(36).substr(2, 9)
      }
    ]);
  };

  const handleDeleteWindow = (id: string) => {
    setCustomWindows(prev => prev.filter(w => w.id !== id));
  };

  if (!floorPlanSaved) {
    return (
      <div className="module-container">
        <div className="glass-card text-center py-16">
          <p className="text-muted-foreground mb-4">Save a floor plan first to see the final 3D output.</p>
          <Link to="/floor-plan" className="btn-primary inline-block">Go to Floor Plan Generator</Link>
        </div>
      </div>
    );
  }

  const numFloors = floorConfig?.numFloors || 1;
  const scaleFactor = 0.1;

  // Calculate actual house bounds for centering the camera and offsets
  const houseBounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    floorPlan.forEach(r => {
      minX = Math.min(minX, r.x);
      maxX = Math.max(maxX, r.x + r.width);
      minY = Math.min(minY, r.y);
      maxY = Math.max(maxY, r.y + r.height);
    });
    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY
    };
  }, [floorPlan]);

  const offsetX = houseBounds.centerX * scaleFactor;
  const offsetZ = houseBounds.centerY * scaleFactor;
  const camD = Math.max(houseBounds.width, houseBounds.height) * 0.08 + 6;

  return (
    <div className="module-container">
      <div className="glass-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">Final Look — Finished Building</h2>
            <p className="text-xs text-muted-foreground">
              Your {numFloors}-floor building with paint, windows, and finishing. Drag to orbit, scroll to zoom.
            </p>
          </div>
          <Link to="/floor-plan" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-3 w-3" /> Edit Floor Plan
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-card flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Paintbrush className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Paint Theme:</span>
          {Object.entries(PAINT_THEMES).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className={`px-5 py-2 rounded-full text-xs font-semibold tracking-wide transition-all border ${theme === key
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-border bg-muted text-muted-foreground hover:border-primary/50 hover:bg-muted/80"
                }`}
            >
              {val.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setIsWalkthrough(!isWalkthrough)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border transition-all ${isWalkthrough
              ? "border-primary bg-primary text-white shadow-sm"
              : "border-border bg-muted text-muted-foreground hover:border-primary/30 hover:bg-muted/80"
              }`}
          >
            <Footprints className="h-3.5 w-3.5" />
            {isWalkthrough ? "Exit Walkthrough" : "Walkthrough (NPC)"}
          </button>
          <button
            onClick={() => setLighting(lighting === "day" ? "night" : "day")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border border-border bg-muted text-muted-foreground hover:border-primary/30 hover:bg-muted/80 transition-all shadow-sm"
          >
            {lighting === "day" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
            {lighting === "day" ? "Day" : "Night"}
          </button>
          {!isWalkthrough && (
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border transition-all ${autoRotate
                ? "border-primary bg-primary text-white shadow-[0_0_10px_rgba(var(--primary-rgb),0.3)]"
                : "border-border bg-muted text-muted-foreground hover:border-primary/30 hover:bg-muted/80"
                }`}
            >
              <Rotate3d className={`h-3.5 w-3.5 ${autoRotate ? "animate-spin-slow" : ""}`} />
              360° View
            </button>
          )}
        </div>
      </div>

      <div className="glass-card relative overflow-hidden" style={{ height: 600 }}>
        <Canvas shadows camera={{ position: [camD, camD * 0.5, camD], fov: 45 }}>
          {lighting === "day" ? (
            <>
              <hemisphereLight intensity={0.6} groundColor="#4a7c59" color="#cae9ff" />
              <ambientLight intensity={0.4} />
              <directionalLight position={[20, 30, 10]} intensity={1.8} castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-far={50}
                shadow-camera-left={-20}
                shadow-camera-right={20}
                shadow-camera-top={20}
                shadow-camera-bottom={-20}
              />
              <Sky sunPosition={[100, 20, 100]} />
              <Environment preset="city" blur={0.8} />
            </>
          ) : (
            <>
              <hemisphereLight intensity={0.1} groundColor="#000000" color="#1e293b" />
              <ambientLight intensity={0.1} />
              <directionalLight position={[5, 15, 5]} intensity={0.4} color="#6b7fff" castShadow />
              <pointLight position={[0, 4, 0]} intensity={0.8} color="#ffcc33" distance={15} decay={2} />
              <Environment preset="night" />
            </>
          )}

          <FinishedBuilding
            rooms={floorPlan}
            numFloors={numFloors}
            theme={theme}
            customWindows={customWindows}
            isLayerVisible={isLayerVisible}
            bimModel={state.bimModel}
          />
          <ContactShadows position={[0, -0.04, 0]} opacity={0.4} scale={30} blur={2} />

          {!isWalkthrough && (
            <OrbitControls
              enablePan
              minDistance={3}
              maxDistance={35}
              autoRotate={autoRotate}
              autoRotateSpeed={1.5}
            />
          )}
          <FirstPersonCamera
            isActive={isWalkthrough}
            rooms={floorPlan}
            scale={scaleFactor}
            offsetX={offsetX}
            offsetZ={offsetZ}
            plotW={houseBounds.width}
            plotH={houseBounds.height}
            onPlaceWindow={handlePlaceWindow}
            onDeleteWindow={handleDeleteWindow}
          />
        </Canvas>

        {/* BIM HUD Overlay - Now moved inside the relative container */}
        {state.bimMode && (
          <div className="absolute top-4 right-4 z-[100] animate-in slide-in-from-right-4 duration-500">
            <div className="glass-card !bg-background/40 backdrop-blur-xl border-primary/20 !p-3 shadow-2xl space-y-3 w-48">
              <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
                <div className="h-6 w-6 rounded bg-primary/20 flex items-center justify-center">
                  <Layers className="h-3 w-3 text-primary animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-primary uppercase tracking-tighter">BIM Filters</span>
                  <span className="text-[8px] text-muted-foreground font-mono">Sync Active</span>
                </div>
              </div>

              <div className="space-y-1">
                {(['structural', 'architectural', 'mep', 'finishing'] as BIMLayer[]).map(layer => (
                  <button
                    key={layer}
                    onClick={() => setBIMLayerVisibility(layer, !state.bimLayers[layer])}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-all border ${state.bimLayers[layer] ? 'bg-primary/20 border-primary/30 text-primary shadow-sm' : 'bg-muted/40 border-border text-muted-foreground'}`}
                  >
                    <div className="flex items-center gap-2">
                      {state.bimLayers[layer] ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                      <span className="text-[9px] font-bold uppercase tracking-wider">{layer}</span>
                    </div>
                    <div className={`h-1 w-1 rounded-full ${state.bimLayers[layer] ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isWalkthrough && (
          <>
            {/* Crosshair */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full border border-black/50 pointer-events-none z-50 shadow-lg" />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 flex flex-col items-center gap-1 pointer-events-none">
              <p className="text-white text-xs font-bold tracking-wider">WALKTHROUGH MODE ACTIVE</p>
              <p className="text-white/70 text-[10px]">WASD to Move • SPACE/SHIFT to Up/Down • Click Wall/Window to Add/Delete • ESC to Exit</p>
            </div>
          </>
        )}
      </div>



      {/* Color legend */}
      <div className="glass-card">
        <p className="text-xs font-medium text-muted-foreground mb-2">Room Paint Colors ({PAINT_THEMES[theme].name})</p>
        <div className="flex flex-wrap gap-3">
          {floorPlan.filter(r => r.floor === 0).map((room, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-3 w-3 rounded-sm border border-border" style={{ background: getRoomPaint(room.name, theme) }} />
              {room.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FinalLook;
