// Relay for the Open Food Facts search service (search.openfoodfacts.org). That service sends no CORS headers, so the
// website cannot call it directly from the browser; this function forwards the request and adds them. Only the two
// read-only endpoints the website uses are allowed, so it cannot be used as a general-purpose proxy.
const UPSTREAM = "https://search.openfoodfacts.org";
const ALLOWED = new Set(["search", "autocomplete"]);
const USER_AGENT = "DailyNutritionTracker/2.0 (website relay)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const endpoint = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!ALLOWED.has(endpoint)) return json({ error: "Unknown endpoint" }, 404);

  try {
    const res = await fetch(`${UPSTREAM}/${endpoint}${url.search}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    return new Response(res.body, {
      status: res.status,
      headers: { ...CORS, "Content-Type": res.headers.get("Content-Type") ?? "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return json({ error: `Open Food Facts search is unreachable: ${e instanceof Error ? e.message : e}` }, 502);
  }
});
