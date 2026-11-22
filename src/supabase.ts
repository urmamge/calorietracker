import { createClient } from "@supabase/supabase-js";
import { type Food, nutrientsFromPer100 } from "./format.ts";

// The publishable (anon) key is meant for browsers; row-level security limits each account to its own entries.
const SUPABASE_URL = "https://qcowxfnoboljphfewmxu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KV89o3oHC2HSNirNqhLqTg_lFeq2_18";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface Entry {
  sync_id: string;
  date: string;
  food_name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const COLUMNS = "sync_id,date,food_name,grams,calories,protein,carbs,fat";

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("You are signed out. Sign in again to continue.");
  return id;
}

/** Fetches entries in a date range (inclusive), newest first, paging past Supabase's 1000-row limit. */
export async function fetchEntries(start?: string, end?: string): Promise<Entry[]> {
  const all: Entry[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("nutrition_entries").select(COLUMNS);
    if (start) query = query.gte("date", start);
    if (end) query = query.lte("date", end);
    const { data, error } = await query.order("date", { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    all.push(...(data as Entry[]));
    if (data.length < pageSize) return all;
  }
}

export async function firstEntryDate(): Promise<string | null> {
  const { data, error } = await supabase.from("nutrition_entries").select("date").order("date", { ascending: true }).limit(1);
  if (error) throw error;
  return data[0]?.date ?? null;
}

/** Logs a portion of a food (nutrients per 100 g) on a date, in the same shape the desktop app syncs. */
export async function addEntry(food: Food, grams: number, date: string): Promise<void> {
  const vals = nutrientsFromPer100(food, grams);
  const { error } = await supabase.from("nutrition_entries").insert({
    user_id: await userId(),
    sync_id: crypto.randomUUID(),
    date,
    food_name: food.name,
    grams,
    ...vals,
  });
  if (error) throw error;
}

export async function removeEntry(syncId: string): Promise<void> {
  const { error } = await supabase.from("nutrition_entries").delete().eq("sync_id", syncId).eq("user_id", await userId());
  if (error) throw error;
}

// ---- Saved custom foods ("My foods") ------------------------------------------------------------
// Stored in the custom_foods table (see supabase/custom_foods.sql) so they follow you across devices.

/** Thrown when the custom_foods table has not been created in Supabase yet. */
export class MissingTableError extends Error {
  constructor() {
    super("Saved foods need the custom_foods table. Run supabase/custom_foods.sql in the Supabase SQL editor.");
  }
}

function checkTable(error: { code?: string } | null) {
  if (error && (error.code === "PGRST205" || error.code === "42P01")) throw new MissingTableError();
  if (error) throw error;
}

export async function listCustomFoods(): Promise<Food[]> {
  const { data, error } = await supabase
    .from("custom_foods")
    .select("id,name,brand,calories,protein,carbs,fat")
    .order("name", { ascending: true })
    .order("brand", { ascending: true });
  checkTable(error);
  return (data ?? []).map((r) => ({ ...(r as Omit<Food, "source">), source: "Custom" as const }));
}

/** Returns false when a food with the same name and brand is already saved. */
export async function saveCustomFood(food: Food): Promise<boolean> {
  const { error } = await supabase.from("custom_foods").insert({
    user_id: await userId(),
    name: food.name,
    brand: food.brand ?? "",
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
  });
  if (error?.code === "23505") return false;
  checkTable(error);
  return true;
}

export async function removeCustomFood(id: number): Promise<void> {
  const { error } = await supabase.from("custom_foods").delete().eq("id", id);
  checkTable(error);
}
