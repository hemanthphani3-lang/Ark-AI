import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from "react";
import { MaterialRates, DEFAULT_RATES, calculateDetailedMaterials } from "../utils/costEstimationEngine";
import { fetchMaterialRates } from "../services/aiService";
import { calculateQTO } from "../utils/bimEngine";

export interface RoomData {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  area: number;
  floor: number;
  zone: 'public' | 'private' | 'service' | 'core';
  isWetArea?: boolean;
  attachedBathId?: number;
  attachedTo?: number;         // parent room ID (for attached bathroom)
  customConnections?: number[]; // manually linked room IDs via the doorway tool
  polygon?: { x: number; y: number }[];  // custom polygon points (non-rectangular shape)
}

export type BIMLayer = 'structural' | 'architectural' | 'mep' | 'finishing';

export interface BIMMetadata {
  material: string;
  thickness?: number;
  height?: number;
  width?: number;
  depth?: number;
  area?: number;
  volume?: number;
  structuralRole?: 'load-bearing' | 'partition' | 'frame';
  concreteGrade?: string;
  reinforcementFactor?: number;
  orientation?: string;
  ventilationData?: string;
  costContribution?: number;
}

export interface BIMModel {
  walls: Record<string, BIMMetadata>;
  columns: Record<string, BIMMetadata>;
  slabs: Record<number, BIMMetadata>;
  openings: Record<string, BIMMetadata>; // doors/windows
  mep: Record<string, BIMMetadata>; // plumbing/electrical
}

export interface MaterialRequirement {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  category: 'structural' | 'brickwork' | 'flooring' | 'finishing' | 'plumbing' | 'electrical' | 'painting' | 'miscellaneous';
}

interface AppState {
  totalRooms: number;
  estimatedCost: number;
  costBreakdown: CostBreakdown;
  bimMode: boolean;
  bimLayers: Record<BIMLayer, boolean>;
  selectedBIMElement: { type: string; id: string | number } | null;
  bimModel: BIMModel;
  scores: {
    structural: number;
    circulation: number;
    vastu: number;
    cost: number;
    physics: number;
  };
  projectMeta: {
    roadSide: 'North' | 'South' | 'East' | 'West';
    facing: 'North' | 'South' | 'East' | 'West';
    latLong: string;
    budgetRange: [number, number];
    vastuMode: 'Strict' | 'Hybrid' | 'Off';
    physicsMode: 'Physics' | 'Hybrid' | 'Off';
  };
  designStyle: string;
  complianceStatus: 'Compliant' | 'Non-Compliant' | 'Pending';
  materialRates: MaterialRates;
  materialRequirements: MaterialRequirement[];
}

export interface SavedProject {
  id: string;
  name: string;
  dateSaved: string;
  // Snapshot of relevant global state for this project
  floorPlan: RoomData[];
  plotSize: number;
  plotWidth: number;
  plotHeight: number;
  floorConfig: FloorConfig | null;
  landAnalysis: any | null;
  bimModel: BIMModel;
  scores: AppState['scores'];
  projectMeta: AppState['projectMeta'];
  designStyle: string;
  totalRooms: number;
  estimatedCost: number;
  costBreakdown: CostBreakdown;
  complianceStatus: 'Compliant' | 'Non-Compliant' | 'Pending';
  materialRates: MaterialRates;
  materialRequirements: MaterialRequirement[];
}

export interface FloorConfig {
  numFloors: number;
  roomConfigs: { name: string; sizeSqFt: number; hasAttachedBath?: boolean }[];
  staircaseType?: 'straight' | 'l-shape' | 'u-shape' | 'dog-leg' | 'spiral';
}

interface AppContextType {
  state: AppState;
  floorPlan: RoomData[];
  plotSize: number;
  plotWidth: number;
  plotHeight: number;
  hasFloorPlan: boolean;
  floorPlanSaved: boolean;
  floorConfig: FloorConfig | null;
  landAnalysis: any | null;
  setLandAnalysis: (analysis: any) => void;
  setBIMMode: (mode: boolean) => void;
  setBIMLayerVisibility: (layer: BIMLayer, visible: boolean) => void;
  setBIMSelection: (selection: AppState['selectedBIMElement']) => void;
  updateBIMMetadata: (type: keyof BIMModel, id: string | number, metadata: Partial<BIMMetadata>) => void;
  setTotalRooms: (n: number) => void;
  setEstimatedCost: (n: number) => void;
  setProjectMeta: (meta: Partial<AppState['projectMeta']>) => void;
  setScores: (scores: Partial<AppState['scores']>) => void;
  setCostBreakdown: (breakdown: Partial<CostBreakdown>) => void;
  setFloorPlan: (rooms: RoomData[], pw: number, ph: number, plotSqFt: number) => void;
  saveFloorPlan: () => void;
  resetFloorPlan: () => void;
  setFloorConfig: (config: FloorConfig) => void;
  setComplianceStatus: (status: 'Compliant' | 'Non-Compliant' | 'Pending') => void;
  setMaterialRequirements: (requirements: MaterialRequirement[]) => void;
  refreshMaterialRates: (location?: string) => Promise<void>;
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  // Project Management
  projects: SavedProject[];
  activeProjectId: string | null;
  saveProject: (projectName: string) => void;
  loadProject: (projectId: string) => void;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface CostBreakdown {
  foundation: number;
  structural: number;
  brickwork: number;
  electrical: number;
  plumbing: number;
  flooring: number;
  painting: number;
  finishing: number;
  miscellaneous: number;
}

const INITIAL_BIM: BIMModel = {
  walls: {},
  columns: {},
  slabs: {},
  openings: {},
  mep: {},
};

const INITIAL_COST_BREAKDOWN: CostBreakdown = {
  foundation: 0,
  structural: 0,
  brickwork: 0,
  electrical: 200000,
  plumbing: 300000,
  flooring: 0,
  painting: 0,
  finishing: 0,
  miscellaneous: 0,
};

const INITIAL_STATE: AppState = {
  totalRooms: 0,
  estimatedCost: 0,
  costBreakdown: INITIAL_COST_BREAKDOWN,
  bimMode: false,
  bimLayers: {
    structural: true,
    architectural: true,
    mep: true,
    finishing: true,
  },
  selectedBIMElement: null,
  bimModel: INITIAL_BIM,
  scores: {
    structural: 0,
    circulation: 0,
    vastu: 0,
    cost: 0,
    physics: 0,
  },
  projectMeta: {
    roadSide: 'North',
    facing: 'North',
    latLong: '',
    budgetRange: [2000000, 10000000],
    vastuMode: 'Hybrid',
    physicsMode: 'Physics',
  },
  designStyle: "Modern",
  complianceStatus: 'Pending',
  materialRates: DEFAULT_RATES,
  materialRequirements: [],
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [floorPlan, setFloorPlanState] = useState<RoomData[]>([]);
  const [plotSize, setPlotSize] = useState(0);
  const [plotWidth, setPlotWidth] = useState(0);
  const [plotHeight, setPlotHeight] = useState(0);
  const [floorPlanSaved, setFloorPlanSaved] = useState(false);
  const [floorConfig, setFloorConfigState] = useState<FloorConfig | null>(null);
  const [landAnalysis, setLandAnalysis] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [projects, setProjects] = useState<SavedProject[]>(() => {
    try {
      const stored = localStorage.getItem('arkai-projects');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('arkai-projects', JSON.stringify(projects));
    } catch (e) {
      console.warn("Failed to serialize projects to localStorage:", e);
    }
  }, [projects]);

  const hasFloorPlan = floorPlan.length > 0;

  const setBIMMode = useCallback((mode: boolean) => setState(p => ({ ...p, bimMode: mode })), []);
  const setBIMLayerVisibility = useCallback((layer: BIMLayer, visible: boolean) =>
    setState(p => ({ ...p, bimLayers: { ...p.bimLayers, [layer]: visible } })), []);
  const setBIMSelection = useCallback((selection: AppState['selectedBIMElement']) =>
    setState(p => ({ ...p, selectedBIMElement: selection })), []);
  const updateBIMMetadata = useCallback((type: keyof BIMModel, id: string | number, metadata: Partial<BIMMetadata>) =>
    setState(p => ({
      ...p,
      bimModel: {
        ...p.bimModel,
        [type]: {
          ...p.bimModel[type],
          [id]: { ...p.bimModel[type][id], ...metadata }
        }
      }
    })), []);

  const setTotalRooms = useCallback((n: number) => setState((p) => ({ ...p, totalRooms: n })), []);
  const setEstimatedCost = useCallback((n: number) => setState((p) => ({ ...p, estimatedCost: n })), []);
  const setProjectMeta = useCallback((meta: Partial<AppState['projectMeta']>) =>
    setState((p) => ({ ...p, projectMeta: { ...p.projectMeta, ...meta } })), []);
  const setScores = useCallback((scores: Partial<AppState['scores']>) =>
    setState((p) => ({ ...p, scores: { ...p.scores, ...scores } })), []);
  const setCostBreakdown = useCallback((breakdown: Partial<CostBreakdown>) =>
    setState((p) => ({ ...p, costBreakdown: { ...p.costBreakdown, ...breakdown } })), []);

  const setFloorPlan = useCallback((rooms: RoomData[], pw: number, ph: number, plotSqFt: number) => {
    setFloorPlanState(rooms);
    setPlotWidth(pw);
    setPlotHeight(ph);
    setPlotSize(plotSqFt);
    setFloorPlanSaved(false);

    // Calculate initial material requirements and cost
    const qto = calculateQTO(rooms, state.bimModel);
    const reqs = calculateDetailedMaterials(qto, state.materialRates);
    const total = reqs.reduce((acc, curr) => acc + curr.total, 0);

    setState(prev => ({
      ...prev,
      materialRequirements: reqs,
      estimatedCost: total
    }));
  }, [state.bimModel, state.materialRates]);

  const saveFloorPlan = useCallback(() => setFloorPlanSaved(true), []);

  const resetFloorPlan = useCallback(() => {
    setFloorPlanState([]);
    setPlotWidth(0);
    setPlotHeight(0);
    setPlotSize(0);
    setFloorPlanSaved(false);
    setFloorConfigState(null);
    setState(INITIAL_STATE);
  }, []);

  const setFloorConfig = useCallback((config: FloorConfig) => setFloorConfigState(config), []);
  const setComplianceStatus = useCallback((status: 'Compliant' | 'Non-Compliant' | 'Pending') =>
    setState((p) => ({ ...p, complianceStatus: status })), []);

  const setMaterialRequirements = useCallback((requirements: MaterialRequirement[]) =>
    setState((p) => ({ ...p, materialRequirements: requirements })), []);

  const addChatMessage = useCallback((msg: ChatMessage) => setChatMessages((prev) => [...prev, msg]), []);

  const refreshMaterialRates = useCallback(async (location?: string) => {
    try {
      const loc = location || landAnalysis?.address || "Global Average";
      const newRates = await fetchMaterialRates(loc);
      setState(prev => {
        const updatedRates = { ...prev.materialRates, ...newRates };
        const totalSqFt = floorPlan.reduce((s, r) => s + r.area, 0);
        
        // Re-calculate material requirements with new rates
        const qto = calculateQTO(floorPlan, prev.bimModel);
        const newReqs = calculateDetailedMaterials(qto, updatedRates);
        
        // Group material requirements by category for the cost breakdown
        const newBreakdown: CostBreakdown = newReqs.reduce((acc, req) => {
          const cat = req.category as keyof CostBreakdown;
          acc[cat] = (acc[cat] || 0) + req.total;
          return acc;
        }, {
          foundation: totalSqFt * 600,
          structural: 0,
          brickwork: 0,
          electrical: 0,
          plumbing: 0,
          flooring: 0,
          painting: 0,
          finishing: 0,
          miscellaneous: 180000,
        } as CostBreakdown);

        const newTotal = Object.values(newBreakdown).reduce((a, b) => a + b, 0);
        
        return {
          ...prev,
          materialRates: updatedRates,
          materialRequirements: newReqs,
          costBreakdown: newBreakdown,
          estimatedCost: newTotal
        };
      });
    } catch (e) {
      console.error("Failed to refresh rates:", e);
    }
  }, [landAnalysis, floorPlan]);

  const updateLastAssistantMessage = useCallback((content: string) => setChatMessages((prev) => {
    const last = prev[prev.length - 1];
    if (last?.role === "assistant") {
      return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
    }
    return [...prev, { id: Date.now().toString(), role: "assistant" as const, content }];
  }), []);

  const saveProject = useCallback((projectName: string) => {
    const newProject: SavedProject = {
      id: Date.now().toString(),
      name: projectName || `Project ${projects.length + 1}`,
      dateSaved: new Date().toISOString(),
      floorPlan: floorPlan,
      plotSize,
      plotWidth,
      plotHeight,
      floorConfig,
      landAnalysis,
      bimModel: state.bimModel,
      scores: state.scores,
      projectMeta: state.projectMeta,
      designStyle: state.designStyle,
      totalRooms: state.totalRooms,
      estimatedCost: state.estimatedCost,
      costBreakdown: state.costBreakdown,
      complianceStatus: state.complianceStatus,
      materialRates: state.materialRates,
      materialRequirements: state.materialRequirements,
    };

    setProjects(prev => {
      if (activeProjectId) {
        const existingIndex = prev.findIndex(p => p.id === activeProjectId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          newProject.id = prev[existingIndex].id;
          newProject.name = projectName || prev[existingIndex].name;
          updated[existingIndex] = newProject;
          return updated;
        }
      }
      return [...prev, newProject];
    });

    if (!activeProjectId) {
      setActiveProjectId(newProject.id);
    }
  }, [floorPlan, plotSize, plotWidth, plotHeight, floorConfig, landAnalysis, state, projects, activeProjectId]);

  const loadProject = useCallback((projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    setActiveProjectId(projectId);
    setFloorPlanState(project.floorPlan);
    setPlotSize(project.plotSize);
    setPlotWidth(project.plotWidth);
    setPlotHeight(project.plotHeight);
    setFloorConfigState(project.floorConfig);
    setLandAnalysis(project.landAnalysis);
    setFloorPlanSaved(true);

    setState(prev => ({
      ...prev,
      bimModel: project.bimModel,
      scores: project.scores,
      projectMeta: project.projectMeta,
      designStyle: project.designStyle,
      totalRooms: project.totalRooms,
      estimatedCost: project.estimatedCost,
      costBreakdown: project.costBreakdown,
      complianceStatus: project.complianceStatus,
      materialRates: project.materialRates || DEFAULT_RATES,
      materialRequirements: project.materialRequirements || []
    }));
  }, [projects]);


  const contextValue = useMemo(() => ({
    state, floorPlan, plotSize, plotWidth, plotHeight, hasFloorPlan, floorPlanSaved,
    floorConfig, landAnalysis, setLandAnalysis, setBIMMode, setBIMLayerVisibility, setBIMSelection, updateBIMMetadata,
    setTotalRooms, setEstimatedCost, setProjectMeta, setScores, setCostBreakdown,
    setFloorPlan, saveFloorPlan, resetFloorPlan, setFloorConfig, setComplianceStatus, setMaterialRequirements, refreshMaterialRates, chatMessages,
    addChatMessage, updateLastAssistantMessage,
    projects, activeProjectId, saveProject, loadProject
  }), [
    state, floorPlan, plotSize, plotWidth, plotHeight, hasFloorPlan, floorPlanSaved,
    floorConfig, landAnalysis, setLandAnalysis, setBIMMode, setBIMLayerVisibility, setBIMSelection, updateBIMMetadata,
    setTotalRooms, setEstimatedCost, setProjectMeta, setScores, setCostBreakdown,
    setFloorPlan, saveFloorPlan, resetFloorPlan, setFloorConfig, setComplianceStatus, setMaterialRequirements, refreshMaterialRates, chatMessages,
    addChatMessage, updateLastAssistantMessage, projects, activeProjectId, saveProject, loadProject
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
};
