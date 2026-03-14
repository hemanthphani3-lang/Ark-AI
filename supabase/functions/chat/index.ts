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
    const keys = [
      Deno.env.get("GEMINI_API_KEY_1") || Deno.env.get("GEMINI_API_KEY"),
      Deno.env.get("GEMINI_API_KEY_2"),
      Deno.env.get("GEMINI_API_KEY_3"),
      Deno.env.get("GEMINI_API_KEY_4")
    ].filter(Boolean) as string[];

    if (keys.length === 0) throw new Error("No GEMINI_API_KEY configured");

    let lastErrorData = null;
    let lastStatus = 500;
    let successfulResponse = null;

    for (const apiKey of keys) {
      try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-1.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...messages,
            ],
            temperature: 0.9,
            stream: true,
          }),
        });

        if (response.ok) {
          successfulResponse = response;
          break; // Success! Exit the loop.
        }

        const errorData = await response.json().catch(() => ({}));
        lastErrorData = errorData;
        lastStatus = response.status;
        console.warn(`Key failed with status ${response.status}`);

        // If it's a Bad Request (e.g. invalid messages format), switching keys won't help
        if (response.status === 400) {
          break;
        }
        // Otherwise (429 Rate Limit, 401/403 Invalid or Out of Quota, 5xx server error), try the next key
      } catch (err) {
        console.warn("Fetch exception with a key:", err);
      }
    }

    if (!successfulResponse) {
      console.error("All AI API keys failed. Last error:", lastErrorData);
      return new Response(JSON.stringify({ 
        error: "All AI keys failed or rate limit exceeded. Please try again later." 
      }), {
        status: lastStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(successfulResponse.body, {
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
