import { cache } from "react";
import { ReserveDataPoint, GoldWeeklyPoint, SwapPoint } from "./types";

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

// TP.AB.TOPLAM   — Gross reserves, weekly, USD million
// TP.AB.A02      — External assets (A.1 Dış Varlıklar), daily, thousand TRY
// TP.AB.A10      — Total FX liabilities (incl. bank and Treasury FX deposits), daily, thousand TRY
// TP.DK.USD.A.YTL / TP.DK.USD.S.YTL — daily USD/TRY ask / bid
// TP.DOVVARNC.K23 + K14 — monthly swap balance, USD million (negative = liability)
// TP.SWAPTEKTAR.*  — daily CBRT swap stocks with domestic counterparties, USD million
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

const SERIES_GOLD = "TP.AB.C1";
const SERIES_FX = "TP.AB.C2";
const SERIES_GOLD_PRICE = "TP.ALTINPIYASA.KAP03";
// Gold liabilities on the weekly CBRT statement, fine grams.
const SERIES_GOLD_LIAB = ["TP.BL0823", "TP.BL128", "TP.BL137", "TP.BL0891", "TP.BL142"];
const SERIES_SWAP_BUY = "TP.SWAPTEKTAR.TOTALSTOKALIMYONLU";
const SERIES_SWAP_SELL = "TP.SWAPTEKTAR.TOTALSTOKSATIMYONLU";
const GOLD_START_DATE = "01-07-2018";
const SWAP_DAILY_START_DATE = "01-01-2021";
const GRAMS_PER_OZ = 31.1034768;

const k = (code: string) => code.replace(/\./g, "_");

export interface ReserveSeries {
  daily: ReserveDataPoint[];
  weekly: ReserveDataPoint[];
  monthly: ReserveDataPoint[];
  gold: GoldWeeklyPoint[];
  swaps: SwapPoint[];
}

function monthKeyOf(tarih: string): string {
  const [yyyy, m] = tarih.split("-");
  return `${yyyy}-${m.padStart(2, "0")}`;
}

// Latest value at or before `key` in a sorted [key, value] list.
function lookupAtOrBefore<T>(sorted: [string, T][], key: string): T | undefined {
  let lo = 0;
  let hi = sorted.length - 1;
  let found: T | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid][0] <= key) {
      found = sorted[mid][1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export const getReserveSeries = cache(async (): Promise<ReserveSeries> => {
  const endDate = todayDDMMYYYY();

  const [
    weeklyResItems,
    fxItems,
    swapItems,
    dailyItems,
    debtItems,
    goldPriceItems,
    goldLiabItems,
    swapDailyItems,
  ] = await Promise.all([
    fetchSeries([SERIES_GROSS_RESERVE, SERIES_GOLD, SERIES_FX], START_DATE, endDate),
    fetchSeries([SERIES_USD_ASK, SERIES_USD_BID], START_DATE, endDate),
    fetchSeries([SERIES_SWAP_K23, SERIES_SWAP_K14], START_DATE, endDate),
    fetchSeries([SERIES_DAILY_A02, SERIES_DAILY_A10], START_DATE, endDate),
    fetchSeries([SERIES_ST_DEBT], START_DATE, endDate),
    fetchSeries([SERIES_GOLD_PRICE], GOLD_START_DATE, endDate),
    fetchSeries(SERIES_GOLD_LIAB, GOLD_START_DATE, endDate),
    fetchSeries([SERIES_SWAP_BUY, SERIES_SWAP_SELL], SWAP_DAILY_START_DATE, endDate),
  ]);

  const fxMap = buildUsdTryMap(fxItems);

  // Weekly reserves (USD million → billion).
  const weeklyRes: { date: string; gross: number; gold: number | null; fx: number | null }[] = [];
  for (const it of weeklyResItems) {
    const gross = parseNum(it[k(SERIES_GROSS_RESERVE)]);
    if (gross === null) continue;
    const gold = parseNum(it[k(SERIES_GOLD)]);
    const fx = parseNum(it[k(SERIES_FX)]);
    weeklyRes.push({
      date: ddmmyyyyToIso(it.Tarih),
      gross: gross / 1000,
      gold: gold === null ? null : gold / 1000,
      fx: fx === null ? null : fx / 1000,
    });
  }
  weeklyRes.sort((a, b) => a.date.localeCompare(b.date));

  // Monthly reserve-template swap legs (USD million → billion).
  const monthlySwap: [string, { k23: number; k14: number }][] = [];
  for (const it of swapItems) {
    const k23 = parseNum(it[k(SERIES_SWAP_K23)]);
    const k14 = parseNum(it[k(SERIES_SWAP_K14)]);
    if (k23 === null && k14 === null) continue;
    monthlySwap.push([monthKeyOf(it.Tarih), { k23: (k23 ?? 0) / 1000, k14: (k14 ?? 0) / 1000 }]);
  }
  monthlySwap.sort((a, b) => a[0].localeCompare(b[0]));

  // Daily CBRT swap stocks (USD million → billion), carried forward over gaps.
  const dailySwapStock: [string, { buy: number; sell: number }][] = [];
  for (const it of swapDailyItems) {
    const buy = parseNum(it[k(SERIES_SWAP_BUY)]);
    const sell = parseNum(it[k(SERIES_SWAP_SELL)]);
    if (buy === null || sell === null) continue;
    dailySwapStock.push([ddmmyyyyToIso(it.Tarih), { buy: buy / 1000, sell: sell / 1000 }]);
  }
  dailySwapStock.sort((a, b) => a[0].localeCompare(b[0]));

  // K14 = −(buy-side stock + swaps with foreign central banks). The central-bank
  // leg is only published monthly, so back it out at each month end and carry it.
  const cbSwapByMonth: [string, number][] = [];
  for (const [month, { k14 }] of monthlySwap) {
    const monthEnd = lookupAtOrBefore(dailySwapStock, `${month}-31`);
    if (!monthEnd || month < SWAP_DAILY_START_DATE.slice(6) + "-01") continue;
    cbSwapByMonth.push([month, -k14 - monthEnd.buy]);
  }

  const firstDailySwap = dailySwapStock[0]?.[0] ?? "9999";
  function swapFor(iso: string): { net: number; buy: number; sell: number; cb: number } | null {
    const month = iso.slice(0, 7);
    if (iso >= firstDailySwap && cbSwapByMonth.length) {
      const stock = lookupAtOrBefore(dailySwapStock, iso)!;
      const cb = lookupAtOrBefore(cbSwapByMonth, month) ?? cbSwapByMonth[0][1];
      return { net: stock.sell - stock.buy - cb, buy: stock.buy, sell: stock.sell, cb };
    }
    const m = lookupAtOrBefore(monthlySwap, month);
    return m ? { net: m.k23 + m.k14, buy: -m.k14, sell: m.k23, cb: 0 } : null;
  }

  // Monthly short-term external debt (TP.KVDB19, USD million → billion).
  const debtByMonth: [string, number][] = [];
  for (const it of debtItems) {
    const v = parseNum(it[k(SERIES_ST_DEBT)]);
    if (v === null) continue;
    debtByMonth.push([monthKeyOf(it.Tarih), v / 1000]);
  }
  debtByMonth.sort((a, b) => a[0].localeCompare(b[0]));

  // Net FX position = (A02 − A10) / mid USD/TRY, USD billion. A10 already holds
  // Treasury FX deposits as a liability, so this excludes Treasury FX.
  const nfpPoints: { date: string; value: number }[] = [];
  for (const it of dailyItems) {
    const a02 = parseNum(it[k(SERIES_DAILY_A02)]);
    const a10 = parseNum(it[k(SERIES_DAILY_A10)]);
    if (a02 === null || a10 === null) continue;
    const iso = ddmmyyyyToIso(it.Tarih);
    const rate = nearestRate(fxMap, iso);
    if (rate === null) continue;
    nfpPoints.push({ date: iso, value: (a02 - a10) / rate / 1e6 });
  }
  nfpPoints.sort((a, b) => a.date.localeCompare(b.date));

  function makePoint(date: string, nfp: number, gross: number): ReserveDataPoint {
    const debt = lookupAtOrBefore(debtByMonth, date.slice(0, 7));
    const swap = swapFor(date)?.net ?? 0;
    return {
      date,
      net_excl_swap: parseFloat((nfp + swap).toFixed(2)),
      net_incl_swap: parseFloat(nfp.toFixed(2)),
      gross: parseFloat(gross.toFixed(2)),
      st_debt_1y: debt !== undefined ? parseFloat(debt.toFixed(2)) : undefined,
    };
  }

  // Daily: every A02/A10 business day, gross carried forward from the last weekly publish.
  const daily: ReserveDataPoint[] = [];
  let g = -1;
  for (const p of nfpPoints) {
    while (g + 1 < weeklyRes.length && weeklyRes[g + 1].date <= p.date) g++;
    if (g < 0) continue;
    daily.push(makePoint(p.date, p.value, weeklyRes[g].gross));
  }

  // Weekly: one point per gross publish date, using that day's (or the last prior) net position.
  const weekly: ReserveDataPoint[] = [];
  let n = -1;
  for (const w of weeklyRes) {
    while (n + 1 < nfpPoints.length && nfpPoints[n + 1].date <= w.date) n++;
    if (n < 0) continue;
    weekly.push(makePoint(w.date, nfpPoints[n].value, w.gross));
  }

  // Monthly: last weekly observation per calendar month.
  const byMonth = new Map<string, ReserveDataPoint>();
  for (const pt of weekly) {
    byMonth.set(pt.date.slice(0, 7), { ...pt, date: pt.date.slice(0, 7) });
  }
  const monthly = Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));

  // ---- Gold decomposition (weekly, from 2018 when BIST gold prices start) ----
  const goldPrice: [string, number][] = [];
  for (const it of goldPriceItems) {
    const v = parseNum(it[k(SERIES_GOLD_PRICE)]);
    if (v !== null) goldPrice.push([ddmmyyyyToIso(it.Tarih), v]);
  }
  goldPrice.sort((a, b) => a[0].localeCompare(b[0]));

  const goldLiabOz: [string, number][] = [];
  for (const it of goldLiabItems) {
    let grams = 0;
    for (const code of SERIES_GOLD_LIAB) grams += parseNum(it[k(code)]) ?? 0;
    goldLiabOz.push([ddmmyyyyToIso(it.Tarih), grams / GRAMS_PER_OZ / 1e6]);
  }
  goldLiabOz.sort((a, b) => a[0].localeCompare(b[0]));

  const weeklyByDate = new Map(weekly.map((w) => [w.date, w]));
  const gold: GoldWeeklyPoint[] = [];
  for (const w of weeklyRes) {
    if (w.gold === null || w.fx === null || w.date < goldPrice[0]?.[0]) continue;
    const price = lookupAtOrBefore(goldPrice, w.date);
    const wk = weeklyByDate.get(w.date);
    if (!price || !wk) continue;
    const oz = (w.gold * 1000) / price;
    const liabOz = lookupAtOrBefore(goldLiabOz, w.date) ?? 0;
    const netGoldValue = ((oz - liabOz) * price) / 1000;
    const prev = gold[gold.length - 1];
    const dPrice = prev ? price - prev.price : 0;
    const goldPriceGross = prev ? (prev.oz * dPrice) / 1000 : 0;
    const goldPriceNet = prev ? ((prev.oz - prev.liabOz) * dPrice) / 1000 : 0;
    const swap = swapFor(w.date);
    const round = (v: number) => parseFloat(v.toFixed(3));
    gold.push({
      date: w.date,
      price,
      oz: round(oz),
      liabOz: round(liabOz),
      gold: round(w.gold),
      fx: round(w.fx),
      gross: round(w.gross),
      netExclSwap: wk.net_excl_swap,
      netGoldValue: round(netGoldValue),
      netLiquid: round(wk.net_excl_swap - netGoldValue),
      swapNet: round(swap?.net ?? 0),
      c: {
        goldPriceGross: round(goldPriceGross),
        goldQty: prev ? round(w.gold - prev.gold - goldPriceGross) : 0,
        fx: prev ? round(w.fx - prev.fx) : 0,
        goldPriceNet: round(goldPriceNet),
        netFlows: prev ? round(wk.net_excl_swap - prev.netExclSwap - goldPriceNet) : 0,
      },
    });
  }

  const swaps: SwapPoint[] = [];
  for (const [date] of dailySwapStock) {
    const s = swapFor(date);
    if (!s) continue;
    swaps.push({
      date,
      sell: parseFloat(s.sell.toFixed(2)),
      buy: parseFloat(s.buy.toFixed(2)),
      cb: parseFloat(s.cb.toFixed(2)),
      net: parseFloat(s.net.toFixed(2)),
    });
  }

  return { daily, weekly, monthly, gold, swaps };
});
