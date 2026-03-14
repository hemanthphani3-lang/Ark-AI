import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import ClickAnimation from "@/components/ClickAnimation";
import Dashboard from "@/pages/Dashboard";
import LandIntelligence from "@/pages/LandIntelligence";
import FloorPlanGenerator from "@/pages/FloorPlanGenerator";
import StructuralAnalysis from "@/pages/StructuralAnalysis";
import VastuEngine from "@/pages/VastuEngine";
import PhysicsEngine from "@/pages/PhysicsEngine";
import ComplianceCheck from "@/pages/ComplianceCheck";
import Visualization3D from "@/pages/Visualization3D";
import FinalLook from "@/pages/FinalLook";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import AuthPage from "@/pages/AuthPage";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import Visualizer from "@/pages/Visualizer";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ClickAnimation />
      <Toaster />
      <Sonner />
      <ThemeProvider>
        <AuthProvider>
          <AppProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <AppLayout>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/land-intelligence" element={<LandIntelligence />} />
                          <Route path="/floor-plan" element={<FloorPlanGenerator />} />
                          <Route path="/structural" element={<StructuralAnalysis />} />
                          <Route path="/physics" element={<PhysicsEngine />} />
                          <Route path="/vastu" element={<VastuEngine />} />
                          <Route path="/compliance" element={<ComplianceCheck />} />
                          <Route path="/visualizer" element={<Visualizer />} />
                          <Route path="/reports" element={<ReportsPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </BrowserRouter>
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
