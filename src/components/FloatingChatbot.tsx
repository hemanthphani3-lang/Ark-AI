import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Wifi, WifiOff } from "lucide-react";
import { useAppState, ChatMessage } from "@/context/AppContext";
import Markdown from "react-markdown";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

/* ─── Local Fallback AI ─── */
function getLocalAnswer(userText: string, ctx: {
  hasFloorPlan: boolean; rooms: number; floors: number; plotSize: number;
  totalCost: number; compliance: string; scores: { structural: number; circulation: number; vastu: number; cost: number };
}): string {
  const q = userText.toLowerCase();

  if (q.includes("cost") || q.includes("price") || q.includes("budget") || q.includes("estimat")) {
    if (!ctx.hasFloorPlan) return "Generate a floor plan first to get accurate cost estimates. Use the **Floor Planning** module to set your plot dimensions and rooms.";
    return `Based on your **${ctx.plotSize} sq ft** plan across **${ctx.floors} floor(s)**:\n\n💰 **Total Estimated Cost: ₹${ctx.totalCost.toLocaleString()}**\n\n- Foundation & Structure: ~40% of total\n- Electrical & Plumbing: ~12%\n- Flooring & Finishes: ~30%\n- Miscellaneous: ~8%\n\n> Costs are area-indexed and may vary by material grade and contractor rates.`;
  }

  if (q.includes("room") || q.includes("bedroom") || q.includes("floor plan") || q.includes("layout")) {
    if (!ctx.hasFloorPlan) return "You haven't generated a floor plan yet. Go to **Floor Planning** to configure your plot dimensions and room layout. I'll analyze it once it's ready!";
    return `Your current plan has **${ctx.rooms} rooms** across **${ctx.floors} floor(s)** on **${ctx.plotSize} sq ft**.\n\n**Zone Summary:**\n- Living Room is the central circulation hub\n- Bathrooms are clustered in the wet core for plumbing efficiency\n- Private zones are positioned away from street-facing areas\n\nWould you like tips on optimizing any specific room?`;
  }

  if (q.includes("vastu") || q.includes("direction") || q.includes("north") || q.includes("east") || q.includes("facing")) {
    return `**Vastu Basics for Residential Design:**\n\n🏠 **Key Placements:**\n- **Kitchen** → Southeast (fire element)\n- **Master Bedroom** → Southwest (earth stability)\n- **Pooja Room** → Northeast (spiritual energy)\n- **Living Room** → North or East (open energy)\n- **Bathroom** → Northwest (air element)\n\nYour Vastu score is **${ctx.scores.vastu}/100**. Visit the **Vastu Engine** module for a detailed room-by-room analysis.`;
  }

  if (q.includes("structure") || q.includes("structural") || q.includes("safe") || q.includes("foundation") || q.includes("column")) {
    return `**Structural Intelligence Report:**\n\n🏗️ Structural Safety Score: **${ctx.scores.structural}/100**\n\n- Columns recommended: every 10-12 ft on a structural grid\n- For multi-floor buildings (G+1+), a **Dog-leg or U-shape staircase** core is reserved\n- Raft foundation recommended for plots under 1200 sq ft\n- Seismic Zone II-III compliance is auto-applied\n\nCheck the **Structural Analysis** module for a full report.`;
  }

  if (q.includes("compliance") || q.includes("regulation") || q.includes("bylaw") || q.includes("permit") || q.includes("legal")) {
    return `**Compliance Status: ${ctx.compliance}**\n\n📋 Key regulations checked:\n- ✅ Minimum plot size (600 sq ft)\n- ✅ Ground coverage (max 75%)\n- ✅ Setback requirements\n- ✅ Floor Area Ratio (FAR ≤ 2.5)\n- ${ctx.plotSize >= 800 ? "✅" : "❌"} Parking provision\n\nVisit the **Compliance Check** module for your full regulation report.`;
  }

  if (q.includes("hello") || q.includes("hi") || q.includes("hey") || q.includes("help")) {
    return `👋 Hello! I'm **ArkAI Co-Pilot** — your intelligent construction assistant.\n\nI can help you with:\n- 📐 **Floor plan** optimization\n- 💰 **Cost estimations** and budget planning\n- 🏗️ **Structural safety** guidance\n- 🧭 **Vastu compliance** advice\n- 📋 **Building regulations** and compliance\n\n${ctx.hasFloorPlan ? `Your current project: **${ctx.plotSize} sq ft**, ${ctx.rooms} rooms, ${ctx.floors} floors.` : "Start by generating a floor plan to unlock full AI analysis."}\n\nWhat would you like to know?`;
  }

  if (q.includes("stair") || q.includes("staircase")) {
    return `**Staircase Guidance:**\n\n🪜 For **G+1 or higher** buildings, a dedicated staircase core is mandatory.\n\nTypes available in ArkAI:\n- **Dog-leg** (most common, space-efficient)\n- **U-shape** (for larger plots)\n- **L-shape** (corner plots)\n- **Straight** (minimal footprint)\n\nThe staircase core is reserved before room placement to ensure structural alignment.`;
  }

  // Generic response
  return `I'm your **ArkAI Co-Pilot** 🏗️\n\n${ctx.hasFloorPlan ? `Your current plan: **${ctx.plotSize} sq ft**, ${ctx.rooms} rooms, ${ctx.floors} floor(s). Total cost estimate: **₹${ctx.totalCost.toLocaleString()}**.\n\n` : ""}I can answer questions about:\n- Cost & budget\n- Room layouts & floor planning\n- Structural safety\n- Vastu compliance\n- Building regulations\n\nWhat would you like to know about your project?`;
}

type Msg = { role: "user" | "assistant"; content: string };

async function streamChatOnline({
  messages, onDelta, onDone, onError,
}: {
  messages: Msg[]; onDelta: (text: string) => void; onDone: () => void; onError: (err: string) => void;
}): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      onError(`api_error_${resp.status}`);
      return false;
    }
    if (!resp.body) { onError("no_stream"); return false; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") { onDone(); return true; }
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { buf = line + "\n" + buf; break; }
      }
    }
    onDone();
    return true;
  } catch (e: any) {
    onError(e?.name === "AbortError" ? "timeout" : "network_error");
    return false;
  }
}

export default function FloatingChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const context = useAppState();
  const { chatMessages, addChatMessage, updateLastAssistantMessage } = context;
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantRef = useRef("");

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMessages, open]);

  const buildCtx = () => ({
    hasFloorPlan: context.hasFloorPlan,
    rooms: context.floorPlan.length,
    floors: context.floorConfig?.numFloors || 1,
    plotSize: context.plotSize,
    totalCost: context.state.estimatedCost,
    compliance: context.state.complianceStatus,
    scores: context.state.scores,
  });

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text };
    addChatMessage(userMsg);
    setInput("");
    setIsLoading(true);
    assistantRef.current = "";

    // Seed an empty assistant message for streaming
    const placeholderMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", content: "" };
    addChatMessage(placeholderMsg);

    const allMessages: Msg[] = chatMessages
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    const ctxInfo = context.hasFloorPlan
      ? `[Project: ${context.plotSize} sqft, ${context.floorPlan.length} rooms, ${context.floorConfig?.numFloors || 1} floors, Cost: ₹${context.state.estimatedCost.toLocaleString()}]`
      : "[No floor plan yet]";
    allMessages.push({ role: "user", content: `${ctxInfo}\n\n${text}` });

    const upsert = (chunk: string) => {
      assistantRef.current += chunk;
      updateLastAssistantMessage(assistantRef.current);
    };

    // Try online first
    const success = await streamChatOnline({
      messages: allMessages,
      onDelta: upsert,
      onDone: () => {
        setIsLoading(false);
        setIsOnline(true);
      },
      onError: (err) => {
        if (err.startsWith("api_error_429")) {
          updateLastAssistantMessage("⚠️ Rate limit reached. Using local AI mode.\n\n" + getLocalAnswer(text, buildCtx()));
        } else {
          // Fall back to local AI
          setIsOnline(false);
          const localResp = getLocalAnswer(text, buildCtx());
          updateLastAssistantMessage(localResp);
        }
        setIsLoading(false);
      },
    });

    if (!success && assistantRef.current === "") {
      // Absolute fallback
      const localResp = getLocalAnswer(text, buildCtx());
      updateLastAssistantMessage(localResp);
      setIsLoading(false);
      setIsOnline(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300 hover:scale-105"
        style={{ background: "var(--gradient-primary)" }}
      >
        {open ? <X className="h-6 w-6 text-primary-foreground" /> : <MessageCircle className="h-6 w-6 text-primary-foreground" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 rounded-xl border border-border bg-card shadow-2xl animate-fade-in flex flex-col" style={{ height: 520 }}>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <MessageCircle className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">ArkAI Co-Pilot</p>
              <p className="text-[10px] text-muted-foreground">AI construction assistant</p>
            </div>
            <div className="flex items-center gap-1.5">
              {isOnline ? (
                <span title="Connected to cloud AI">
                  <Wifi className="h-3 w-3 text-success" />
                </span>
              ) : (
                <span title="Local AI mode (offline)">
                  <WifiOff className="h-3 w-3 text-warning" />
                </span>
              )}
              <span className={`text-[9px] font-bold ${isOnline ? "text-success" : "text-warning"}`}>
                {isOnline ? "CLOUD" : "LOCAL"}
              </span>
            </div>
            {isLoading && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-xs text-muted-foreground text-center mt-6 space-y-2 px-4">
                <p className="text-2xl">🏗</p>
                <p className="font-semibold text-foreground">ArkAI Co-Pilot</p>
                <p className="leading-relaxed">Ask me about floor plans, cost estimates, structural safety, Vastu, or building compliance.</p>
                <div className="mt-4 space-y-1.5">
                  {["What's my estimated cost?", "Explain my floor layout", "Vastu tips for kitchen", "Is my plan compliant?"].map(q => (
                    <button key={q} onClick={() => { setInput(q); }} className="block w-full text-left px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-[10px] font-medium text-muted-foreground hover:text-foreground transition-all border border-border">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={msg.id + i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-xs prose-invert max-w-none [&_p]:mb-1.5 [&_ul]:mb-1 [&_li]:mb-0.5 [&_strong]:text-foreground">
                      <Markdown>{msg.content || "…"}</Markdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-line">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-3 shrink-0">
            <div className="flex gap-2">
              <input
                className="input-dark flex-1 text-xs py-2"
                placeholder="Ask about rooms, costs, structure..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                disabled={isLoading}
              />
              <button
                onClick={send}
                disabled={isLoading || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
