import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock user for bypass
const MOCK_USER: User = {
  id: "mock-user-id",
  email: "demo@arkai.com",
  user_metadata: { full_name: "Demo User" },
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  created_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  phone: "",
  factors: [],
};

const MOCK_SESSION: Session = {
  access_token: "mock-token",
  refresh_token: "mock-refresh",
  expires_in: 3600,
  token_type: "bearer",
  user: MOCK_USER,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Directly set to mock state to bypass login
  const [user, setUser] = useState<User | null>(MOCK_USER);
  const [session, setSession] = useState<Session | null>(MOCK_SESSION);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // In bypass mode, we essentially ignore external auth changes unless explicitly handled
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Stay as mock user if no real session
      if (!session) {
        setSession(MOCK_SESSION);
        setUser(MOCK_USER);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    // Immediate loading completion
    setLoading(false);

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    return { error: null }; // Mock success
  };

  const signIn = async (email: string, password: string) => {
    return { error: null }; // Mock success
  };

  const signOut = async () => {
    // Reset to mock state on sign out
    setUser(MOCK_USER);
    setSession(MOCK_SESSION);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
