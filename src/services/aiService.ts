import { createClient } from "@supabase/supabase-js";
import { MaterialRates } from "../utils/costEstimationEngine";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchMaterialRates(location: string): Promise<Partial<MaterialRates>> {
  const prompt = `Give me the CURRENT average market rates for residential construction materials in ${location}. 
  Return ONLY a valid raw JSON object with these exact keys: CEMENT (per 50kg bag), STEEL (per kg), BRICKS (per piece), SAND (per cu ft), AGGREGATE (per cu ft), PAINT (per liter), TILES (per sq ft), PIPES (per meter), FITTINGS (per fixture set), WIRE (per 90m coil), SWITCHES (per unit).
  
  Format:
  {"CEMENT": 450, "STEEL": 72, "BRICKS": 9, ...}
  
  Return only the JSON, no explanation or markdown code blocks.`;

  try {
    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        messages: [{ role: 'user', content: prompt }]
      }
    });

    if (error) throw error;

    // The chat function returns a stream, let's process it
    const reader = data.getReader();
    const decoder = new TextDecoder();
    let content = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.replace('data: ', '');
            if (jsonStr === '[DONE]') break;
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            content += delta;
          } catch (e) {
            // Might be incomplete JSON or other stream data
          }
        }
      }
    }

    // Try to extract JSON from the accumulated content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error("Could not parse AI response as JSON");
  } catch (error) {
    console.error("Error fetching material rates:", error);
    throw error;
  }
}
