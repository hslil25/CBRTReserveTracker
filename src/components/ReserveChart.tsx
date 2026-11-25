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
import Segmented from "@/components/Segmented";

interface Props {
  daily: ReserveDataPoint[];
  weekly: ReserveDataPoint[];
  monthly: ReserveDataPoint[];
}

const VIEW_TOOLTIPS: Record<PeriodView, string> = {
  daily:
    "Daily net FX position from the CBRT analytical balance sheet: (TP.AB.A02 − TP.AB.A10) ÷ mid USD/TRY.",
  weekly:
    "Net FX position (A02 − A10) on each Friday gross-reserve publish date.",
  monthly:
    "Last weekly observation within each calendar month — i.e. end-of-month snapshot.",
};

const VIEW_DESCRIPTIONS: Record<PeriodView, string> = {
  daily:
    "Daily — net FX position from the CBRT analytical balance sheet (A02 − A10).",
  weekly:
    "Weekly — net FX position (A02 − A10) on each Friday. One observation per week.",
  monthly:
    "End-of-month snapshot — last weekly observation of each calendar month.",
};

const METRIC_TOOLTIPS: Record<keyof typeof METRIC_LABELS, string> = {
  net_excl_swap:
    "Net FX position minus the CBRT swap stock, excluding Treasury FX. Removes borrowed FX from the net figure.",
  net_incl_swap:
    "Net FX position: external assets (TP.AB.A02) − total FX liabilities (TP.AB.A10), swaps included. Treasury FX deposits are counted as liabilities.",
  gross: "Gross FX reserves — total FX assets without subtracting liabilities.",
};

type Range = "3M" | "6M" | "1Y" | "3Y";
const RANGES: Range[] = ["3M", "6M", "1Y", "3Y"];
const RANGE_MONTHS: Record<Range, number> = { "3M": 3, "6M": 6, "1Y": 12, "3Y": 36 };

function sliceRange(series: ReserveDataPoint[], range: Range): ReserveDataPoint[] {
  if (!series.length) return series;
  const last = series[series.length - 1].date;
  const cutoff = new Date(last.length === 7 ? `${last}-01` : last);
  cutoff.setMonth(cutoff.getMonth() - RANGE_MONTHS[range]);
  const key = cutoff.toISOString().slice(0, last.length);
  return series.filter((pt) => pt.date >= key);
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
    <div className="bg-[#0f1621] border border-[#243246] rounded-lg px-3 py-2 text-xs shadow-xl min-w-[140px]">
      <p className="text-slate-400 mb-1.5">{formatDateLabel(label, view)}</p>
      <p style={{ color }}>
        <span className="font-bold">
          {pt.value.toFixed(1)} bn $
        </span>
      </p>
    </div>
  );
}

export default function ReserveChart({ daily, weekly, monthly }: Props) {
  const [activeMetric, setActiveMetric] = useState<ReserveMetric>("net_excl_swap");
  const [view, setView] = useState<PeriodView>("daily");
  const [range, setRange] = useState<Range>("6M");

  const full = view === "daily" ? daily : view === "weekly" ? weekly : monthly;
  const actuals = useMemo(() => sliceRange(full, range), [full, range]);
  const chartData = useMemo(() => buildChartData(actuals, activeMetric), [actuals, activeMetric]);
  const color = METRIC_COLORS[activeMetric];

  const latestValue = actuals[actuals.length - 1][activeMetric];
  const prevValue = actuals[actuals.length - 2]?.[activeMetric] ?? latestValue;
  const change = latestValue - prevValue;
  const changeLabel = view === "daily" ? "DoD" : view === "weekly" ? "WoW" : "MoM";
  const latestDate = actuals[actuals.length - 1].date;
  const rangeChange = latestValue - actuals[0][activeMetric];

  const hasNegative = chartData.some((d) => d.value < 0);

  return (
    <section className="bg-[#0d131c] border border-[#1a2433] rounded-2xl p-5 sm:p-7 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-6">
        <div>
          <h2 className="text-slate-100 text-base font-semibold tracking-tight">
            {METRIC_LABELS[activeMetric]}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            USD billion · as of {formatDateLabel(latestDate, view === "monthly" ? "monthly" : "daily")}
          </p>
          <div className="flex items-baseline gap-3 mt-3">
            <span className="text-4xl font-semibold tracking-tight" style={{ color }}>
              {latestValue.toFixed(1)}
            </span>
            <span className={`text-sm font-medium whitespace-nowrap ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(1)} {changeLabel}
            </span>
            <span className={`text-sm whitespace-nowrap ${rangeChange >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
              {rangeChange >= 0 ? "+" : "−"}{Math.abs(rangeChange).toFixed(1)} {range}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Segmented
            options={METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m], title: METRIC_TOOLTIPS[m] }))}
            value={activeMetric}
            onChange={setActiveMetric}
          />
          <Segmented
            options={(["daily", "weekly", "monthly"] as PeriodView[]).map((v) => ({
              value: v,
              label: v[0].toUpperCase() + v.slice(1),
              title: VIEW_TOOLTIPS[v],
            }))}
            value={view}
            onChange={setView}
          />
          <Segmented
            options={RANGES.map((r) => ({ value: r, label: r }))}
            value={range}
            onChange={setRange}
          />
        </div>
      </div>


      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#1a2433" vertical={false} />
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
            tickFormatter={(v) => `${v}`}
            domain={["auto", "auto"]}
            width={52}
          />
          {hasNegative && (
            <ReferenceLine y={0} stroke="#475569" />
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
            activeDot={{ r: 4, fill: color, stroke: "#0d131c", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-slate-500 mt-4 pt-4 border-t border-[#1a2433]">
        {VIEW_DESCRIPTIONS[view]} Source: CBRT EVDS analytical balance sheet; swaps from daily CBRT swap stocks plus monthly central-bank swaps.
      </p>
    </section>
  );
}

