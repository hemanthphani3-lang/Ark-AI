import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Wifi, WifiOff, Compass, ArrowRight } from "lucide-react";
import { useAppState, ChatMessage } from "@/context/AppContext";
import Markdown from "react-markdown";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

/* ─── Local Fallback AI ─── */
function getLocalAnswer(userText: string, ctx: any): string {
  const q = userText.toLowerCase();

  if (q.includes("cost") || q.includes("price") || q.includes("budget") || q.includes("estimat")) {
    if (!ctx.hasFloorPlan) return "Generate a floor plan first to get accurate cost estimates. Use the **Floor Planning** module to set your plot dimensions and rooms.";
    const breakdown = ctx.costBreakdown;
    return `Based on your **${ctx.plotSize} sq ft** plan across **${ctx.floors} floor(s)**:

💰 **Total Estimated Cost: ₹${ctx.totalCost.toLocaleString()}**

**Breakdown:**
- Structure & Foundation: ₹${(breakdown.foundation + breakdown.structural).toLocaleString()}
- Finishing & Painting: ₹${(breakdown.finishing + breakdown.painting).toLocaleString()}
- MEP (Elec/Plumb): ₹${(breakdown.electrical + breakdown.plumbing).toLocaleString()}
- Others: ₹${(breakdown.miscellaneous).toLocaleString()}

> Costs are area-indexed based on current material rates.`;
  }

  if (q.includes("room") || q.includes("bedroom") || q.includes("floor plan") || q.includes("layout")) {
    if (!ctx.hasFloorPlan) return "You haven't generated a floor plan yet. Go to **Floor Planning** to configure your plot dimensions and room layout. I'll analyze it once it's ready!";
    const roomList = ctx.floorPlan.map((r: any) => `- **${r.name}**: ${r.width.toFixed(1)}' x ${r.height.toFixed(1)}' (${r.area.toFixed(1)} sq ft)`).join("\n");
    return `Your current plan has **${ctx.rooms} rooms** across **${ctx.floors} floor(s)** on **${ctx.plotSize} sq ft** plot.

**Detailed Room List:**
${roomList}

**Zone Summary:**
- Central circulation is handled via ${ctx.floorPlan.find((r: any) => r.name.includes("Living")) ? "the Living Room hub" : "a central corridor"}.
- Wet areas (Bathrooms/Kitchen) are ${ctx.floorPlan.filter((r: any) => r.isWetArea).length > 0 ? "identified for plumbing optimization" : "pending placement"}.`;
  }

  if (q.includes("vastu") || q.includes("direction") || q.includes("facing")) {
    return `**Vastu Intelligence Report:**
- **Project Facing:** ${ctx.projectMeta.facing}
- **Vastu Mode:** ${ctx.projectMeta.vastuMode}
- **Current Score:** ${ctx.scores.vastu}/100

🏠 **Key Placements Recommendation:**
- **Kitchen** → Southeast (fire)
- **Master Bedroom** → Southwest (stability)
- **Pooja Room** → Northeast (spiritual)

Visit the **Vastu Engine** module for a detailed room-by-room analysis based on your ${ctx.projectMeta.facing} facing plot.`;
  }

  if (q.includes("structure") || q.includes("safe") || q.includes("compliance")) {
    return `**Safety & Compliance Report:**
- **Structural Score:** ${ctx.scores.structural}/100
- **Compliance status:** ${ctx.compliance}
- **FAR Ratio:** Checked against bylaws for ${ctx.plotSize} sq ft.

🏗️ Structural Advice:
- Column grid is optimized for ${ctx.plotSize < 1200 ? "residential G+1" : "independent villa"} loads.
- Staircase core is structurally centralized for stability.`;
  }

  if (q.includes("hello") || q.includes("hi") || q.includes("help")) {
    return `👋 Hello! I'm **ArkAI Co-Pilot**. I have full access to your project data.

Current Snapshot:
- **Plot:** ${ctx.plotSize} sq ft, ${ctx.projectMeta.facing} facing
- **Layout:** ${ctx.rooms} rooms, ${ctx.floors} floors
- **Cost:** ₹${ctx.totalCost.toLocaleString()}
- **Compliance:** ${ctx.compliance}

What specific part of your design can I help you optimize?`;
  }

  // Generic response
  return `I'm your **ArkAI Co-Pilot** 🏗️

${ctx.hasFloorPlan ? `I've analyzed your **${ctx.plotSize} sq ft** project. It has **${ctx.rooms} rooms** with a total cost estimate of **₹${ctx.totalCost.toLocaleString()}**.` : "I can help with planning once you start your floor plan."}

I can answer questions about specific room sizes, Vastu placements, or cost breakdowns. What would you like to know?`;
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
    floorPlan: context.floorPlan,
    rooms: context.floorPlan.length,
    floors: context.floorConfig?.numFloors || 1,
    plotSize: context.plotSize,
    totalCost: context.state.estimatedCost,
    costBreakdown: context.state.costBreakdown,
    compliance: context.state.complianceStatus,
    scores: context.state.scores,
    projectMeta: context.state.projectMeta,
    materialRequirements: context.state.materialRequirements,
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

    const fullCtx = buildCtx();
    const ctxString = JSON.stringify({
      plot_info: { size: fullCtx.plotSize, width: context.plotWidth, height: context.plotHeight },
      project_meta: fullCtx.projectMeta,
      stats: {
        rooms: fullCtx.rooms,
        floors: fullCtx.floors,
        total_cost: fullCtx.totalCost,
        scores: fullCtx.scores,
        compliance: fullCtx.compliance,
      },
      detailed_rooms: fullCtx.floorPlan.map(r => ({
        name: r.name,
        area: r.area,
        floor: r.floor,
        zone: r.zone,
        is_wet_area: r.isWetArea
      })),
      cost_breakdown: fullCtx.costBreakdown,
      material_requirements: fullCtx.materialRequirements.map(m => ({
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        total_cost: m.total
      }))
    });

    const userInjectedContent = `[SYSTEM CONTEXT: ${ctxString}]\n\nUSER QUESTION: ${text}`;
    allMessages.push({ role: "user", content: userInjectedContent });

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
        className={`fixed bottom-10 right-10 z-50 flex h-20 w-20 items-center justify-center rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.4)] transition-all duration-700 glass-panel group overflow-hidden ${!open ? "aura-pulse" : ""
          }`}
        style={{
          borderColor: "var(--logo-badge-border)",
          background: open ? "var(--sidebar-background)" : "var(--logo-badge-bg)",
          transform: open ? "rotate(180deg) scale(0.9)" : "rotate(0deg)"
        }}
      >
        <div className="absolute inset-0 metallic-shimmer opacity-20 group-hover:opacity-40 transition-opacity" />
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

        {open ? (
          <X className="h-7 w-7 text-foreground relative z-10 transition-transform duration-500" style={{ transform: "rotate(-180deg)" }} />
        ) : (
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-150" />
              <MessageCircle className="h-8 w-8 text-foreground relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
            </div>
            <span className="text-[7px] font-black tracking-[0.4em] text-foreground/60 uppercase mt-1 ml-1">Studio</span>
          </div>
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-36 right-10 z-50 w-[420px] rounded-[2rem] border border-sidebar-border/50 bg-sidebar shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] animate-fade-in flex flex-col overflow-hidden backdrop-blur-3xl"
          style={{ height: 620 }}
        >
          {/* Header */}
          <div className="flex items-center gap-4 border-b border-sidebar-border/30 px-7 py-6 shrink-0 bg-gradient-to-b from-foreground/[0.04] to-transparent">
            <div className="relative h-12 w-12 rounded-2xl bg-[var(--logo-badge-bg)] border border-[var(--logo-badge-border)] flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute inset-0 metallic-shimmer opacity-30" />
              <img src="/ark-ai-logo.png" alt="Concierge" className="h-7 w-7 object-contain relative z-10 filter drop-shadow-md" />
            </div>
            <div className="flex-1">
              <p className="luxury-text metallic-text text-base font-medium tracking-[0.15em]">Studio Concierge</p>
              <div className="flex items-center gap-2 mt-1">
                <div className={`h-2 w-2 rounded-full ${isOnline ? "bg-success shadow-[0_0_12px_rgba(var(--success-rgb),0.6)]" : "bg-warning animate-pulse"}`} />
                <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground/60 uppercase">
                  {isOnline ? "Intelligence Protocol Active" : "Local Restricted Mode"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-10 w-10 rounded-xl hover:bg-foreground/5 flex items-center justify-center transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Chat Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 luxury-scrollbar">
            {chatMessages.length === 0 && (
              <div className="text-center py-8 space-y-4 px-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5 border border-primary/10 mb-2">
                  <Compass className="h-6 w-6 text-primary opacity-40" />
                </div>
                <div>
                  <h3 className="luxury-text text-xs tracking-widest text-foreground font-semibold mb-2">How may I assist your masterpiece?</h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
                    I am trained on your specific project metadata to provide structural, financial, and Vastu intelligence.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-6">
                  {["What's my estimated cost?", "Vastu tips for kitchen", "Is my plan compliant?"].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); }}
                      className="px-4 py-2.5 rounded-xl bg-foreground/[0.03] hover:bg-foreground/[0.06] text-[10px] text-left text-muted-foreground hover:text-foreground transition-all border border-foreground/[0.05] group flex items-center justify-between"
                    >
                      {q}
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={msg.id + i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[11px] leading-relaxed shadow-sm ${msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-none"
                  : "bg-muted/50 text-foreground border border-border/30 rounded-bl-none"
                  }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-xs prose-invert max-w-none [&_p]:mb-2 [&_ul]:mb-1 [&_li]:mb-0.5 [&_strong]:text-foreground [&_strong]:font-bold">
                      <Markdown>{msg.content || "Thinking..."}</Markdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-line">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-sidebar-border/50 bg-gradient-to-t from-foreground/[0.02] to-transparent">
            <div className="relative flex items-center">
              <input
                className="w-full bg-foreground/[0.05] border-none rounded-xl pl-4 pr-12 py-3 text-[11px] focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50"
                placeholder="Message your Studio Concierge..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                disabled={isLoading}
              />
              <button
                onClick={send}
                disabled={isLoading || !input.trim()}
                className="absolute right-2 h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-30 transition-all"
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
