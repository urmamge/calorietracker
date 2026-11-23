import type { Food } from "./format.ts";
import { SUPABASE_URL } from "./supabase.ts";

// Browser port of the desktop app's server/openFoodFacts.ts. The newer search service (search.openfoodfacts.org) is
// tried first because it is faster and far less overloaded. It sends no CORS headers, so the browser reaches it through
// the off-search Supabase Edge Function (supabase/functions/off-search). If that fails, the classic API, which does
// allow cross-origin requests, is used with retries.
const API_BASE = "https://world.openfoodfacts.org/cgi/search.pl";
const SEARCH_API = `${SUPABASE_URL}/functions/v1/off-search`;
const PAGE_SIZE = 100;

export interface SearchResult {
  foods: Food[];
  page: number;
  hasMore: boolean;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  return res.json();
}

// The classic search endpoint is often overloaded and answers a large share of requests with a fast 503. That error page
// has no CORS headers, so browsers surface it as a network failure ("Failed to fetch") rather than a status code. Each
// attempt is independent, so retrying a few times with a short backoff almost always gets through.
async function getJsonWithRetry(url: string, attempts = 6): Promise<any> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, Math.min(300 * 2 ** (i - 1), 2_000)));
    try {
      return await getJson(url);
    } catch (e) {
      lastError = e;
      const status = Number(/returned (\d+)/.exec(e instanceof Error ? e.message : "")?.[1]);
      const retryable = e instanceof TypeError || status === 429 || status >= 500;
      if (!retryable) break;
    }
  }
  if (lastError instanceof TypeError) {
    throw new Error("Open Food Facts is busy or unreachable right now.");
  }
  throw lastError;
}

function query(params: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

function toNumber(...values: unknown[]): number {
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function toFood(p: any): Food | null {
  const name = String(p.product_name ?? "").trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  let kcal: number | null = n["energy-kcal_100g"] ?? null;
  if (kcal == null && n.energy_100g != null) kcal = Number(n.energy_100g) / 4.184;
  if (kcal == null || !Number.isFinite(Number(kcal))) return null;
  return {
    name,
    brand: Array.isArray(p.brands) ? p.brands.join(", ") : String(p.brands ?? ""),
    calories: Number(kcal),
    protein: toNumber(n.proteins_100g),
    carbs: toNumber(n.carbohydrates_100g),
    fat: toNumber(n.fat_100g),
    source: "Open Food Facts",
  };
}

async function classicSearch(q: string, brand: string, page: number): Promise<{ products: any[]; hasMore: boolean }> {
  const params: Record<string, string | number> = {
    action: "process",
    json: 1,
    page_size: PAGE_SIZE,
    page,
    fields: "product_name,brands,nutriments,code",
  };
  if (q) Object.assign(params, { search_terms: q, search_simple: 1 });
  if (brand) Object.assign(params, { tagtype_0: "brands", tag_contains_0: "contains", tag_0: brand });
  const payload = await getJsonWithRetry(`${API_BASE}?${query(params)}`);
  const products: any[] = payload.products ?? [];
  const pageCount = Number(payload.page_count);
  return { products, hasMore: payload.page_count != null && Number.isFinite(pageCount) ? page < pageCount : products.length === PAGE_SIZE };
}

async function newSearch(q: string, brand: string, page: number): Promise<{ products: any[]; hasMore: boolean }> {
  const terms = [q, brand && `brands:"${brand.replace(/["\\]/g, "")}"`].filter(Boolean).join(" ");
  const payload = await getJson(
    `${SEARCH_API}/search?${query({ q: terms, page, page_size: PAGE_SIZE, fields: "product_name,brands,nutriments,code" })}`,
  );
  return { products: payload.hits ?? [], hasMore: page < Number(payload.page_count ?? 0) };
}

export async function searchFoods(q: string, brand: string, page: number): Promise<SearchResult> {
  let result;
  try {
    result = await newSearch(q, brand, page);
  } catch {
    result = await classicSearch(q, brand, page);
  }
  const foods = result.products.map(toFood).filter((f): f is Food => f !== null);
  return { foods, page, hasMore: result.hasMore };
}

const suggestionCache = new Map<string, string[]>();

export async function brandSuggestions(text: string): Promise<string[]> {
  const key = text.toLowerCase();
  const cached = suggestionCache.get(key);
  if (cached) return cached;
  const payload = await getJson(`${SEARCH_API}/autocomplete?${query({ q: text, taxonomy_names: "brand", size: 20 })}`);
  const brands = new Set<string>();
  for (const o of payload.options ?? []) if (o.text) brands.add(String(o.text).trim());
  const result = [...brands].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  suggestionCache.set(key, result);
  return result;
}
