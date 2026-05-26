import Link from "next/link";
import { COUPONS, NEIGHBORHOODS } from "@/lib/coupons";
import { getCategory } from "@/lib/categories";

export default function CercaPage() {
  const nearest = [...COUPONS]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 6);

  const byNeighborhood = NEIGHBORHOODS.map((n) => ({
    name: n,
    coupons: COUPONS.filter((c) => c.neighborhood === n),
  })).filter((g) => g.coupons.length > 0);

  return (
    <div>
      <header className="bg-gradient-to-br from-brand-500 to-brand-700 px-4 pb-6 pt-6 text-white">
        <h1 className="text-xl font-extrabold">📍 Cerca de ti</h1>
        <p className="text-xs text-white/80">
          Ofertas en tu zona de Valencia, ordenadas por distancia
        </p>
      </header>

      {/* Nearest */}
      <section className="px-4 pt-4">
        <h2 className="mb-2 text-sm font-bold text-slate-800">A un paseo</h2>
        <div className="space-y-2">
          {nearest.map((c) => {
            const cat = getCategory(c.category);
            return (
              <Link
                key={c.id}
                href={`/cupon/${c.id}`}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-2xl ${cat.color}`}
                >
                  {c.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {c.business}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {c.neighborhood} · {c.title}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-extrabold text-brand-600">
                    {c.discountLabel}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    🚶 {c.distanceKm.toFixed(1)} km
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* By neighborhood */}
      <section className="px-4 py-5">
        <h2 className="mb-2 text-sm font-bold text-slate-800">Por barrios</h2>
        <div className="space-y-3">
          {byNeighborhood.map((g) => (
            <Link
              key={g.name}
              href={`/?barrio=${encodeURIComponent(g.name)}`}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
            >
              <span className="font-semibold text-slate-800">{g.name}</span>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                {g.coupons.length}{" "}
                {g.coupons.length === 1 ? "cupón" : "cupones"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
