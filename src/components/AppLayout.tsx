import { ReactNode, useState } from "react";
import { useLocation } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import FloatingChatbot from "./FloatingChatbot";
import TopBar from "./TopBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-white relative">
      <div className="luxury-mesh-bg" />
      <AppSidebar collapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />
      <div
        className={`${isSidebarCollapsed ? "ml-[60px]" : "ml-72"} sidebar-transition min-h-screen flex flex-col`}
      >
        <TopBar />
        <main className="flex-1 p-8 overflow-x-hidden relative">
          <div key={pathname} className="animate-fade-in pb-12">
            {children}
          </div>
        </main>
      </div>
      <FloatingChatbot />
    </div>
  );
}
