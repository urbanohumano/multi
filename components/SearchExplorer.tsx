"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { COUPONS, NEIGHBORHOODS } from "@/lib/coupons";
import { CATEGORIES } from "@/lib/categories";
import type { CategoryId } from "@/lib/types";
import CouponCard from "./CouponCard";

type SortKey = "relevancia" | "descuento" | "cerca" | "valorados";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "relevancia", label: "Relevancia" },
  { key: "descuento", label: "Mayor descuento" },
  { key: "cerca", label: "Más cerca" },
  { key: "valorados", label: "Mejor valorados" },
];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function SearchExplorer() {
  const searchParams = useSearchParams();
  const initialBarrio = searchParams.get("barrio") ?? "";

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [neighborhood, setNeighborhood] = useState<string>(
    NEIGHBORHOODS.includes(initialBarrio) ? initialBarrio : ""
  );
  const [sort, setSort] = useState<SortKey>("relevancia");

  const results = useMemo(() => {
    const q = normalize(query.trim());

    let list = COUPONS.filter((c) => {
      if (category && c.category !== category) return false;
      if (neighborhood && c.neighborhood !== neighborhood) return false;
      if (!q) return true;
      const haystack = normalize(
        `${c.title} ${c.business} ${c.neighborhood} ${c.description} ${c.discountLabel}`
      );
      const catLabel = normalize(
        CATEGORIES.find((x) => x.id === c.category)?.label ?? ""
      );
      return haystack.includes(q) || catLabel.includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "descuento":
          return b.discountValue - a.discountValue;
        case "cerca":
          return a.distanceKm - b.distanceKm;
        case "valorados":
          return b.rating - a.rating;
        default:
          return (
            Number(b.featured ?? false) - Number(a.featured ?? false) ||
            b.rating - a.rating
          );
      }
    });

    return list;
  }, [query, category, neighborhood, sort]);

  const activeFilters =
    (category ? 1 : 0) + (neighborhood ? 1 : 0) + (query ? 1 : 0);

  return (
    <div>
      {/* Header */}
      <header className="bg-gradient-to-br from-brand-500 to-brand-700 px-4 pb-5 pt-6 text-white">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎟️</span>
          <div>
            <h1 className="text-xl font-extrabold leading-none">ValenCupón</h1>
            <p className="text-xs text-white/80">Cupones de Valencia · València</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-3 shadow-md">
          <span className="text-slate-400">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
            placeholder="Busca comercios, ofertas o barrios…"
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="text-slate-400"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Category chips */}
      <div className="no-scrollbar -mb-px flex gap-2 overflow-x-auto px-4 py-3">
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

      {/* Neighborhood + sort */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <select
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <option value="">📍 Todos los barrios</option>
          {NEIGHBORHOODS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Results */}
      <div className="flex items-center justify-between px-4 pb-2 pt-1">
        <p className="text-sm font-semibold text-slate-700">
          {results.length} {results.length === 1 ? "cupón" : "cupones"}
        </p>
        {activeFilters > 0 && (
          <button
            onClick={() => {
              setQuery("");
              setCategory(null);
              setNeighborhood("");
            }}
            className="text-xs font-medium text-brand-600"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-4xl">🫥</p>
          <p className="mt-3 text-sm font-medium text-slate-600">
            No encontramos cupones con esos filtros.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Prueba con otra categoría o barrio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          {results.map((c) => (
            <CouponCard key={c.id} coupon={c} />
          ))}
        </div>
      )}
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
