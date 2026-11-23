import type { Food } from "./format.ts";
import { SUPABASE_URL } from "./supabase.ts";

// Browser port of the desktop app's server/openFoodFacts.ts; keep the two in step. The newer search service
// (search.openfoodfacts.org) sends no CORS headers, so the browser reaches it through the off-search Supabase Edge
// Function (supabase/functions/off-search). The classic API allows cross-origin requests directly. See searchFoods for
// which one is used when.
const API_BASE = "https://world.openfoodfacts.org/cgi/search.pl";
const SEARCH_API = `${SUPABASE_URL}/functions/v1/off-search`;
const PAGE_SIZE = 100;

export interface SearchResult {
  foods: Food[];
  page: number;
  hasMore: boolean;
}

// Brand searches use the classic API first (see searchFoods). If it has not answered within this long, the newer
// service is used instead.
const CLASSIC_BRAND_DEADLINE_MS = 8_000;

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  const timeout = AbortSignal.timeout(12_000);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  return res.json();
}

// The classic search endpoint is often overloaded and answers a large share of requests with a fast 503. That error page
// has no CORS headers, so browsers surface it as a network failure ("Failed to fetch") rather than a status code. Each
// attempt is independent, so retrying a few times with a short backoff almost always gets through.
async function getJsonWithRetry(url: string, signal?: AbortSignal, attempts = 6): Promise<any> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, Math.min(300 * 2 ** (i - 1), 2_000)));
    signal?.throwIfAborted();
    try {
      return await getJson(url, signal);
    } catch (e) {
      lastError = e;
      if (signal?.aborted) break;
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

type Page = { products: any[]; hasMore: boolean };

async function classicSearch(q: string, brand: string, page: number, signal?: AbortSignal): Promise<Page> {
  const params: Record<string, string | number> = {
    action: "process",
    json: 1,
    page_size: PAGE_SIZE,
    page,
    fields: "product_name,brands,nutriments,code",
  };
  if (q) Object.assign(params, { search_terms: q, search_simple: 1 });
  if (brand) Object.assign(params, { tagtype_0: "brands", tag_contains_0: "contains", tag_0: brand });
  const payload = await getJsonWithRetry(`${API_BASE}?${query(params)}`, signal);
  const products: any[] = payload.products ?? [];
  // The classic API's page_count is the number of products on this page, not the number of pages; use the total count.
  const count = Number(payload.count);
  return { products, hasMore: payload.count != null && Number.isFinite(count) ? page * PAGE_SIZE < count : products.length === PAGE_SIZE };
}

/** Lowercase, accents and punctuation removed, so "Sainsbury's", "Sainsburys" and "sainsbury" compare equal. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function brandKey(brand: string): string {
  return normalize(brand).replace(/ /g, "").replace(/s$/, "");
}

// The newer service files the same brand under several spellings ("Sainsbury's", "Sainsburys", "Sainsbury"), and its
// brand filter only matches one exactly. Look up the spellings it knows and search for all of them.
async function brandVariants(brand: string): Promise<string[]> {
  const key = brandKey(brand);
  const variants = new Set([brand]);
  try {
    for (const b of await brandSuggestions(brand)) if (brandKey(b) === key) variants.add(b);
  } catch {
    // Suggestions are a nice-to-have; search with the spelling as typed.
  }
  return [...variants];
}

// The newer service ranks by relevance but returns anything matching any one word, so "buttermilk chicken" also lists
// every chicken product. Keep only products that mention every word (in the name, brand, generic name or categories).
// Trailing "s" is ignored so "fillet" matches "fillets" and the other way round.
function matchesAllWords(product: any, words: string[]): boolean {
  if (!words.length) return true;
  const brands = Array.isArray(product.brands) ? product.brands.join(" ") : String(product.brands ?? "");
  const categories = Array.isArray(product.categories_tags) ? product.categories_tags.join(" ") : "";
  const haystack = normalize(`${product.product_name ?? ""} ${product.generic_name ?? ""} ${brands} ${categories}`);
  return words.every((w) => haystack.includes(w));
}

async function newSearch(q: string, brand: string, page: number): Promise<Page> {
  let brandClause = "";
  if (brand) {
    const variants = (await brandVariants(brand)).map((b) => `"${b.replace(/["\\]/g, "")}"`);
    brandClause = `brands:(${variants.join(" OR ")})`;
  }
  const terms = [q, brandClause].filter(Boolean).join(" ");
  const payload = await getJson(
    `${SEARCH_API}/search?${query({ q: terms, page, page_size: PAGE_SIZE, fields: "product_name,generic_name,categories_tags,brands,nutriments,code" })}`,
  );
  const hits: any[] = payload.hits ?? [];
  const words = normalize(q).split(" ").filter((w) => w.length > 1).map((w) => w.replace(/(?<=..)s$/, ""));
  const products = hits.filter((p) => matchesAllWords(p, words));
  // Results are ranked, so once the last product on a page fails the word check, later pages are only partial matches.
  const lastMatches = hits.length > 0 && matchesAllWords(hits[hits.length - 1], words);
  return { products, hasMore: lastMatches && page < Number(payload.page_count ?? 0) };
}

type Source = "classic" | "new";
// Which service answered page 1 of a search, so "Load more" keeps paging the same one instead of mixing result lists.
const searchSource = new Map<string, Source>();

async function runOn(source: Source, q: string, brand: string, page: number, signal?: AbortSignal): Promise<Page> {
  return source === "classic" ? classicSearch(q, brand, page, signal) : newSearch(q, brand, page);
}

export async function searchFoods(q: string, brand: string, page: number): Promise<SearchResult> {
  const key = `${q}\u0000${brand}`;
  // The newer service is faster and less overloaded, but its copy of the database is incomplete, and that shows most in
  // brand searches (e.g. Sainsbury's buttermilk chicken is only on the classic API). So brand searches go to the classic
  // API first, switching to the newer service if it fails, finds nothing, or has not answered within a few seconds.
  // Other searches use the newer service first and fall back to the classic API.
  const remembered = page > 1 ? searchSource.get(key) : undefined;
  const first: Source = remembered ?? (brand ? "classic" : "new");
  const order: Source[] = first === "classic" ? ["classic", "new"] : ["new", "classic"];

  let result: Page | undefined;
  let used: Source | undefined;
  let firstError: unknown;
  for (const source of order) {
    const deadline = source === "classic" && brand && !remembered ? AbortSignal.timeout(CLASSIC_BRAND_DEADLINE_MS) : undefined;
    try {
      const r = await runOn(source, q, brand, page, deadline);
      result = r;
      used = source;
      // An empty first page from one service is worth checking against the other.
      if (r.products.length || page > 1) break;
    } catch (e) {
      firstError ??= e;
    }
  }
  if (!result || !used) throw firstError instanceof Error && firstError.name !== "TimeoutError" ? firstError : new Error("Open Food Facts is busy or unreachable right now.");
  if (page === 1) searchSource.set(key, used);
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
