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
    const { property_id, apify_token, actor_id, type, year, month, city, street, house_number } = body;

    if (!property_id || !apify_token || !actor_id || !type || !year || !month || !city) {
      return new Response(JSON.stringify({ error: "Missing required fields (including city)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build actor input — pass all location fields the actor might need
    const actorInput: Record<string, unknown> = {
      city,
      ...(street ? { street } : {}),
      ...(house_number ? { houseNumber: house_number } : {}),
    };

    console.log("Apify actor input:", JSON.stringify(actorInput));
    console.log("Actor ID:", actor_id, "Type:", type);

    // Step 1: Start the actor run (async)
    const startUrl = `https://api.apify.com/v2/acts/${actor_id}/runs?token=${apify_token}`;
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput),
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error("Apify start error:", startRes.status, errText);
      return new Response(JSON.stringify({ error: `Apify start error [${startRes.status}]: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const runData = await startRes.json();
    const runId = runData?.data?.id;
    if (!runId) {
      return new Response(JSON.stringify({ error: "Failed to get run ID from Apify" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Apify run started:", runId);

    // Step 2: Poll for completion (max ~4 minutes)
    let status = runData?.data?.status;
    const maxAttempts = 48; // 48 * 5s = 240s
    for (let i = 0; i < maxAttempts && (status === "RUNNING" || status === "READY"); i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${apify_token}`
      );
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        status = pollData?.data?.status;
        console.log(`Poll ${i + 1}: status=${status}`);
      }
    }

    if (status !== "SUCCEEDED") {
      console.error("Apify run did not succeed. Final status:", status);
      return new Response(
        JSON.stringify({ error: `Apify run finished with status: ${status}. Check actor logs in Apify console for run ${runId}.` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Fetch dataset items
    const datasetId = runData?.data?.defaultDatasetId;
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apify_token}`
    );
    if (!itemsRes.ok) {
      const errText = await itemsRes.text();
      return new Response(JSON.stringify({ error: `Failed to fetch dataset: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items: any[] = await itemsRes.json();
    console.log("Fetched items count:", items.length);

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
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
