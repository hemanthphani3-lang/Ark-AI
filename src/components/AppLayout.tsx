import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import FloatingChatbot from "./FloatingChatbot";
import TopBar from "./TopBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="ml-56 transition-all duration-250">
        <TopBar />
        <main className="p-6">{children}</main>
      </div>
      <FloatingChatbot />
    </div>
  );
}
