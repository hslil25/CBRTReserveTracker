'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useMemo, useState } from "react";
import {
  ReserveDataPoint,
  ReserveMetric,
  PeriodView,
  ChartPoint,
  METRICS,
  METRIC_LABELS,
  METRIC_COLORS,
} from "@/lib/types";
import { buildChartData } from "@/lib/reserves";

interface Props {
  daily: ReserveDataPoint[];
  weekly: ReserveDataPoint[];
  monthly: ReserveDataPoint[];
}

function formatDateLabel(dateStr: string, view: PeriodView): string {
  if (view === "monthly") {
    const [year, month] = dateStr.split("-");
    return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  }
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: view === "daily" ? "numeric" : "2-digit",
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: { value: number; payload: ChartPoint }[];
  label?: string;
  view: PeriodView;
  color: string;
}

function CustomTooltip({ active, payload, label, view, color }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const pt = payload[0]?.payload;
  return (
    <div className="bg-[#0f1724] border border-[#1e2d3d] rounded px-3 py-2 text-xs shadow-xl min-w-[140px]">
      <p className="text-slate-400 mb-1.5">{formatDateLabel(label, view)}</p>
      <p style={{ color }}>
        <span className="font-bold">
          {pt.value >= 0 ? "+" : ""}
          {pt.value.toFixed(1)}B
        </span>
      </p>
    </div>
  );
}

export default function ReserveChart({ daily, weekly, monthly }: Props) {
  const [activeMetric, setActiveMetric] = useState<ReserveMetric>("net_excl_swap");
  const [view, setView] = useState<PeriodView>("weekly");

  const actuals = view === "daily" ? daily : view === "weekly" ? weekly : monthly;
  const chartData = useMemo(() => buildChartData(actuals, activeMetric), [actuals, activeMetric]);
  const color = METRIC_COLORS[activeMetric];

  const latestValue = actuals[actuals.length - 1][activeMetric];
  const prevValue = actuals[actuals.length - 2]?.[activeMetric] ?? latestValue;
  const change = latestValue - prevValue;
  const changeLabel = view === "daily" ? "DoD" : view === "weekly" ? "WoW" : "MoM";

  const hasNegative = chartData.some((d) => d.value < 0);

  return (
    <section className="bg-[#0d1520] border border-[#1e2d3d] rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-300 text-sm uppercase tracking-widest mb-1">
            CBRT Reserves
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color }}>
              {latestValue >= 0 ? "+" : ""}
              {latestValue.toFixed(1)}B
            </span>
            <span className="text-xs text-slate-500">USD</span>
            <span className={`text-sm ml-2 ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}B {changeLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{METRIC_LABELS[activeMetric]}</p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex bg-[#0a0d12] border border-[#1e2d3d] rounded-lg p-1 gap-1">
            {METRICS.map((m) => (
              <button
                key={m}
                onClick={() => setActiveMetric(m)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  activeMetric === m ? "text-[#0d1520] shadow" : "text-slate-500 hover:text-slate-300"
                }`}
                style={activeMetric === m ? { backgroundColor: METRIC_COLORS[m] } : {}}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>

          <div className="flex bg-[#0a0d12] border border-[#1e2d3d] rounded-lg p-1 gap-1">
            {(["daily", "weekly", "monthly"] as PeriodView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all capitalize ${
                  view === v
                    ? "bg-slate-600 text-slate-100 shadow"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatDateLabel(d, view)}
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={64}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}B`}
            width={52}
          />
          {hasNegative && (
            <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
          )}
          <Tooltip
            content={<CustomTooltip view={view} color={color} />}
            cursor={{ stroke: color, strokeWidth: 1, strokeOpacity: 0.3 }}
          />

          <Area
            type="monotone"
            dataKey="value"
            name={METRIC_LABELS[activeMetric]}
            stroke={color}
            strokeWidth={2}
            fill="url(#actualGrad)"
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: "#0d1520", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1e2d3d]">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5" style={{ backgroundColor: color }} />
          <span className="text-xs text-slate-500">
            {view === "daily"
              ? "Daily estimate (A02 − A10, Δ-anchored to N05)"
              : view === "weekly"
              ? "Weekly (TP.AB.N05)"
              : "Monthly (last weekly obs.)"}
          </span>
        </div>
      </div>
    </section>
  );
}
