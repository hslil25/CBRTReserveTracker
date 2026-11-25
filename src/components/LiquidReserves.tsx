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
import { fmtBn, fmtDay, sliceByMonths, fmtNum } from "@/lib/reserves";
import Segmented from "@/components/Segmented";

type View = "composition" | "net" | "swaps";
type Range = "6M" | "1Y" | "3Y" | "All";
const RANGE_MONTHS: Record<Range, number> = { "6M": 6, "1Y": 12, "3Y": 36, All: 0 };

const VIEW_NOTES: Record<View, string> = {
  composition:
    "Brüt rezervin altın ve döviz olarak dağılımı. Altın hariç döviz rezervi, stokun en likit kısmıdır.",
  net:
    "Swap hariç net rezervin, TCMB'nin net altın pozisyonu ve geri kalan kısım olarak ayrımı. 'Altın hariç net döviz'in negatif olması, TCMB'nin elindekinden fazla döviz borçlu olduğunu ve açığı altının kapattığını gösterir.",
  swaps:
    "Günlük swap stoku. Alacaklar: TCMB'nin vadede geri alacağı döviz (spot satıp vadeli aldığı). Yükümlülükler: yurt içi bankalardan ve yabancı merkez bankalarından borçlanılan döviz (ikincisi aylık yayımlanır, son değer taşınır). Net = alacaklar − yükümlülükler.",
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
  return new Date(d).toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });
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
    { label: "Likit döviz rezervi", value: `${fmtBn(last.fx)}`, unit: "mlr $", note: "Altın hariç brüt döviz" },
    {
      label: "Altın rezervi",
      value: `${fmtBn(last.gold)}`,
      unit: "mlr $",
      note: `${fmtNum(last.oz, 1)} mn ons · brüt rezervdeki payı %${fmtNum(goldShare, 0)}`,
    },
    {
      label: "Net altın pozisyonu",
      value: `${fmtNum((last.oz - last.liabOz), 1)}`,
      unit: "mn ons",
      note: `${fmtNum(last.liabOz, 1)} mn ons borç düşülünce ${fmtBn(last.netGoldValue)} mlr $`,
    },
    {
      label: "Altın hariç net döviz",
      value: `${fmtBn(last.netLiquid)}`,
      unit: "mlr $",
      note: "Swap hariç net rezerv − net altın",
    },
    {
      label: "Net swap pozisyonu",
      value: `${fmtBn(lastSwap.net)}`,
      unit: "mlr $",
      note: `${fmtDay(lastSwap.date)} itibarıyla`,
    },
  ];

  return (
    <section className="bg-[#0d131c] border border-[#1a2433] rounded-2xl p-5 sm:p-7">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-100 text-base font-semibold tracking-tight">
            Likidite, altın ve swaplar
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Haftalık, {fmtDay(last.date)} itibarıyla · milyar $
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Segmented
            options={[
              { value: "composition", label: "Kompozisyon" },
              { value: "net", label: "Net likidite" },
              { value: "swaps", label: "Swaplar" },
            ]}
            value={view}
            onChange={setView}
          />
          <Segmented
            options={(["6M", "1Y", "3Y", "All"] as Range[]).map((r) => ({ value: r, label: { "6M": "6A", "1Y": "1Y", "3Y": "3Y", All: "Tümü" }[r] }))}
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
              name="Döviz rezervi (likit)"
              stackId="1"
              stroke="#38bdf8"
              fill="#38bdf8"
              fillOpacity={0.25}
            />
            <Area
              type="monotone"
              dataKey="gold"
              name="Altın"
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
            <Line type="monotone" dataKey="netExclSwap" name="Swap hariç net rezerv" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="netGoldValue" name="Net altın pozisyonu" stroke="#eab308" strokeDasharray="4 3" dot={false} />
            <Line type="monotone" dataKey="netLiquid" name="Altın hariç net döviz" stroke="#38bdf8" strokeWidth={2} dot={false} />
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
            <Area type="stepAfter" dataKey="sell" name="Alacaklar (satım yönlü)" stroke="#34d399" fill="#34d399" fillOpacity={0.2} />
            <Area type="stepAfter" dataKey="cbNeg" name="Merkez bankası swapları" stackId="neg" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.2} />
            <Area type="stepAfter" dataKey="buyNeg" name="Yurt içi borçlanma (alım yönlü)" stackId="neg" stroke="#fb7185" fill="#fb7185" fillOpacity={0.2} />
            <Line type="stepAfter" dataKey="net" name="Net swap pozisyonu" stroke="#e2e8f0" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        )}
      </ResponsiveContainer>

      <p className="text-[11px] text-slate-500 mt-4 pt-4 border-t border-[#1a2433]">
        {VIEW_NOTES[view]}
      </p>
    </section>
  );
}
