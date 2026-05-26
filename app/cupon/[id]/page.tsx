import Link from "next/link";
import { notFound } from "next/navigation";
import { COUPONS } from "@/lib/coupons";
import { getCategory } from "@/lib/categories";
import SaveButton from "@/components/SaveButton";
import RedeemPanel from "@/components/RedeemPanel";

export function generateStaticParams() {
  return COUPONS.map((c) => ({ id: c.id }));
}

export default async function CouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const coupon = COUPONS.find((c) => c.id === id);
  if (!coupon) notFound();

  const cat = getCategory(coupon.category);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${coupon.business}, ${coupon.address}, València`
  )}`;

  return (
    <div>
      {/* Hero */}
      <div
        className={`relative flex h-52 items-center justify-center bg-gradient-to-br ${cat.color}`}
      >
        <Link
          href="/"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-sm backdrop-blur"
          aria-label="Volver"
        >
          ←
        </Link>
        <div className="absolute right-3 top-3">
          <SaveButton id={coupon.id} />
        </div>
        <span className="text-7xl drop-shadow">{coupon.emoji}</span>
        <div className="absolute bottom-3 left-3 rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {cat.emoji} {cat.label}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold leading-tight text-slate-900">
              {coupon.title}
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {coupon.business}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-brand-50 px-3 py-2 text-center">
            <p className="text-lg font-extrabold leading-none text-brand-600">
              {coupon.discountLabel}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge>⭐ {coupon.rating.toFixed(1)}</Badge>
          <Badge>📍 {coupon.neighborhood}</Badge>
          <Badge>🚶 {coupon.distanceKm.toFixed(1)} km</Badge>
          <Badge>💰 Ahorras ~{coupon.estimatedSaving.toFixed(0)}€</Badge>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {coupon.description}
        </p>

        {/* Location */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <span className="text-xl">🗺️</span>
          <span className="flex-1">
            <span className="block font-medium text-slate-800">
              {coupon.address}
            </span>
            <span className="text-xs text-slate-500">
              {coupon.neighborhood}, València · Ver en mapa
            </span>
          </span>
          <span className="text-slate-400">↗</span>
        </a>

        {/* Terms */}
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Condiciones
          </p>
          <p className="mt-1 text-sm text-slate-600">{coupon.terms}</p>
          <p className="mt-2 text-xs text-slate-400">
            Válido hasta el {formatDate(coupon.validUntil)}
          </p>
        </div>
      </div>

      {/* Sticky actions */}
      <div className="sticky bottom-0 space-y-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
        <RedeemPanel coupon={coupon} />
        <SaveButton id={coupon.id} variant="full" />
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
      {children}
    </span>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
