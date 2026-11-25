import { ReserveDataPoint, ChartPoint, WeeklyChange, ReserveMetric } from "./types";

export function buildChartData(
  series: ReserveDataPoint[],
  metric: ReserveMetric
): ChartPoint[] {
  return series.map((d) => ({ date: d.date, value: d[metric] }));
}

export function getBiggestWeeklyChanges(
  series: ReserveDataPoint[],
  metric: ReserveMetric,
  topN = 10
): WeeklyChange[] {
  const changes: WeeklyChange[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    changes.push({
      date: curr.date,
      metric,
      change: parseFloat((curr[metric] - prev[metric]).toFixed(2)),
      from: prev[metric],
      to: curr[metric],
    });
  }
  return changes
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, topN);
}

export function fmtBn(v: number, signed = false): string {
  const sign = v < 0 ? "−" : signed ? "+" : "";
  return `${sign}${Math.abs(v).toFixed(1)}`;
}

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Months back from the last observation; 0 = all, -1 = year to date.
export function sliceByMonths<T extends { date: string }>(series: T[], months: number): T[] {
  if (!series.length || months === 0) return series;
  const last = series[series.length - 1].date;
  const cutoff =
    months === -1
      ? `${Number(last.slice(0, 4)) - 1}-12-31`
      : (() => {
          const d = new Date(last);
          d.setMonth(d.getMonth() - months);
          return d.toISOString().slice(0, 10);
        })();
  return series.filter((p) => p.date >= cutoff);
}
