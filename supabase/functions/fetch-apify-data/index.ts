import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  diagnostics?: {
    actorId?: string;
    runId?: string;
    status?: string;
    requestedUrl?: string;
    stage?: string;
  };
}

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function respond<T>(payload: ApiResponse<T>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ ok: false, error: "Missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return respond({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json();
    const { property_id, apify_token, actor_id, type, year, month, actor_input } = body;

    if (!property_id || !apify_token || !actor_id || !type || !year || !month) {
      return respond({ ok: false, error: "Missing required fields" }, 400);
    }

    // Normalize actor input: ensure city is string, add dealType based on type
    const rawInput = actor_input && typeof actor_input === "object" ? { ...actor_input } : {};
    if (rawInput.city !== undefined) {
      rawInput.city = String(rawInput.city);
    }
    if (type === "rent") {
      rawInput.dealType = "rent";
    } else if (type === "sale") {
      rawInput.dealType = "buy";
    }
    const actorInput = rawInput;

    const startUrl = `https://api.apify.com/v2/acts/${actor_id}/runs?token=${apify_token}`;
    console.log("Apify actor input:", JSON.stringify(actorInput));

    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput),
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error("Apify start error:", startRes.status, errText);
      return respond({
        ok: false,
        error: `Apify start error [${startRes.status}]`,
        diagnostics: { actorId: actor_id, requestedUrl: startUrl, stage: "start_run" },
        data: { message: errText },
      });
    }

    const runData = await startRes.json();
    const runId = runData?.data?.id;
    let datasetId = runData?.data?.defaultDatasetId;

    if (!runId) {
      return respond({
        ok: false,
        error: "Failed to get run ID from Apify",
        diagnostics: { actorId: actor_id, stage: "start_run" },
      });
    }

    let status = runData?.data?.status;
    const maxAttempts = 48;

    for (let i = 0; i < maxAttempts && (status === "RUNNING" || status === "READY"); i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apify_token}`);
      if (!pollRes.ok) {
        const errText = await pollRes.text();
        return respond({
          ok: false,
          error: "Failed while polling Apify run",
          diagnostics: { actorId: actor_id, runId, status, stage: "poll_run" },
          data: { message: errText },
        });
      }
      const pollData = await pollRes.json();
      status = pollData?.data?.status;
      datasetId = pollData?.data?.defaultDatasetId ?? datasetId;
      console.log(`Poll ${i + 1}: status=${status}`);
    }

    if (status !== "SUCCEEDED") {
      // Fetch the statusMessage from the run for better diagnostics
      let statusMessage = "";
      try {
        const runInfoRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apify_token}`);
        if (runInfoRes.ok) {
          const runInfo = await runInfoRes.json();
          statusMessage = runInfo?.data?.statusMessage || "";
        }
      } catch (_) { /* ignore */ }

      return respond({
        ok: false,
        error: statusMessage || "ריצת Apify נכשלה",
        diagnostics: { actorId: actor_id, runId, status, stage: "run_failed" },
      });
    }

    if (!datasetId) {
      return respond({
        ok: false,
        error: "Apify finished but no dataset returned",
        diagnostics: { actorId: actor_id, runId, status, stage: "missing_dataset" },
      });
    }

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apify_token}`);
    if (!itemsRes.ok) {
      const errText = await itemsRes.text();
      return respond({
        ok: false,
        error: "Failed to fetch dataset items",
        diagnostics: { actorId: actor_id, runId, stage: "fetch_dataset" },
        data: { message: errText },
      });
    }

    let items: any[] = await itemsRes.json();
    if (items.length > 0) {
      console.log("Sample Apify item keys:", JSON.stringify(Object.keys(items[0])));
      console.log("Sample Apify item:", JSON.stringify(items[0]));
    }

    // Filter by rooms if specified in actor_input
    const requestedRooms = actorInput.rooms;
    if (requestedRooms !== undefined && requestedRooms !== null && requestedRooms !== "" && Number(requestedRooms) > 0) {
      const roomsNum = Number(requestedRooms);
      if (!isNaN(roomsNum)) {
        items = items.filter((item: any) => Number(item.rooms) === roomsNum);
        console.log(`Filtered to ${items.length} items with ${roomsNum} rooms`);
      }
    }

    const prices = items.map((i: any) => Number(i.price)).filter((p: number) => !Number.isNaN(p) && p > 0);
    const sampleSize = prices.length;
    const avgPrice = sampleSize > 0 ? prices.reduce((a, b) => a + b, 0) / sampleSize : 0;
    const stdDev = sampleSize > 1
      ? Math.sqrt(prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / (sampleSize - 1))
      : 0;

    const rawData = items.map((item: any) => ({
      neighbourhood: item.neighbourhood || item.neighborhood || "",
      address: item.address || "",
      areaSqm: item.square_meters || item.areaSqm || item.squareMeters || item.area_sqm || item.size || 0,
      price: item.price || 0,
      rooms: item.rooms || item.room_number || 0,
    }));

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
      return respond({ ok: false, error: snapError.message, diagnostics: { stage: "save_snapshot" } }, 500);
    }

    return respond({ ok: true, data: { snapshot, itemCount: items.length } });
  } catch (err) {
    console.error("Edge function error:", err);
    return respond({ ok: false, error: String(err), diagnostics: { stage: "unexpected" } }, 500);
  }
});
