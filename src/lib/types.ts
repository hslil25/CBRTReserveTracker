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
  net_excl_swap: "Swap hariç net rezerv",
  net_incl_swap: "Net döviz pozisyonu",
  gross: "Brüt rezerv",
};

export const METRIC_COLORS: Record<ReserveMetric, string> = {
  net_excl_swap: "#f59e0b",
  net_incl_swap: "#38bdf8",
  gross: "#a78bfa",
};

export const METRICS: ReserveMetric[] = ["net_excl_swap", "net_incl_swap", "gross"];

export interface GoldWeeklyPoint {
  date: string;
  price: number;        // USD per troy ounce
  oz: number;           // CBRT gold holdings, million oz (implied from value / price)
  liabOz: number;       // gold owed to banks and others, million oz
  gold: number;         // gold reserves, USD billion
  fx: number;           // FX reserves excl. gold, USD billion
  gross: number;
  netExclSwap: number;
  netGoldValue: number; // (oz − liabOz) × price, USD billion
  netLiquid: number;    // net reserves ex-swaps minus net gold
  swapNet: number;
  // Week-on-week contributions, USD billion.
  c: {
    goldPriceGross: number;
    goldQty: number;
    fx: number;
    goldPriceNet: number;
    netFlows: number;
  };
}

export interface SwapPoint {
  date: string;
  sell: number; // CBRT sold FX spot / buys back forward: future FX claim
  buy: number;  // CBRT borrowed FX spot: future FX liability
  cb: number;   // swaps with foreign central banks (monthly, carried forward)
  net: number;  // sell − buy − cb
}
