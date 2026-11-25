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
import { useMemo } from "react";
import { ReserveDataPoint } from "@/lib/types";

interface Props {
  weekly: ReserveDataPoint[];
}

interface GGPoint {
  date: string;
  gross: number;
  debt: number;
  ratio: number; // percent
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: GGPoint }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const pt = payload[0].payload;
  const pass = pt.ratio >= 100;
  return (
    <div className="bg-[#0f1621] border border-[#243246] rounded-lg px-3 py-2 text-xs shadow-xl min-w-[160px]">
      <p className="text-slate-400 mb-1.5">{fmtDate(label)}</p>
      <p className={pass ? "text-emerald-400" : "text-red-400"}>
        Ratio: <span className="font-bold">{pt.ratio.toFixed(1)}%</span>{" "}
        <span className="text-[10px] uppercase tracking-wider">{pass ? "pass" : "fail"}</span>
      </p>
      <p className="text-slate-500 mt-1">Gross: {pt.gross.toFixed(1)}B</p>
      <p className="text-slate-500">ST debt: {pt.debt.toFixed(1)}B</p>
    </div>
  );
}

export default function GuidottiGreenspan({ weekly }: Props) {
  const series = useMemo<GGPoint[]>(() => {
    return weekly
      .filter((d): d is ReserveDataPoint & { st_debt_1y: number } =>
        typeof d.st_debt_1y === "number" && d.st_debt_1y > 0
      )
      .map((d) => ({
        date: d.date,
        gross: d.gross,
        debt: d.st_debt_1y,
        ratio: (d.gross / d.st_debt_1y) * 100,
      }));
  }, [weekly]);

  if (!series.length) {
    return null;
  }

  const latest = series[series.length - 1];
  const latestPass = latest.ratio >= 100;

  // Stats: months passing vs failing across the series
  const passCount = series.filter((s) => s.ratio >= 100).length;
  const passPct = (passCount / series.length) * 100;

  // Find lowest and highest ratio days
  let minPt = series[0];
  let maxPt = series[0];
  for (const s of series) {
    if (s.ratio < minPt.ratio) minPt = s;
    if (s.ratio > maxPt.ratio) maxPt = s;
  }

  const hasBelow100 = series.some((s) => s.ratio < 100);
  const ratioColor = latestPass ? "#10b981" : "#ef4444";

  return (
    <section className="bg-[#0d131c] border border-[#1a2433] rounded-2xl p-5 sm:p-7 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-100 text-base font-semibold tracking-tight mb-1">
            Guidotti–Greenspan Rule
          </h2>
          <p className="text-xs text-slate-500 max-w-xl">
            Gross FX reserves / short-term external debt (1y).
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-baseline gap-2 justify-end">
            <span className="text-3xl font-bold" style={{ color: ratioColor }}>
              {latest.ratio.toFixed(1)}%
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wider"
              style={{ color: ratioColor, backgroundColor: `${ratioColor}1a` }}
            >
              {latestPass ? "Pass" : "Fail"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {latest.gross.toFixed(1)}B / {latest.debt.toFixed(1)}B · {fmtDate(latest.date)}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ggGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={ratioColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={ratioColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#1a2433" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
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
            tickFormatter={(v) => `${v}%`}
            width={48}
          />

          {hasBelow100 && (
            <ReferenceLine
              y={100}
              stroke="#facc15"
              strokeDasharray="4 4"
              label={{
                value: "100% threshold",
                position: "insideTopRight",
                fill: "#facc15",
                fontSize: 10,
              }}
            />
          )}

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: ratioColor, strokeWidth: 1, strokeOpacity: 0.3 }} />

          <Area
            type="monotone"
            dataKey="ratio"
            stroke={ratioColor}
            strokeWidth={2}
            fill="url(#ggGrad)"
            dot={false}
            activeDot={{ r: 4, fill: ratioColor, stroke: "#0d1520", strokeWidth: 2 }}
          />

          <Brush
            dataKey="date"
            height={28}
            stroke="#334155"
            fill="#0a0d12"
            travellerWidth={8}
            tickFormatter={fmtDate}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-[#1a2433]">
        <div className="bg-[#0a0f16] border border-[#1a2433] rounded-lg px-3 py-2">
          <p className="text-slate-500 text-xs font-medium mb-0.5">Pass rate</p>
          <p className="text-emerald-400 font-bold text-sm">
            {passPct.toFixed(0)}% <span className="text-slate-500 font-normal">of weeks</span>
          </p>
        </div>
        <div className="bg-[#0a0f16] border border-[#1a2433] rounded-lg px-3 py-2">
          <p className="text-slate-500 text-xs font-medium mb-0.5">Low</p>
          <p className="text-red-400 font-bold text-sm">{minPt.ratio.toFixed(1)}%</p>
          <p className="text-slate-600 text-xs">{fmtDate(minPt.date)}</p>
        </div>
        <div className="bg-[#0a0f16] border border-[#1a2433] rounded-lg px-3 py-2">
          <p className="text-slate-500 text-xs font-medium mb-0.5">High</p>
          <p className="text-emerald-400 font-bold text-sm">{maxPt.ratio.toFixed(1)}%</p>
          <p className="text-slate-600 text-xs">{fmtDate(maxPt.date)}</p>
        </div>
        <div className="bg-[#0a0f16] border border-[#1a2433] rounded-lg px-3 py-2">
          <p className="text-slate-500 text-xs font-medium mb-0.5">Latest</p>
          <p className="font-bold text-sm" style={{ color: ratioColor }}>
            {latest.ratio.toFixed(1)}%
          </p>
          <p className="text-slate-600 text-xs">{fmtDate(latest.date)}</p>
        </div>
      </div>
    </section>
  );
}
