'use client';

import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Cell,
} from "recharts";
import { useMemo, useState } from "react";
import { GoldWeeklyPoint } from "@/lib/types";
import { fmtBn, fmtDay } from "@/lib/reserves";
import Segmented from "@/components/Segmented";

type Basis = "net" | "gross";
type Preset = "4W" | "3M" | "6M" | "YTD" | "1Y" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  "4W": "4H",
  "3M": "3A",
  "6M": "6A",
  YTD: "Yılbaşı",
  "1Y": "1Y",
  custom: "Özel",
};

const PRESET_MONTHS: Record<Exclude<Preset, "custom">, number> = {
  "4W": 1,
  "3M": 3,
  "6M": 6,
  YTD: -1,
  "1Y": 12,
};

interface Component {
  key: keyof GoldWeeklyPoint["c"];
  label: string;
  color: string;
  note: string;
}

const COMPONENTS: Record<Basis, Component[]> = {
  net: [
    {
      key: "goldPriceNet",
      label: "Altın fiyat etkisi",
      color: "#eab308",
      note: "TCMB'nin net altın pozisyonunun (varlıklar eksi bankalara borçlu olunan altın) dolar bazlı altın fiyatındaki değişimle yeniden değerlenmesi.",
    },
    {
      key: "netFlows",
      label: "Döviz satışı ve diğer akışlar",
      color: "#38bdf8",
      note: "Geri kalan her şey: TCMB döviz satış/alımları, Hazine'nin döviz alımları, ihracatçı reeskont geri ödemeleri ve dolar dışı para birimlerinin değer değişimi.",
    },
  ],
  gross: [
    {
      key: "goldPriceGross",
      label: "Altın fiyat etkisi",
      color: "#eab308",
      note: "Tüm altın varlıklarının dolar bazlı altın fiyatındaki değişimle yeniden değerlenmesi.",
    },
    {
      key: "goldQty",
      label: "Altın miktarı değişimi",
      color: "#f97316",
      note: "Alınan, satılan, swaplanan ya da bankalarca yatırılan altın; dönem fiyatıyla değerlenmiş.",
    },
    {
      key: "fx",
      label: "Döviz rezervi değişimi",
      color: "#38bdf8",
      note: "Altın hariç döviz rezervlerindeki değişim: satışlar, swaplar, banka ve Hazine mevduatları, borçlanma.",
    },
  ],
};

const LEVEL_LABEL: Record<Basis, string> = {
  net: "Swap hariç net rezerv",
  gross: "Brüt rezerv",
};

function level(p: GoldWeeklyPoint, basis: Basis): number {
  return basis === "net" ? p.netExclSwap : p.gross;
}

function startIndexFor(series: GoldWeeklyPoint[], preset: Exclude<Preset, "custom">): number {
  const last = series[series.length - 1].date;
  const months = PRESET_MONTHS[preset];
  let cutoff: string;
  if (months === -1) {
    cutoff = `${Number(last.slice(0, 4)) - 1}-12-31`;
  } else {
    const d = new Date(last);
    d.setMonth(d.getMonth() - months);
    cutoff = d.toISOString().slice(0, 10);
  }
  let idx = 0;
  for (let i = 0; i < series.length; i++) if (series[i].date <= cutoff) idx = i;
  return idx;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: Record<string, unknown>; name?: string; value?: number; color?: string }[];
  label?: string;
}

function WaterfallTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { name: string; delta: number; isLevel: boolean };
  return (
    <div className="bg-[#0f1621] border border-[#243246] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{p.name}</p>
      <p className="text-slate-100 font-semibold">
        {p.isLevel ? fmtBn(p.delta) : fmtBn(p.delta, true)} mlr $
      </p>
    </div>
  );
}

function WeeklyTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="bg-[#0f1621] border border-[#243246] rounded-lg px-3 py-2 text-xs shadow-xl min-w-[180px]">
      <p className="text-slate-400 mb-1.5">{fmtDay(label)} ile biten hafta</p>
      {payload.map((e) => (
        <p key={e.name} className="flex justify-between gap-4">
          <span style={{ color: e.color }}>{e.name}</span>
          <span className="text-slate-100">{fmtBn(e.value ?? 0, true)}</span>
        </p>
      ))}
    </div>
  );
}

export default function ReserveDecomposition({ gold }: { gold: GoldWeeklyPoint[] }) {
  const [basis, setBasis] = useState<Basis>("net");
  const [preset, setPreset] = useState<Preset>("3M");
  const [customStart, setCustomStart] = useState(gold[startIndexFor(gold, "3M")].date);
  const [customEnd, setCustomEnd] = useState(gold[gold.length - 1].date);

  const [startIdx, endIdx] = useMemo(() => {
    if (preset !== "custom") return [startIndexFor(gold, preset), gold.length - 1];
    const s = gold.findIndex((p) => p.date === customStart);
    const e = gold.findIndex((p) => p.date === customEnd);
    return s <= e ? [s, e] : [e, s];
  }, [gold, preset, customStart, customEnd]);

  const components = COMPONENTS[basis];
  const start = gold[startIdx];
  const end = gold[endIdx];
  const weeks = gold.slice(startIdx + 1, endIdx + 1);

  const totals = components.map((c) => ({
    ...c,
    value: weeks.reduce((sum, w) => sum + w.c[c.key], 0),
  }));
  const totalChange = level(end, basis) - level(start, basis);

  const waterfall = useMemo(() => {
    const rows: { name: string; range: [number, number]; delta: number; color: string; isLevel: boolean }[] = [];
    const s = level(start, basis);
    rows.push({ name: fmtDay(start.date), range: [0, s], delta: s, color: "#475569", isLevel: true });
    let running = s;
    for (const t of totals) {
      rows.push({
        name: t.label,
        range: [running, running + t.value],
        delta: t.value,
        color: t.color,
        isLevel: false,
      });
      running += t.value;
    }
    const e = level(end, basis);
    rows.push({ name: fmtDay(end.date), range: [0, e], delta: e, color: "#64748b", isLevel: true });
    return rows;
  }, [start, end, basis, totals]);

  const weeklyRows = useMemo(
    () =>
      weeks.map((w) => {
        const row: Record<string, number | string> = { date: w.date };
        for (const c of components) row[c.label] = parseFloat(w.c[c.key].toFixed(2));
        row.Total = parseFloat(components.reduce((s, c) => s + w.c[c.key], 0).toFixed(2));
        return row;
      }),
    [weeks, components]
  );

  const biggest = [...totals].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const verb = totalChange < 0 ? "düştü" : "yükseldi";
  const absTotalShare = totals.reduce((s, t) => s + Math.abs(t.value), 0) || 1;

  const dateOptions = gold.slice(-260).map((p) => p.date);

  return (
    <section className="bg-[#0d131c] border border-[#1a2433] rounded-2xl p-5 sm:p-7">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-slate-100 text-base font-semibold tracking-tight">
            Rezervleri ne hareket ettirdi?
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
            Rezervlerdeki değişimi altın fiyatı etkisi ve diğer kalemlere ayırır. Haftalık veri,
            milyar $.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Segmented
            options={[
              { value: "net", label: "Swap hariç net" },
              { value: "gross", label: "Brüt" },
            ]}
            value={basis}
            onChange={setBasis}
          />
          <Segmented
            options={(["4W", "3M", "6M", "YTD", "1Y", "custom"] as Preset[]).map((p) => ({
              value: p,
              label: PRESET_LABELS[p],
            }))}
            value={preset}
            onChange={setPreset}
          />
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 mb-5 text-xs text-slate-400">
          <span>Başlangıç</span>
          <select
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-[#0a0f16] border border-[#1a2433] rounded-md px-2 py-1.5 text-slate-200"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
          <span>Bitiş</span>
          <select
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-[#0a0f16] border border-[#1a2433] rounded-md px-2 py-1.5 text-slate-200"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-[#0a0f16] border border-[#1a2433] rounded-xl px-4 py-3 mb-6 text-sm text-slate-300">
        {fmtDay(start.date)} ile {fmtDay(end.date)} arasında {LEVEL_LABEL[basis].toLocaleLowerCase("tr-TR")}{" "}
        <span className="font-semibold text-slate-50">{fmtBn(Math.abs(totalChange))} mlr $</span>{" "}
        {verb} ({fmtBn(level(start, basis))} → {fmtBn(level(end, basis))}). En büyük etken{" "}
        <span style={{ color: biggest.color }} className="font-medium">
          {biggest.label.toLocaleLowerCase("tr-TR")}
        </span>{" "}
        oldu: {fmtBn(biggest.value, true)} mlr $.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <p className="text-xs font-medium text-slate-400 mb-2">Köprü</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={waterfall} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1a2433" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
              <ReferenceLine y={0} stroke="#475569" />
              <Tooltip content={<WaterfallTip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
              <Bar dataKey="range" radius={[4, 4, 4, 4]} isAnimationActive={false}>
                {waterfall.map((r) => (
                  <Cell key={r.name} fill={r.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-3">
          <p className="text-xs font-medium text-slate-400">Katkı</p>
          {totals.map((t) => (
            <div key={t.key} className="bg-[#0a0f16] border border-[#1a2433] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                  {t.label}
                </span>
                <span
                  className={`text-sm font-semibold ${t.value < 0 ? "text-rose-400" : "text-emerald-400"}`}
                >
                  {fmtBn(t.value, true)}
                </span>
              </div>
              <div className="h-1.5 bg-[#1a2433] rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(Math.abs(t.value) / absTotalShare) * 100}%`,
                    backgroundColor: t.color,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">{t.note}</p>
            </div>
          ))}
          <div className="flex items-center justify-between px-1 text-sm">
            <span className="text-slate-400">Toplam değişim</span>
            <span className="font-semibold text-slate-50">{fmtBn(totalChange, true)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs font-medium text-slate-400 mt-8 mb-2">Hafta hafta</p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={weeklyRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
          <CartesianGrid stroke="#1a2433" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) =>
              new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })
            }
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
          <ReferenceLine y={0} stroke="#475569" />
          <Tooltip content={<WeeklyTip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
          <Legend verticalAlign="top" align="right" height={28} iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
          {components.map((c) => (
            <Bar key={c.key} dataKey={c.label} stackId="a" fill={c.color} isAnimationActive={false} />
          ))}
          <Line
            dataKey="Total"
            name="Toplam değişim"
            stroke="#e2e8f0"
            strokeWidth={1.5}
            dot={{ r: 2, fill: "#e2e8f0" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-slate-500 mt-4 pt-4 border-t border-[#1a2433]">
        Yöntem: Altın miktarı (ons) haftalık altın rezervinin (TP.AB.C1) BIST altın fiyatına (USD/ons)
        bölünmesiyle bulunur. Fiyat etkisi = önceki haftanın ons miktarı × haftalık fiyat değişimi. Net
        rezervde önce bankalara borçlu olunan altın (TCMB haftalık vaziyet) düşülür. Haftalık rakamlar
        değerleme zamanlamasından kaynaklı ±%1–2 gürültü taşır; uzun dönemlerde bu gürültü birbirini götürür.
      </p>
    </section>
  );
}
