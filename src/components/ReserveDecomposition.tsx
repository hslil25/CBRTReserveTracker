'use client';

import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Cell,
} from "recharts";
import { useMemo, useState } from "react";
import { GoldWeeklyPoint } from "@/lib/types";
import { fmtBn, fmtDay } from "@/lib/reserves";
import Segmented from "@/components/Segmented";

type Basis = "net" | "gross";
type Preset = "4W" | "3M" | "6M" | "YTD" | "1Y" | "custom";

const PRESET_MONTHS: Record<Exclude<Preset, "custom">, number> = {
  "4W": 1,
  "3M": 3,
  "6M": 6,
  YTD: -1,
  "1Y": 12,
};

interface Component {
  key: keyof GoldWeeklyPoint["c"];
  label: string;
  color: string;
  note: string;
}

const COMPONENTS: Record<Basis, Component[]> = {
  net: [
    {
      key: "goldPriceNet",
      label: "Gold price effect",
      color: "#eab308",
      note: "Revaluation of the CBRT's net gold position (holdings minus gold owed to banks) as the USD gold price moves.",
    },
    {
      key: "netFlows",
      label: "FX sales & other flows",
      color: "#38bdf8",
      note: "Everything else: CBRT FX sales or purchases, Treasury FX buying, exporter rediscount repayments and non-USD currency valuation.",
    },
  ],
  gross: [
    {
      key: "goldPriceGross",
      label: "Gold price effect",
      color: "#eab308",
      note: "Revaluation of all gold holdings as the USD gold price moves.",
    },
    {
      key: "goldQty",
      label: "Gold quantity change",
      color: "#f97316",
      note: "Gold bought, sold, swapped or deposited by banks, valued at the period's price.",
    },
    {
      key: "fx",
      label: "FX reserves change",
      color: "#38bdf8",
      note: "Change in foreign-currency reserves excluding gold: sales, swaps, bank and Treasury deposits, borrowing.",
    },
  ],
};

const LEVEL_LABEL: Record<Basis, string> = {
  net: "Net reserves ex-swaps",
  gross: "Gross reserves",
};

function level(p: GoldWeeklyPoint, basis: Basis): number {
  return basis === "net" ? p.netExclSwap : p.gross;
}

function startIndexFor(series: GoldWeeklyPoint[], preset: Exclude<Preset, "custom">): number {
  const last = series[series.length - 1].date;
  const months = PRESET_MONTHS[preset];
  let cutoff: string;
  if (months === -1) {
    cutoff = `${Number(last.slice(0, 4)) - 1}-12-31`;
  } else {
    const d = new Date(last);
    d.setMonth(d.getMonth() - months);
    cutoff = d.toISOString().slice(0, 10);
  }
  let idx = 0;
  for (let i = 0; i < series.length; i++) if (series[i].date <= cutoff) idx = i;
  return idx;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: Record<string, unknown>; name?: string; value?: number; color?: string }[];
  label?: string;
}

function WaterfallTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { name: string; delta: number; isLevel: boolean };
  return (
    <div className="bg-[#0f1621] border border-[#243246] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{p.name}</p>
      <p className="text-slate-100 font-semibold">
        {p.isLevel ? fmtBn(p.delta) : fmtBn(p.delta, true)} bn $
      </p>
    </div>
  );
}

function WeeklyTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="bg-[#0f1621] border border-[#243246] rounded-lg px-3 py-2 text-xs shadow-xl min-w-[180px]">
      <p className="text-slate-400 mb-1.5">Week to {fmtDay(label)}</p>
      {payload.map((e) => (
        <p key={e.name} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="text-slate-100">{fmtBn(e.value ?? 0, true)}</span>
        </p>
      ))}
    </div>
  );
}

export default function ReserveDecomposition({ gold }: { gold: GoldWeeklyPoint[] }) {
  const [basis, setBasis] = useState<Basis>("net");
  const [preset, setPreset] = useState<Preset>("3M");
  const [customStart, setCustomStart] = useState(gold[startIndexFor(gold, "3M")].date);
  const [customEnd, setCustomEnd] = useState(gold[gold.length - 1].date);

  const [startIdx, endIdx] = useMemo(() => {
    if (preset !== "custom") return [startIndexFor(gold, preset), gold.length - 1];
    const s = gold.findIndex((p) => p.date === customStart);
    const e = gold.findIndex((p) => p.date === customEnd);
    return s <= e ? [s, e] : [e, s];
  }, [gold, preset, customStart, customEnd]);

  const components = COMPONENTS[basis];
  const start = gold[startIdx];
  const end = gold[endIdx];
  const weeks = gold.slice(startIdx + 1, endIdx + 1);

  const totals = components.map((c) => ({
    ...c,
    value: weeks.reduce((sum, w) => sum + w.c[c.key], 0),
  }));
  const totalChange = level(end, basis) - level(start, basis);

  const waterfall = useMemo(() => {
    const rows: { name: string; range: [number, number]; delta: number; color: string; isLevel: boolean }[] = [];
    const s = level(start, basis);
    rows.push({ name: fmtDay(start.date), range: [0, s], delta: s, color: "#475569", isLevel: true });
    let running = s;
    for (const t of totals) {
      rows.push({
        name: t.label,
        range: [running, running + t.value],
        delta: t.value,
        color: t.color,
        isLevel: false,
      });
      running += t.value;
    }
    const e = level(end, basis);
    rows.push({ name: fmtDay(end.date), range: [0, e], delta: e, color: "#64748b", isLevel: true });
    return rows;
  }, [start, end, basis, totals]);

  const weeklyRows = useMemo(
    () =>
      weeks.map((w) => {
        const row: Record<string, number | string> = { date: w.date };
        for (const c of components) row[c.label] = parseFloat(w.c[c.key].toFixed(2));
        row.Total = parseFloat(components.reduce((s, c) => s + w.c[c.key], 0).toFixed(2));
        return row;
      }),
    [weeks, components]
  );

  const biggest = [...totals].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const verb = totalChange < 0 ? "fell" : "rose";
  const absTotalShare = totals.reduce((s, t) => s + Math.abs(t.value), 0) || 1;

  const dateOptions = gold.slice(-260).map((p) => p.date);

  return (
    <section className="bg-[#0d131c] border border-[#1a2433] rounded-2xl p-5 sm:p-7">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-100 text-base font-semibold tracking-tight">
            What moved reserves?
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
            Splits the change in reserves into gold price revaluation and everything else. Weekly
            data, USD billion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Segmented
            options={[
              { value: "net", label: "Net ex-swaps" },
              { value: "gross", label: "Gross" },
            ]}
            value={basis}
            onChange={setBasis}
          />
          <Segmented
            options={(["4W", "3M", "6M", "YTD", "1Y", "custom"] as Preset[]).map((p) => ({
              value: p,
              label: p === "custom" ? "Custom" : p,
            }))}
            value={preset}
            onChange={setPreset}
          />
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 mb-5 text-xs text-slate-400">
          <span>From</span>
          <select
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-[#0a0f16] border border-[#1a2433] rounded-md px-2 py-1.5 text-slate-200"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
          <span>to</span>
          <select
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-[#0a0f16] border border-[#1a2433] rounded-md px-2 py-1.5 text-slate-200"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-[#0a0f16] border border-[#1a2433] rounded-xl px-4 py-3 mb-6 text-sm text-slate-300">
        {LEVEL_LABEL[basis]} {verb} by{" "}
        <span className="font-semibold text-slate-50">{fmtBn(Math.abs(totalChange))} bn $</span>{" "}
        between {fmtDay(start.date)} and {fmtDay(end.date)} ({fmtBn(level(start, basis))} →{" "}
        {fmtBn(level(end, basis))}). The largest driver was{" "}
        <span style={{ color: biggest.color }} className="font-medium">
          {biggest.label.toLowerCase()}
        </span>{" "}
        at {fmtBn(biggest.value, true)} bn $.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Bridge</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={waterfall} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1a2433" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
              <ReferenceLine y={0} stroke="#475569" />
              <Tooltip content={<WaterfallTip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
              <Bar dataKey="range" radius={[4, 4, 4, 4]} isAnimationActive={false}>
                {waterfall.map((r) => (
                  <Cell key={r.name} fill={r.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-3">
          <p className="text-xs font-medium text-slate-400">Contribution</p>
          {totals.map((t) => (
            <div key={t.key} className="bg-[#0a0f16] border border-[#1a2433] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
                <span
                  className={`text-sm font-semibold ${t.value < 0 ? "text-rose-400" : "text-emerald-400"}`}
                >
                  {fmtBn(t.value, true)}
                </span>
              </div>
              <div className="h-1.5 bg-[#1a2433] rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(Math.abs(t.value) / absTotalShare) * 100}%`,
                    backgroundColor: t.color,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">{t.note}</p>
            </div>
          ))}
          <div className="flex items-center justify-between px-1 text-sm">
            <span className="text-slate-400">Total change</span>
            <span className="font-semibold text-slate-50">{fmtBn(totalChange, true)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs font-medium text-slate-400 mt-8 mb-2">Week by week</p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={weeklyRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
          <CartesianGrid stroke="#1a2433" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) =>
              new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            }
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
          <ReferenceLine y={0} stroke="#475569" />
          <Tooltip content={<WeeklyTip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
          <Legend verticalAlign="top" align="right" height={28} iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
          {components.map((c) => (
            <Bar key={c.key} dataKey={c.label} stackId="a" fill={c.color} isAnimationActive={false} />
          ))}
          <Line
            dataKey="Total"
            name="Total change"
            stroke="#e2e8f0"
            strokeWidth={1.5}
            dot={{ r: 2, fill: "#e2e8f0" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-slate-500 mt-4 pt-4 border-t border-[#1a2433]">
        Method: gold holdings in ounces are implied from weekly gold reserves (TP.AB.C1) ÷ BIST gold
        price (USD/oz). Price effect = previous week&apos;s ounces × weekly price change. For net
        reserves, gold owed to banks (weekly CBRT statement) is netted out first. Weekly figures
        carry ±1–2% noise from valuation timing; it cancels over longer periods.
      </p>
    </section>
  );
}
