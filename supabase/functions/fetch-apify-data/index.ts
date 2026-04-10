import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { property_id, apify_token, actor_id, type, year, month, city } = body;

    if (!property_id || !apify_token || !actor_id || !type || !year || !month || !city) {
      return new Response(JSON.stringify({ error: "Missing required fields (including city)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run the Apify actor with required city input
    const runUrl = `https://api.apify.com/v2/acts/${actor_id}/run-sync-get-dataset-items?token=${apify_token}`;
    const apifyRes = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city }),
    });

    if (!apifyRes.ok) {
      const errText = await apifyRes.text();
      return new Response(JSON.stringify({ error: `Apify error [${apifyRes.status}]: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items: any[] = await apifyRes.json();

    // Extract prices
    const prices = items
      .map((item: any) => Number(item.price))
      .filter((p: number) => !isNaN(p) && p > 0);

    const sampleSize = prices.length;
    const avgPrice = sampleSize > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / sampleSize : 0;
    const stdDev = sampleSize > 1
      ? Math.sqrt(prices.reduce((sum: number, p: number) => sum + Math.pow(p - avgPrice, 2), 0) / (sampleSize - 1))
      : 0;

    // Map raw data to keep relevant fields
    const rawData = items.map((item: any) => ({
      neighbourhood: item.neighbourhood || item.neighborhood || "",
      address: item.address || "",
      areaSqm: item.areaSqm || item.area || 0,
      price: item.price || 0,
      rooms: item.rooms || 0,
    }));

    // Upsert snapshot
    const { data: snapshot, error: snapError } = await supabase
      .from("property_snapshots")
      .upsert(
        {
          property_id,
          user_id: user.id,
          type,
          year,
          month,
          avg_price: Math.round(avgPrice),
          sample_size: sampleSize,
          std_deviation: Math.round(stdDev),
          raw_data: rawData,
        },
        { onConflict: "property_id,type,year,month" }
      )
      .select()
      .single();

    if (snapError) {
      return new Response(JSON.stringify({ error: snapError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ snapshot, itemCount: items.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
