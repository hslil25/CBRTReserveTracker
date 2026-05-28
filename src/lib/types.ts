export type ReserveMetric = "net_excl_swap" | "net_incl_swap" | "gross";
export type PeriodView = "daily" | "weekly" | "monthly";

export interface ReserveDataPoint {
  date: string; // "YYYY-MM-DD" daily/weekly, "YYYY-MM" monthly
  net_excl_swap: number; // USD billion
  net_incl_swap: number; // USD billion
  gross: number;         // USD billion
  st_debt_1y?: number;   // Short-term external debt (1y), USD billion — carried forward from monthly
}

export interface ChartPoint {
  date: string;
  value: number;
}

export interface WeeklyChange {
  date: string;
  metric: ReserveMetric;
  change: number;
  from: number;
  to: number;
}

export const METRIC_LABELS: Record<ReserveMetric, string> = {
  net_excl_swap: "Net (Swap Excl.)",
  net_incl_swap: "Net (Swap Incl.)",
  gross: "Gross",
};

export const METRIC_COLORS: Record<ReserveMetric, string> = {
  net_excl_swap: "#f59e0b",
  net_incl_swap: "#38bdf8",
  gross: "#a78bfa",
};

export const METRICS: ReserveMetric[] = ["net_excl_swap", "net_incl_swap", "gross"];
