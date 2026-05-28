import ReserveChart from "@/components/ReserveChart";
import BiggestChanges from "@/components/BiggestChanges";
import HistoricalChart from "@/components/HistoricalChart";
import GuidottiGreenspan from "@/components/GuidottiGreenspan";
import { getReserveSeries } from "@/lib/evds";
import { ReserveDataPoint } from "@/lib/types";

function sliceLastYears(series: ReserveDataPoint[], years: number): ReserveDataPoint[] {
  if (!series.length) return series;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffMonth = cutoff.toISOString().slice(0, 7);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  return series.filter((pt) => {
    const key = pt.date.length === 7 ? cutoffMonth : cutoffDay;
    return pt.date >= key;
  });
}

export default async function Home() {
  const { daily, weekly, monthly } = await getReserveSeries();

  const dailyRecent = sliceLastYears(daily, 3);
  const weeklyRecent = sliceLastYears(weekly, 3);
  const monthlyRecent = sliceLastYears(monthly, 3);

  return (
    <main className="min-h-screen bg-[#0a0d12] text-slate-200">
      <header className="border-b border-[#1e2d3d] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center">
            <span className="text-[10px] font-black text-[#0a0d12]">₺</span>
          </div>
          <span className="font-bold text-slate-100 tracking-tight text-sm">
            CBRT FX Reserves
          </span>
          <span className="text-slate-600 text-xs hidden sm:inline">
            Central Bank of the Republic of Turkey
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-500">Live · EVDS</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ReserveChart daily={dailyRecent} weekly={weeklyRecent} monthly={monthlyRecent} />
        <BiggestChanges series={weeklyRecent} granularity="weekly" />
        <HistoricalChart weekly={weekly} monthly={monthly} />
        <GuidottiGreenspan weekly={weekly} />
      </div>

      <footer className="border-t border-[#1e2d3d] px-6 py-4 text-center text-xs text-slate-600 mt-8">
        Data sourced from CBRT EVDS · Not financial advice
      </footer>
    </main>
  );
}
