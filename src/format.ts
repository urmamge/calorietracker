import dayjs from "dayjs";
import { notifications } from "@mantine/notifications";

export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A food with nutrients per 100 g. `id` is set for saved custom foods. */
export interface Food extends Nutrients {
  id?: number;
  name: string;
  brand: string;
  source: "Open Food Facts" | "Custom";
}

export const ZERO: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function nutrientsFromPer100(food: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  return {
    calories: (food.calories || 0) * factor,
    protein: (food.protein || 0) * factor,
    carbs: (food.carbs || 0) * factor,
    fat: (food.fat || 0) * factor,
  };
}

export const MACROS = [
  { key: "protein", label: "Protein", color: "blue", kcalPerGram: 4 },
  { key: "carbs", label: "Carbs", color: "orange", kcalPerGram: 4 },
  { key: "fat", label: "Fat", color: "pink", kcalPerGram: 9 },
] as const satisfies readonly { key: keyof Nutrients; label: string; color: string; kcalPerGram: number }[];

export const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-GB");
export const fmtG = (n: number) => n.toFixed(1);

export const todayIso = () => dayjs().format("YYYY-MM-DD");
export const shiftDate = (iso: string, days: number) => dayjs(iso).add(days, "day").format("YYYY-MM-DD");

export function dayLabel(iso: string): string {
  const diff = dayjs().startOf("day").diff(dayjs(iso), "day");
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  return dayjs(iso).format("dddd D MMMM");
}

export const foodKey = (f: Pick<Food, "name" | "brand">) => `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String(e.message);
  return String(e);
}

export function notifyError(e: unknown, title = "Something went wrong") {
  notifications.show({ color: "red", title, message: errorMessage(e) });
}
