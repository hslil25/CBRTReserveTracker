'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useMemo, useState } from "react";
import {
  WeeklyChange,
  ReserveDataPoint,
  ReserveMetric,
  METRICS,
  METRIC_LABELS,
  METRIC_COLORS,
} from "@/lib/types";
import { getBiggestWeeklyChanges } from "@/lib/reserves";

type Granularity = "daily" | "weekly";

interface Props {
  series: ReserveDataPoint[];
  granularity: Granularity;
}

const LABELS: Record<Granularity, { title: string; subtitle: string }> = {
  daily: {
    title: "Biggest Daily Changes",
    subtitle: "Top 10 absolute day-over-day moves",
  },
  weekly: {
    title: "Biggest Weekly Changes",
    subtitle: "Top 10 absolute week-over-week moves",
  },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface TooltipPayload {
  payload: WeeklyChange;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0f1724] border border-[#1e2d3d] rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{formatDate(d.date)}</p>
      <p className="text-slate-300">
        {d.from.toFixed(1)}B → {d.to.toFixed(1)}B
      </p>
      <p className={d.change >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
        {d.change >= 0 ? "+" : ""}
        {d.change.toFixed(1)}B
      </p>
    </div>
  );
}

export default function BiggestChanges({ series, granularity }: Props) {
  const [activeMetric, setActiveMetric] = useState<ReserveMetric>("net_excl_swap");
  const changes = useMemo(
    () => getBiggestWeeklyChanges(series, activeMetric, 10),
    [series, activeMetric]
  );

  const { title, subtitle } = LABELS[granularity];

  return (
    <section className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-300 text-sm uppercase tracking-widest">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex bg-[#0a0d12] border border-[#1e2d3d] rounded-lg p-1 gap-1">
          {METRICS.map((m) => (
            <button
              key={m}
              onClick={() => setActiveMetric(m)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                activeMetric === m
                  ? "text-[#0d1520] shadow"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              style={activeMetric === m ? { backgroundColor: METRIC_COLORS[m] } : {}}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={changes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={56}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}B`}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e2d3d44" }} />
          <Bar dataKey="change" radius={[3, 3, 0, 0]}>
            {changes.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.change >= 0 ? "#10b981" : "#ef4444"}
                opacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {changes.slice(0, 5).map((c) => (
          <div
            key={c.date}
            className="bg-[#0a0d12] border border-[#1e2d3d] rounded-lg px-3 py-2 text-center"
          >
            <p className="text-slate-500 text-xs">{formatDate(c.date)}</p>
            <p
              className={`text-sm font-bold mt-0.5 ${
                c.change >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {c.change >= 0 ? "+" : ""}
              {c.change.toFixed(1)}B
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
