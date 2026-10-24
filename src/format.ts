import dayjs from "dayjs";

export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const MACROS = [
  { key: "protein", label: "Protein", color: "blue" },
  { key: "carbs", label: "Carbs", color: "orange" },
  { key: "fat", label: "Fat", color: "pink" },
] as const satisfies readonly { key: keyof Nutrients; label: string; color: string }[];

export const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-GB");
export const fmtG = (n: number) => n.toFixed(1);

export const todayIso = () => dayjs().format("YYYY-MM-DD");
export const shiftDate = (iso: string, days: number) => dayjs(iso).add(days, "day").format("YYYY-MM-DD");
