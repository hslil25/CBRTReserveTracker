import ReserveChart from "@/components/ReserveChart";
import BiggestChanges from "@/components/BiggestChanges";
import HistoricalChart from "@/components/HistoricalChart";
import GuidottiGreenspan from "@/components/GuidottiGreenspan";
import ReserveDecomposition from "@/components/ReserveDecomposition";
import LiquidReserves from "@/components/LiquidReserves";
import { fmtNum } from "@/lib/reserves";
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
  const { daily, weekly, monthly, gold, swaps } = await getReserveSeries();

  const dailyRecent = sliceLastYears(daily, 3);
  const weeklyRecent = sliceLastYears(weekly, 3);
  const monthlyRecent = sliceLastYears(monthly, 3);

  const last = daily[daily.length - 1];
  const prevWeek = daily[daily.length - 6] ?? daily[0];
  const asOf = new Date(last.date).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const kpis: { label: string; value: number; delta: number; note: string }[] = [
    {
      label: "Swap hariç net rezerv",
      value: last.net_excl_swap,
      delta: last.net_excl_swap - prevWeek.net_excl_swap,
      note: "Swaplar ve Hazine dövizi hariç",
    },
    {
      label: "Net döviz pozisyonu",
      value: last.net_incl_swap,
      delta: last.net_incl_swap - prevWeek.net_incl_swap,
      note: "Dış varlıklar − toplam döviz yükümlülükleri",
    },
    {
      label: "Brüt rezerv",
      value: last.gross,
      delta: weekly[weekly.length - 1].gross - weekly[weekly.length - 2].gross,
      note: `Haftalık, ${weekly[weekly.length - 1].date.split("-").reverse().join(".")} itibarıyla`,
    },
  ];

  return (
    <main className="min-h-screen bg-[#080b10] text-slate-200">
      <header className="border-b border-[#1a2433] bg-[#080b10]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <span className="text-xs font-bold text-[#080b10]">₺</span>
            </div>
            <div className="leading-tight">
              <p className="font-semibold text-slate-100 text-sm tracking-tight">TCMB Rezerv Takip</p>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Türkiye Cumhuriyet Merkez Bankası
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Son veri: {asOf}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <section>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-50 tracking-tight">
            Döviz Rezervleri
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            TCMB analitik bilançosundan günlük net döviz pozisyonu, swaplardan arındırılmış net rezerv
            ve brüt rezervler. Değerler milyar ABD doları.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="bg-[#0d131c] border border-[#1a2433] rounded-2xl px-5 py-4"
            >
              <p className="text-xs font-medium text-slate-400">{k.label}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-semibold text-slate-50 tracking-tight">
                  {fmtNum(k.value, 1)}
                </span>
                <span className="text-xs text-slate-500">mlr $</span>
                <span
                  className={`ml-auto whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full ${
                    k.delta >= 0
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {k.delta >= 0 ? "+" : "−"}
                  {fmtNum(Math.abs(k.delta), 1)} 1H
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{k.note}</p>
            </div>
          ))}
        </section>

        <ReserveChart daily={dailyRecent} weekly={weeklyRecent} monthly={monthlyRecent} />
        <ReserveDecomposition gold={gold} />
        <LiquidReserves gold={gold} swaps={swaps} />
        <BiggestChanges series={weeklyRecent} granularity="weekly" />
        <HistoricalChart weekly={weekly} monthly={monthly} />
        <GuidottiGreenspan weekly={weekly} />
      </div>

      <footer className="border-t border-[#1a2433] mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row justify-between gap-2 text-xs text-slate-500">
          <span>Kaynak: TCMB EVDS — analitik bilanço, haftalık rezervler, TCMB swap stokları, rezerv şablonu, BIST altın fiyatları. Saatlik güncellenir.</span>
          <span>Yatırım tavsiyesi değildir.</span>
        </div>
      </footer>
    </main>
  );
}
