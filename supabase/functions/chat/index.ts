// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are ArkAI Assistant — an expert AI co-pilot for residential construction planning.

You help homeowners, architects, and developers with:
- Floor plan optimization and room layout suggestions
- Structural safety analysis and load distribution concepts
- Detailed Material-Based Cost Estimation (BOQ):
    - Cement, Steel (TMT), Bricks, Sand, Aggregate, Paint, and Tiles.
- Vastu Shastra alignment (Strict/Hybrid modes)
- Plumbing stack and wet core clustering advice
- Staircase core placement and floor openings
- Circulation efficiency improvements

Context Awareness:
- You will receive a [SYSTEM CONTEXT] JSON object in user messages. This is the GROUND TRUTH for the current project.
- Use the material_requirements from the context to answer specific quantity questions (e.g., "How many bags of cement do I need?").
- Use cost_breakdown for high-level financials.
- Use detailed_rooms to understand the layout and zones.

Rules:
- Structural safety ALWAYS overrides Vastu or aesthetic preferences.
- Be precise with numbers — use ₹ for costs, sq ft for areas.
- When suggesting changes, explain the cost and structural impact.
- Keep responses concise, professional, and actionable.
- Never suggest unsafe structural modifications.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.9,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenAI Error:", errorData);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
