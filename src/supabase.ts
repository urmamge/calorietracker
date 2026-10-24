import { createClient } from "@supabase/supabase-js";

// The publishable (anon) key is meant for browsers; row-level security limits each account to its own entries.
const SUPABASE_URL = "https://qcowxfnoboljphfewmxu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KV89o3oHC2HSNirNqhLqTg_lFeq2_18";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface Entry {
  date: string;
  food_name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const COLUMNS = "date,food_name,grams,calories,protein,carbs,fat";

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
