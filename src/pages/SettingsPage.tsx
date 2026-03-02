import { Settings, Sun, Moon, User, Cloud } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

const SettingsPage = () => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  return (
    <div className="module-container max-w-3xl">
      <div className="glass-card">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Settings</h2>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Account</p>
                  <p className="text-[10px] text-muted-foreground">{user?.email || "Not signed in"}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <p className="text-xs font-semibold text-foreground">Theme</p>
                  <p className="text-[10px] text-muted-foreground">Currently: {theme === "dark" ? "Dark Mode" : "Light Mode"}</p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:border-primary/30 transition-all"
              >
                Switch to {theme === "dark" ? "Light" : "Dark"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold text-foreground">Cloud Sync</p>
                <p className="text-[10px] text-muted-foreground">Projects auto-save to cloud with version history.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
