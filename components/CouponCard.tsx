import Link from "next/link";
import type { Coupon } from "@/lib/types";
import { getCategory } from "@/lib/categories";
import SaveButton from "./SaveButton";

export default function CouponCard({ coupon }: { coupon: Coupon }) {
  const cat = getCategory(coupon.category);

  return (
    <Link
      href={`/cupon/${coupon.id}`}
      className="group block overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className={`relative flex h-28 items-center justify-center bg-gradient-to-br ${cat.color}`}
      >
        <span className="text-5xl drop-shadow-sm">{coupon.emoji}</span>
        <div className="absolute left-3 top-3 rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          {cat.emoji} {cat.label}
        </div>
        <div className="absolute right-2 top-2">
          <SaveButton id={coupon.id} />
        </div>
        <div className="absolute -bottom-3 left-3 rounded-xl bg-white px-3 py-1.5 text-lg font-extrabold text-brand-600 shadow-md">
          {coupon.discountLabel}
        </div>
      </div>

      <div className="px-3 pb-3 pt-5">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">
          {coupon.title}
        </h3>
        <p className="mt-1 text-xs font-medium text-slate-500">{coupon.business}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            📍 {coupon.neighborhood}
          </span>
          <span className="inline-flex items-center gap-1">
            ⭐ {coupon.rating.toFixed(1)}
          </span>
        </div>
      </div>
    </Link>
  );
}
