import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CategoryOption {
  id: string;
  name: string;
  parent_name?: string | null;
  type: "income" | "expense";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { recipients, categories } = await req.json() as {
      recipients: { name: string; isIncome: boolean }[];
      categories: CategoryOption[];
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const catList = categories
      .map((c) => `- id:${c.id} | type:${c.type} | name:${c.parent_name ? `${c.parent_name} > ${c.name}` : c.name}`)
      .join("\n");

    const userPrompt = `סווג כל נמען לקטגוריה המתאימה ביותר מהרשימה (העדף תת-קטגוריה אם רלוונטי). אם אף קטגוריה לא מתאימה, החזר null.\n\nקטגוריות זמינות:\n${catList}\n\nנמענים לסיווג (שם / סוג):\n${recipients.map((r, i) => `${i + 1}. ${r.name} (${r.isIncome ? "הכנסה" : "הוצאה"})`).join("\n")}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "אתה מסווג נמענים פיננסיים בעברית לקטגוריות. החזר רק tool call." },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_recipients",
            description: "Return category_id (or null) for each recipient by name",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      recipient: { type: "string" },
                      category_id: { type: ["string", "null"] },
                    },
                    required: ["recipient", "category_id"],
                  },
                },
              },
              required: ["results"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_recipients" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : { results: [] };

    return new Response(JSON.stringify(args), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
