import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// Scheduled monthly job: for every property with apify credentials,
// fetch fresh rent + sale data from Apify and create a snapshot
// dated to the current (year, month). Triggered by pg_cron on the 1st
// of every month. Can also be invoked manually for backfills.

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

interface Property {
  id: string;
  user_id: string;
  apify_token: string;
  apify_actor_sale_id: string;
  apify_actor_rent_id: string;
  apify_rent_input: Record<string, unknown> | null;
  apify_sale_input: Record<string, unknown> | null;
}

async function runApify(token: string, actorId: string, input: Record<string, unknown>) {
  const startUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!startRes.ok) throw new Error(`Apify start [${startRes.status}]: ${await startRes.text()}`);
  const runData = await startRes.json();
  const runId = runData?.data?.id;
  let datasetId = runData?.data?.defaultDatasetId;
  let status = runData?.data?.status;
  if (!runId) throw new Error("No run id");
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts && (status === "RUNNING" || status === "READY"); i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    if (!pollRes.ok) throw new Error(`poll [${pollRes.status}]`);
    const pollData = await pollRes.json();
    status = pollData?.data?.status;
    datasetId = pollData?.data?.defaultDatasetId ?? datasetId;
  }
  if (status !== "SUCCEEDED") throw new Error(`Run status: ${status}`);
  const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
  if (!itemsRes.ok) throw new Error(`items [${itemsRes.status}]`);
  return (await itemsRes.json()) as any[];
}

async function snapshotForProperty(
  supabase: any,
  property: Property,
  type: "sale" | "rent",
  year: number,
  month: number,
) {
  const actorId = type === "sale" ? property.apify_actor_sale_id : property.apify_actor_rent_id;
  const rawInput = (type === "sale" ? property.apify_sale_input : property.apify_rent_input) || {};
  if (!property.apify_token || !actorId) return { type, skipped: true, reason: "missing token/actor" };

  const input: Record<string, unknown> = { ...rawInput };
  if (input.city !== undefined) input.city = String(input.city);
  input.dealType = type === "sale" ? "buy" : "rent";

  let items = await runApify(property.apify_token, actorId, input);
  const requestedRooms = (input as any).rooms;
  if (requestedRooms !== undefined && requestedRooms !== null && requestedRooms !== "" && Number(requestedRooms) > 0) {
    const r = Number(requestedRooms);
    if (!isNaN(r)) items = items.filter((it: any) => Number(it.rooms) === r);
  }

  const prices = items.map((i: any) => Number(i.price)).filter((p: number) => !isNaN(p) && p > 0);
  const sampleSize = prices.length;
  const avg = sampleSize > 0 ? prices.reduce((a, b) => a + b, 0) / sampleSize : 0;
  const stdDev = sampleSize > 1
    ? Math.sqrt(prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / (sampleSize - 1))
    : 0;
  const rawData = items.map((it: any) => ({
    neighbourhood: it.neighbourhood || it.neighborhood || "",
    address: it.address || "",
    areaSqm: it.square_meters || it.areaSqm || it.squareMeters || it.area_sqm || it.size || 0,
    price: it.price || 0,
    rooms: it.rooms || it.room_number || 0,
  }));

  const { error } = await supabase
    .from("property_snapshots")
    .upsert(
      {
        property_id: property.id,
        user_id: property.user_id,
        type, year, month,
        avg_price: Math.round(avg),
        sample_size: sampleSize,
        std_deviation: Math.round(stdDev),
        raw_data: rawData,
      },
      { onConflict: "property_id,type,year,month" },
    );
  if (error) throw new Error(error.message);
  return { type, sampleSize, avg: Math.round(avg) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* no body */ }

  const now = new Date();
  const year = Number(body?.year) || now.getFullYear();
  const month = Number(body?.month) || (now.getMonth() + 1);

  const { data: properties, error } = await supabase
    .from("properties")
    .select("id,user_id,apify_token,apify_actor_sale_id,apify_actor_rent_id,apify_rent_input,apify_sale_input");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: jsonHeaders });
  }

  const results: any[] = [];
  for (const p of (properties as Property[])) {
    for (const type of ["rent", "sale"] as const) {
      try {
        const r = await snapshotForProperty(supabase, p, type, year, month);
        results.push({ property_id: p.id, ...r });
      } catch (e: any) {
        console.error(`Snapshot failed for ${p.id} ${type}:`, e?.message);
        results.push({ property_id: p.id, type, error: String(e?.message || e) });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, year, month, results }), { headers: jsonHeaders });
});
