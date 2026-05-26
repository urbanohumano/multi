"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { COUPONS } from "@/lib/coupons";
import { CATEGORIES } from "@/lib/categories";
import type { CategoryId } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
      Cargando mapa…
    </div>
  ),
});

export default function MapaPage() {
  const [category, setCategory] = useState<CategoryId | null>(null);

  const coupons = useMemo(
    () => (category ? COUPONS.filter((c) => c.category === category) : COUPONS),
    [category]
  );

  return (
    <div className="-mb-24 flex flex-col" style={{ height: "calc(100dvh - 3.75rem)" }}>
      <div className="shrink-0 border-b border-slate-100 bg-white">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h1 className="text-base font-extrabold text-slate-900">
            🗺️ Mapa de cupones
          </h1>
          <span className="text-xs font-medium text-slate-500">
            {coupons.length} en el mapa
          </span>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 pt-1">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            Todas
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(category === c.id ? null : c.id)}
            >
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MapView coupons={coupons} />
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}
