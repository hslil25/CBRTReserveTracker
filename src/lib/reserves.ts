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
