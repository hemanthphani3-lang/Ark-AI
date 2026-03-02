import { useLocation } from "react-router-dom";
import { useAppState } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Activity, Shield, Compass, Wallet, Sun, Moon, LogOut, Save } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/land-intelligence": "Land Intelligence",
  "/floor-plan": "Floor Planning Engine",
  "/structural": "Structural Analysis",
  "/vastu": "Vastu Intelligence",
  "/compliance": "Compliance Check",
  "/visualization": "3D Visualization",
  "/final-look": "Final Look",
  "/reports": "Reports",
  "/settings": "Settings",
};

const ScorePill = ({ label, value, icon: Icon, colorVar }: { label: string; value: number; icon: React.ElementType; colorVar: string }) => (
  <div className="score-pill">
    <Icon className="h-3 w-3" style={{ color: `hsl(var(${colorVar}))` }} />
    <span className="text-muted-foreground hidden lg:inline">{label}</span>
    <span className="score-pill-value" style={{ color: `hsl(var(${colorVar}))` }}>{value}</span>
  </div>
);

export default function TopBar() {
  const location = useLocation();
  const { state, floorPlanSaved } = useAppState();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const title = pageTitles[location.pathname] || "ArkAI";

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center border-b border-border bg-background/90 backdrop-blur-md px-6 gap-4">
      <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {floorPlanSaved && (
          <div className="flex items-center gap-1.5">
            <ScorePill label="Health" value={72} icon={Activity} colorVar="--score-health" />
            <ScorePill label="Structure" value={85} icon={Shield} colorVar="--score-structural" />
            <ScorePill label="Vastu" value={68} icon={Compass} colorVar="--score-vastu" />
            <ScorePill label="Budget" value={91} icon={Wallet} colorVar="--score-budget" />
          </div>
        )}

        <div className="h-5 w-px bg-border mx-1" />

        <button
          onClick={toggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {user && (
          <button
            onClick={signOut}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20">
          {user ? (user.email?.charAt(0).toUpperCase() || "U") : "AI"}
        </div>
      </div>
    </header>
  );
}
