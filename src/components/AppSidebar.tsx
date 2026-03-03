import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard, MapPin, Grid3X3, Shield, Box, Eye,
  FileText, Settings, Lock, ChevronLeft, ChevronRight,
  Compass, Building2, Zap, Layout, Atom, Rotate3d, Palette
} from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/context/AppContext";

const navGroups = [
  {
    label: "Journey",
    items: [
      { title: "Dashboard", path: "/", icon: LayoutDashboard, locked: false },
    ],
  },
  {
    label: "Discovery",
    items: [
      { title: "Land Intelligence", path: "/land-intelligence", icon: MapPin, locked: false },
    ],
  },
  {
    label: "Studio",
    items: [
      { title: "Floor Planning", path: "/floor-plan", icon: Grid3X3, locked: false },
      { title: "Visualizer", icon: Rotate3d, path: "/visualizer", locked: true },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { title: "Structural Analysis", path: "/structural", icon: Building2, locked: true },
      { title: "Vastu Engine", path: "/vastu", icon: Compass, locked: true },
      { title: "Physics Engine", path: "/physics", icon: Atom, locked: true },
      { title: "Compliance Check", path: "/compliance", icon: Shield, locked: true },
    ],
  },
  {
    label: "Delivery",
    items: [
      { title: "Reports", path: "/reports", icon: FileText, locked: true },
      { title: "Settings", path: "/settings", icon: Settings, locked: false },
    ],
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { state, floorPlanSaved, setBIMMode } = useAppState();

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-250 ${collapsed ? "w-[60px]" : "w-72"
        }`}
    >
      {/* Logo */}
      <div className={`flex flex-col items-center justify-center border-b border-sidebar-border/50 py-6 transition-all duration-500 ${collapsed ? "px-2" : "px-4"}`}>
        <div className="relative group">
          <div className="absolute -inset-2 bg-gradient-to-b from-white/10 to-transparent rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--logo-badge-bg)] border border-[var(--logo-badge-border)] shadow-2xl backdrop-blur-sm mb-3 overflow-hidden">
            <div className="absolute inset-0 metallic-shimmer opacity-20" />
            <img src="/ark-ai-logo.png" alt="ArkAI Logo" className="h-7 w-7 object-contain relative z-10 filter drop-shadow-md transition-transform duration-700 group-hover:scale-110" />
          </div>
        </div>

        {!collapsed && (
          <div className="text-center animate-fade-in">
            <h1 className="luxury-text metallic-text text-xl font-medium tracking-[0.2em] mb-1 leading-tight">
              ArkAI
            </h1>
            <div className="flex items-center justify-center gap-2 px-2">
              <div className="h-[1px] w-4 bg-gradient-to-r from-transparent to-[var(--logo-separator)]" />
              <span className="text-[8px] font-bold tracking-[0.3em] text-[var(--logo-subtext-color)] uppercase whitespace-nowrap">
                Private Studio
              </span>
              <div className="h-[1px] w-4 bg-gradient-to-l from-transparent to-[var(--logo-separator)]" />
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* BIM Toggle Section */}
        <div className="px-2 mb-2">
          {!collapsed && <p className="section-label">BIM Engine</p>}
          <button
            onClick={() => setBIMMode(!state.bimMode)}
            className={`sidebar-item w-full group relative transition-all ${state.bimMode ? "text-primary border border-primary/20 bg-primary/5" : ""}`}
            title={collapsed ? "Toggle BIM Intelligence" : ""}
          >
            <Zap className={`h-4 w-4 shrink-0 ${state.bimMode ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
            {!collapsed && (
              <div className="flex flex-1 items-center justify-between">
                <span className="truncate font-bold text-[11px] tracking-tight">
                  {state.bimMode ? "BIM INTELLIGENCE ON" : "ENABLE BIM MODE"}
                </span>
                <div className={`h-2 w-2 rounded-full ${state.bimMode ? "bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]" : "bg-muted"}`} />
              </div>
            )}
          </button>
        </div>

        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && <p className="section-label">{group.label}</p>}
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const active = location.pathname === item.path;
                const isLocked = item.locked && !floorPlanSaved;

                if (isLocked) {
                  return (
                    <div
                      key={item.path}
                      className="sidebar-item opacity-30 cursor-not-allowed"
                      title={collapsed ? `${item.title} (Locked)` : "Save a floor plan first"}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.title}</span>
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`sidebar-item relative ${active ? "sidebar-item-active" : ""}`}
                    title={item.title}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.title}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-10 items-center justify-center border-t border-sidebar-border text-muted-foreground transition-colors hover:text-foreground"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
