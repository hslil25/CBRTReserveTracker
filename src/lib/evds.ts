import { cache } from "react";
import { ReserveDataPoint } from "./types";

const EVDS_BASE = "https://evds3.tcmb.gov.tr/igmevdsms-dis";

function getApiKey(): string {
  const key = process.env.EVDS_API_KEY;
  if (!key) {
    throw new Error(
      "EVDS_API_KEY is not set. Add it to .env.local — get one from https://evds2.tcmb.gov.tr/"
    );
  }
  return key;
}

// TP.AB.N05      — Net international reserves (incl. swaps), weekly, thousand TRY
// TP.AB.TOPLAM   — Gross reserves, weekly, USD million
// TP.AB.A02      — Total FX assets, daily, thousand TRY
// TP.AB.A10      — Total FX liabilities, daily, thousand TRY
// TP.DK.USD.A.YTL / TP.DK.USD.S.YTL — daily USD/TRY ask / bid
// TP.DOVVARNC.K23 + K14 — monthly swap balance, USD million (negative = liability)
const SERIES_NET_RESERVE = "TP.AB.N05";
const SERIES_GROSS_RESERVE = "TP.AB.TOPLAM";
const SERIES_DAILY_A02 = "TP.AB.A02";
const SERIES_DAILY_A10 = "TP.AB.A10";
const SERIES_USD_ASK = "TP.DK.USD.A.YTL";
const SERIES_USD_BID = "TP.DK.USD.S.YTL";
const SERIES_SWAP_K23 = "TP.DOVVARNC.K23";
const SERIES_SWAP_K14 = "TP.DOVVARNC.K14";
const SERIES_ST_DEBT = "TP.KVDB19";

const START_DATE = "01-01-2015";

interface EvdsItem {
  Tarih: string; // "DD-MM-YYYY" for daily/weekly, "YYYY-M" for monthly
  [seriesKey: string]: string | null | { $numberLong: string };
}

interface EvdsResponse {
  totalCount: number;
  items: EvdsItem[];
}

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function ddmmyyyyToIso(s: string): string {
  const [dd, mm, yyyy] = s.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchOneChunk(
  series: string[],
  startDate: string,
  endDate: string
): Promise<EvdsItem[]> {
  const url = `${EVDS_BASE}/series=${series.join("-")}&startDate=${startDate}&endDate=${endDate}&type=json`;
  const res = await fetch(url, {
    headers: { key: getApiKey() },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`EVDS request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as EvdsResponse;
  return data.items ?? [];
}

// EVDS caps each response at 1000 rows and returns the most recent. For long
// daily ranges we have to paginate by year. Chunk size 3y keeps daily series
// (~250/yr) safely under the cap with headroom for multi-series queries.
async function fetchSeries(
  series: string[],
  startDate: string,
  endDate: string
): Promise<EvdsItem[]> {
  const [, , startYear] = startDate.split("-").map(Number);
  const [, , endYear] = endDate.split("-").map(Number);
  const CHUNK_YEARS = 3;

  const chunks: Array<[string, string]> = [];
  for (let y = startYear; y <= endYear; y += CHUNK_YEARS) {
    const chunkStart = y === startYear ? startDate : `01-01-${y}`;
    const chunkEndYear = Math.min(y + CHUNK_YEARS - 1, endYear);
    const chunkEnd = chunkEndYear === endYear ? endDate : `31-12-${chunkEndYear}`;
    chunks.push([chunkStart, chunkEnd]);
  }

  const results = await Promise.all(
    chunks.map(([s, e]) => fetchOneChunk(series, s, e))
  );

  // Merge and dedupe on Tarih (chunk boundaries shouldn't overlap, but be safe).
  const seen = new Set<string>();
  const merged: EvdsItem[] = [];
  for (const part of results) {
    for (const it of part) {
      if (seen.has(it.Tarih)) continue;
      seen.add(it.Tarih);
      merged.push(it);
    }
  }
  return merged;
}

function parseNum(v: EvdsItem[string]): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Build a date -> USD/TRY mid map, carrying forward the last known rate for null days (weekends/holidays).
function buildUsdTryMap(items: EvdsItem[]): Map<string, number> {
  const map = new Map<string, number>();
  let lastRate: number | null = null;
  for (const it of items) {
    const ask = parseNum(it[SERIES_USD_ASK.replace(/\./g, "_")]);
    const bid = parseNum(it[SERIES_USD_BID.replace(/\./g, "_")]);
    if (ask !== null && bid !== null) {
      lastRate = (ask + bid) / 2;
    }
    if (lastRate !== null) {
      map.set(ddmmyyyyToIso(it.Tarih), lastRate);
    }
  }
  return map;
}

function nearestRate(map: Map<string, number>, isoDate: string): number | null {
  if (map.has(isoDate)) return map.get(isoDate)!;
  const d = new Date(isoDate);
  for (let i = 1; i <= 10; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().slice(0, 10);
    if (map.has(key)) return map.get(key)!;
  }
  return null;
}

export interface ReserveSeries {
  daily: ReserveDataPoint[];
  weekly: ReserveDataPoint[];
  monthly: ReserveDataPoint[];
}

export const getReserveSeries = cache(async (): Promise<ReserveSeries> => {
  const endDate = todayDDMMYYYY();

  const [netItems, grossItems, fxItems, swapItems, dailyItems, debtItems] = await Promise.all([
    fetchSeries([SERIES_NET_RESERVE], START_DATE, endDate),
    fetchSeries([SERIES_GROSS_RESERVE], START_DATE, endDate),
    fetchSeries([SERIES_USD_ASK, SERIES_USD_BID], START_DATE, endDate),
    fetchSeries([SERIES_SWAP_K23, SERIES_SWAP_K14], START_DATE, endDate),
    fetchSeries([SERIES_DAILY_A02, SERIES_DAILY_A10], START_DATE, endDate),
    fetchSeries([SERIES_ST_DEBT], START_DATE, endDate),
  ]);

  const fxMap = buildUsdTryMap(fxItems);
  const netKey = SERIES_NET_RESERVE.replace(/\./g, "_");
  const grossKey = SERIES_GROSS_RESERVE.replace(/\./g, "_");
  const swapK23Key = SERIES_SWAP_K23.replace(/\./g, "_");
  const swapK14Key = SERIES_SWAP_K14.replace(/\./g, "_");
  const a02Key = SERIES_DAILY_A02.replace(/\./g, "_");
  const a10Key = SERIES_DAILY_A10.replace(/\./g, "_");
  const debtKey = SERIES_ST_DEBT.replace(/\./g, "_");

  // Gross (USD million) indexed by ISO date.
  const grossByDate = new Map<string, number>();
  for (const it of grossItems) {
    const v = parseNum(it[grossKey]);
    if (v === null) continue;
    grossByDate.set(ddmmyyyyToIso(it.Tarih), v / 1000); // million → billion
  }

  // Monthly swap (K23 + K14, USD million). Tarih is "YYYY-M"; normalize to "YYYY-MM".
  const swapByMonth = new Map<string, number>();
  for (const it of swapItems) {
    const k23 = parseNum(it[swapK23Key]);
    const k14 = parseNum(it[swapK14Key]);
    if (k23 === null && k14 === null) continue;
    const [yyyy, m] = it.Tarih.split("-");
    const monthKey = `${yyyy}-${m.padStart(2, "0")}`;
    const sumMillions = (k23 ?? 0) + (k14 ?? 0);
    swapByMonth.set(monthKey, sumMillions / 1000); // million → billion
  }
  const sortedSwapMonths = Array.from(swapByMonth.keys()).sort();
  const lastSwapMonth = sortedSwapMonths[sortedSwapMonths.length - 1];

  function swapForMonth(monthKey: string): number {
    if (swapByMonth.has(monthKey)) return swapByMonth.get(monthKey)!;
    for (let i = sortedSwapMonths.length - 1; i >= 0; i--) {
      if (sortedSwapMonths[i] < monthKey) return swapByMonth.get(sortedSwapMonths[i])!;
    }
    return swapByMonth.get(lastSwapMonth) ?? 0;
  }

  // Monthly short-term external debt (TP.KVDB19, USD million → billion).
  const debtByMonth = new Map<string, number>();
  for (const it of debtItems) {
    const v = parseNum(it[debtKey]);
    if (v === null) continue;
    const [yyyy, m] = it.Tarih.split("-");
    debtByMonth.set(`${yyyy}-${m.padStart(2, "0")}`, v / 1000);
  }
  const sortedDebtMonths = Array.from(debtByMonth.keys()).sort();

  function debtForMonth(monthKey: string): number | undefined {
    if (debtByMonth.has(monthKey)) return debtByMonth.get(monthKey);
    for (let i = sortedDebtMonths.length - 1; i >= 0; i--) {
      if (sortedDebtMonths[i] < monthKey) return debtByMonth.get(sortedDebtMonths[i]);
    }
    return undefined;
  }

  // Weekly N05-based series. Stored value `net_incl_swap` is the raw TP.AB.N05 in USD billions.
  const weekly: ReserveDataPoint[] = [];
  for (const it of netItems) {
    const thousandTry = parseNum(it[netKey]);
    if (thousandTry === null) continue;
    const iso = ddmmyyyyToIso(it.Tarih);
    const rate = nearestRate(fxMap, iso);
    if (rate === null) continue;
    const netIncl = thousandTry / rate / 1e6;
    const gross = grossByDate.get(iso);
    if (gross === undefined) continue;
    const swap = swapForMonth(iso.slice(0, 7));
    const netExcl = netIncl + swap;
    const debt = debtForMonth(iso.slice(0, 7));
    weekly.push({
      date: iso,
      net_excl_swap: parseFloat(netExcl.toFixed(2)),
      net_incl_swap: parseFloat(netIncl.toFixed(2)),
      gross: parseFloat(gross.toFixed(2)),
      st_debt_1y: debt !== undefined ? parseFloat(debt.toFixed(2)) : undefined,
    });
  }
  weekly.sort((a, b) => a.date.localeCompare(b.date));

  // Monthly: last weekly observation per calendar month.
  const byMonth = new Map<string, ReserveDataPoint>();
  for (const pt of weekly) {
    const month = pt.date.slice(0, 7);
    byMonth.set(month, { ...pt, date: month });
  }
  const monthly = Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));

  // -----------------------------
  // Daily estimation
  // -----------------------------
  // Daily proxy P(d) = (A02 - A10) / mid_USDTRY, in USD billions.
  const dailyProxy = new Map<string, number>();
  for (const it of dailyItems) {
    const a02 = parseNum(it[a02Key]);
    const a10 = parseNum(it[a10Key]);
    if (a02 === null || a10 === null) continue;
    const iso = ddmmyyyyToIso(it.Tarih);
    const rate = nearestRate(fxMap, iso);
    if (rate === null) continue;
    dailyProxy.set(iso, (a02 - a10) / rate / 1e6);
  }

  // Δ at each N05 publish day: N05_USD - P (raw, pre-swap).
  const publishDeltas: { date: string; delta: number }[] = [];
  for (const pt of weekly) {
    const p = dailyProxy.get(pt.date);
    if (p === undefined) continue;
    publishDeltas.push({ date: pt.date, delta: pt.net_incl_swap - p });
  }
  publishDeltas.sort((a, b) => a.date.localeCompare(b.date));

  function interpDelta(iso: string): number | null {
    if (!publishDeltas.length) return null;
    if (iso <= publishDeltas[0].date) return publishDeltas[0].delta;
    const last = publishDeltas[publishDeltas.length - 1];
    if (iso >= last.date) return last.delta; // constant going forward past last publish
    // Find surrounding publish days via binary search.
    let lo = 0;
    let hi = publishDeltas.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (publishDeltas[mid].date <= iso) lo = mid;
      else hi = mid;
    }
    const t = publishDeltas[lo];
    const tNext = publishDeltas[hi];
    const tMs = new Date(t.date).getTime();
    const tNextMs = new Date(tNext.date).getTime();
    const dMs = new Date(iso).getTime();
    const frac = (dMs - tMs) / (tNextMs - tMs); // n/7 when publish gap is exactly 7 days
    return t.delta + (tNext.delta - t.delta) * frac;
  }

  // Carry-forward gross from the most recent weekly publish.
  let grossCursor = 0;
  function grossForDate(iso: string): number {
    while (grossCursor + 1 < weekly.length && weekly[grossCursor + 1].date <= iso) {
      grossCursor++;
    }
    return weekly[grossCursor].gross;
  }

  const dailyDates = Array.from(dailyProxy.keys()).sort();
  const daily: ReserveDataPoint[] = [];
  for (const iso of dailyDates) {
    const delta = interpDelta(iso);
    if (delta === null) continue;
    const p = dailyProxy.get(iso)!;
    const netIncl = p + delta;
    const swap = swapForMonth(iso.slice(0, 7));
    const netExcl = netIncl + swap;
    const gross = grossForDate(iso);
    daily.push({
      date: iso,
      net_excl_swap: parseFloat(netExcl.toFixed(2)),
      net_incl_swap: parseFloat(netIncl.toFixed(2)),
      gross: parseFloat(gross.toFixed(2)),
    });
  }

  return { daily, weekly, monthly };
});
