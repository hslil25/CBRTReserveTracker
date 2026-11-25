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
  Brush,
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
import { buildChartData, fmtNum } from "@/lib/reserves";
import Segmented from "@/components/Segmented";

interface Props {
  weekly: ReserveDataPoint[];
  monthly: ReserveDataPoint[];
}

const VIEW_TOOLTIPS: Record<"weekly" | "monthly", string> = {
  weekly:
    "Her cuma günündeki net döviz pozisyonu (A02 − A10). Haftada bir gözlem.",
  monthly:
    "Ay sonu — her takvim ayının son haftalık gözlemi.",
};

const METRIC_TOOLTIPS: Record<keyof typeof METRIC_LABELS, string> = {
  net_excl_swap:
    "Net döviz pozisyonundan TCMB swap stoku düşülmüş hali; Hazine dövizi hariç. Borçlanılan dövizi net rakamdan çıkarır.",
  net_incl_swap:
    "Net döviz pozisyonu: dış varlıklar (TP.AB.A02) − toplam döviz yükümlülükleri (TP.AB.A10), swaplar dahil. Hazine döviz mevduatı yükümlülük olarak sayılır.",
  gross: "Brüt döviz rezervi — yükümlülükler düşülmeden toplam rezerv varlıkları.",
};

function formatDateLabel(dateStr: string, view: PeriodView): string {
  if (view === "monthly") {
    const [year, month] = dateStr.split("-");
    return new Date(Number(year), Number(month) - 1).toLocaleDateString("tr-TR", {
      month: "short",
      year: "2-digit",
    });
  }
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { month: "short", day: "numeric", year: "2-digit" });
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
          {pt.value >= 0 ? "+" : ""}
          {fmtNum(pt.value, 1)} mlr $
        </span>
      </p>
    </div>
  );
}

export default function HistoricalChart({ weekly, monthly }: Props) {
  const [activeMetric, setActiveMetric] = useState<ReserveMetric>("net_excl_swap");
  const [view, setView] = useState<PeriodView>("weekly");

  const actuals = view === "weekly" ? weekly : monthly;
  const chartData = useMemo(() => buildChartData(actuals, activeMetric), [actuals, activeMetric]);
  const color = METRIC_COLORS[activeMetric];

  const hasNegative = chartData.some((d) => d.value < 0);
  const earliest = chartData[0]?.date;
  const latest = chartData[chartData.length - 1]?.date;

  return (
    <section className="bg-[#0d131c] border border-[#1a2433] rounded-2xl p-5 sm:p-7 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-100 text-base font-semibold tracking-tight mb-1">
            Rezerv Geçmişi
          </h2>
          <p className="text-xs text-slate-500">
            {earliest && latest && (
              <>
                {formatDateLabel(earliest, view)} – {formatDateLabel(latest, view)} · bir aralığa odaklanmak için
                alttaki tutamaçları sürükleyin
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Segmented
            options={METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m], title: METRIC_TOOLTIPS[m] }))}
            value={activeMetric}
            onChange={setActiveMetric}
          />
          <Segmented
            options={(["weekly", "monthly"] as Array<Exclude<PeriodView, "daily">>).map((v) => ({
              value: v,
              label: v === "weekly" ? "Haftalık" : "Aylık",
              title: VIEW_TOOLTIPS[v],
            }))}
            value={view as Exclude<PeriodView, "daily">}
            onChange={setView}
          />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="histActualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
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
            fill="url(#histActualGrad)"
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: "#0d1520", strokeWidth: 2 }}
          />

          <Brush
            dataKey="date"
            height={28}
            stroke="#334155"
            fill="#0a0d12"
            travellerWidth={8}
            tickFormatter={(d) => formatDateLabel(d, view)}
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
