'use client';

import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { useMemo, useState } from "react";
import { GoldWeeklyPoint, SwapPoint } from "@/lib/types";
import { fmtBn, fmtDay, sliceByMonths } from "@/lib/reserves";
import Segmented from "@/components/Segmented";

type View = "composition" | "net" | "swaps";
type Range = "6M" | "1Y" | "3Y" | "All";
const RANGE_MONTHS: Record<Range, number> = { "6M": 6, "1Y": 12, "3Y": 36, All: 0 };

const VIEW_NOTES: Record<View, string> = {
  composition:
    "Gross reserves split into gold and foreign-currency reserves. FX reserves excluding gold are the most liquid part of the stock.",
  net:
    "Net reserves ex-swaps split into the CBRT's net gold position and everything else. A negative 'net FX ex-gold' means the CBRT owes more foreign currency than it holds, and gold covers the gap.",
  swaps:
    "Daily swap stock. Claims: FX the CBRT will receive back (sold spot, bought forward). Liabilities: FX borrowed from domestic banks and from foreign central banks (the latter published monthly, carried forward). Net = claims − liabilities.",
};

interface TipProps {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}

function Tip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="bg-[#0f1621] border border-[#243246] rounded-lg px-3 py-2 text-xs shadow-xl min-w-[190px]">
      <p className="text-slate-400 mb-1.5">{fmtDay(label)}</p>
      {payload.map((e) => (
        <p key={e.name} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="text-slate-100">{fmtBn(e.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: "#64748b", fontSize: 10 },
  axisLine: false,
  tickLine: false,
} as const;

function dateTick(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export default function LiquidReserves({
  gold,
  swaps,
}: {
  gold: GoldWeeklyPoint[];
  swaps: SwapPoint[];
}) {
  const [view, setView] = useState<View>("composition");
  const [range, setRange] = useState<Range>("1Y");

  const goldRange = useMemo(() => sliceByMonths(gold, RANGE_MONTHS[range]), [gold, range]);
  const swapRange = useMemo(() => sliceByMonths(swaps, RANGE_MONTHS[range]), [swaps, range]);

  const last = gold[gold.length - 1];
  const lastSwap = swaps[swaps.length - 1];
  const goldShare = (last.gold / last.gross) * 100;

  const kpis = [
    { label: "Liquid FX reserves", value: `${fmtBn(last.fx)}`, unit: "bn $", note: "Gross FX excl. gold" },
    {
      label: "Gold reserves",
      value: `${fmtBn(last.gold)}`,
      unit: "bn $",
      note: `${last.oz.toFixed(1)}M oz · ${goldShare.toFixed(0)}% of gross`,
    },
    {
      label: "Net gold position",
      value: `${(last.oz - last.liabOz).toFixed(1)}`,
      unit: "M oz",
      note: `${fmtBn(last.netGoldValue)} bn $ after ${last.liabOz.toFixed(1)}M oz owed`,
    },
    {
      label: "Net FX ex-gold",
      value: `${fmtBn(last.netLiquid)}`,
      unit: "bn $",
      note: "Net reserves ex-swaps − net gold",
    },
    {
      label: "Net swap position",
      value: `${fmtBn(lastSwap.net)}`,
      unit: "bn $",
      note: `As of ${fmtDay(lastSwap.date)}`,
    },
  ];

  return (
    <section className="bg-[#0d131c] border border-[#1a2433] rounded-2xl p-5 sm:p-7">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-100 text-base font-semibold tracking-tight">
            Liquidity, gold &amp; swaps
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Weekly as of {fmtDay(last.date)} · USD billion
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Segmented
            options={[
              { value: "composition", label: "Composition" },
              { value: "net", label: "Net liquidity" },
              { value: "swaps", label: "Swaps" },
            ]}
            value={view}
            onChange={setView}
          />
          <Segmented
            options={(["6M", "1Y", "3Y", "All"] as Range[]).map((r) => ({ value: r, label: r }))}
            value={range}
            onChange={setRange}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[#0a0f16] border border-[#1a2433] rounded-xl px-4 py-3">
            <p className="text-[11px] font-medium text-slate-400">{k.label}</p>
            <p className="mt-1">
              <span className="text-xl font-semibold text-slate-50">{k.value}</span>{" "}
              <span className="text-[11px] text-slate-500">{k.unit}</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{k.note}</p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        {view === "composition" ? (
          <AreaChart data={goldRange} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1a2433" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dateTick} minTickGap={50} {...axisProps} />
            <YAxis width={44} {...axisProps} />
            <Tooltip content={<Tip />} />
            <Legend verticalAlign="top" align="right" height={28} iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Area
              type="monotone"
              dataKey="fx"
              name="FX reserves (liquid)"
              stackId="1"
              stroke="#38bdf8"
              fill="#38bdf8"
              fillOpacity={0.25}
            />
            <Area
              type="monotone"
              dataKey="gold"
              name="Gold"
              stackId="1"
              stroke="#eab308"
              fill="#eab308"
              fillOpacity={0.25}
            />
          </AreaChart>
        ) : view === "net" ? (
          <ComposedChart data={goldRange} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1a2433" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dateTick} minTickGap={50} {...axisProps} />
            <YAxis width={44} {...axisProps} />
            <ReferenceLine y={0} stroke="#475569" />
            <Tooltip content={<Tip />} />
            <Legend verticalAlign="top" align="right" height={28} iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Line type="monotone" dataKey="netExclSwap" name="Net reserves ex-swaps" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="netGoldValue" name="Net gold position" stroke="#eab308" strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="netLiquid" name="Net FX ex-gold" stroke="#38bdf8" strokeWidth={2} dot={false} />
          </ComposedChart>
        ) : (
          <ComposedChart
            data={swapRange.map((s) => ({ ...s, buyNeg: -s.buy, cbNeg: -s.cb }))}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#1a2433" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dateTick} minTickGap={50} {...axisProps} />
            <YAxis width={44} {...axisProps} />
            <ReferenceLine y={0} stroke="#475569" />
            <Tooltip content={<Tip />} />
            <Legend verticalAlign="top" align="right" height={28} iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <Area type="stepAfter" dataKey="sell" name="Claims (sell-side)" stroke="#34d399" fill="#34d399" fillOpacity={0.2} />
            <Area type="stepAfter" dataKey="cbNeg" name="Central-bank swaps" stackId="neg" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.2} />
            <Area type="stepAfter" dataKey="buyNeg" name="Domestic borrowing (buy-side)" stackId="neg" stroke="#fb7185" fill="#fb7185" fillOpacity={0.2} />
            <Line type="stepAfter" dataKey="net" name="Net swap position" stroke="#e2e8f0" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        )}
      </ResponsiveContainer>

      <p className="text-[11px] text-slate-500 mt-4 pt-4 border-t border-[#1a2433]">
        {VIEW_NOTES[view]}
      </p>
    </section>
  );
}
