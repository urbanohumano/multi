"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useWallet } from "@/lib/WalletContext";
import { COUPONS } from "@/lib/coupons";
import CouponCard from "@/components/CouponCard";

export default function WalletPage() {
  const { saved, used, ready } = useWallet();
  const [tab, setTab] = useState<"guardados" | "canjeados">("guardados");

  const savedCoupons = useMemo(
    () =>
      saved
        .map((id) => COUPONS.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [saved]
  );

  const usedCoupons = useMemo(
    () =>
      used
        .map((id) => COUPONS.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [used]
  );

  const potentialSaving = savedCoupons.reduce(
    (sum, c) => sum + c.estimatedSaving,
    0
  );
  const realizedSaving = usedCoupons.reduce(
    (sum, c) => sum + c.estimatedSaving,
    0
  );

  const list = tab === "guardados" ? savedCoupons : usedCoupons;

  return (
    <div>
      <header className="bg-gradient-to-br from-brand-500 to-brand-700 px-4 pb-6 pt-6 text-white">
        <h1 className="text-xl font-extrabold">🎟️ Mi cartera</h1>
        <p className="text-xs text-white/80">Tus cupones de Valencia</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat value={ready ? String(saved.length) : "—"} label="Guardados" />
          <Stat value={ready ? String(used.length) : "—"} label="Canjeados" />
          <Stat
            value={ready ? `${realizedSaving.toFixed(0)}€` : "—"}
            label="Ahorrado"
          />
        </div>
      </header>

      {ready && potentialSaving > 0 && tab === "guardados" && (
        <div className="mx-4 mt-4 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          💡 Si canjeas tus cupones guardados podrías ahorrar hasta{" "}
          <span className="font-bold">{potentialSaving.toFixed(0)}€</span>.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 px-4 py-4">
        <TabButton active={tab === "guardados"} onClick={() => setTab("guardados")}>
          ❤️ Guardados {ready ? `(${saved.length})` : ""}
        </TabButton>
        <TabButton active={tab === "canjeados"} onClick={() => setTab("canjeados")}>
          ✅ Canjeados {ready ? `(${used.length})` : ""}
        </TabButton>
      </div>

      {!ready ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">Cargando…</p>
      ) : list.length === 0 ? (
        <Empty tab={tab} />
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          {list.map((c) => (
            <CouponCard key={c.id} coupon={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-white/15 px-2 py-2.5 text-center backdrop-blur">
      <p className="text-lg font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-white/80">{label}</p>
    </div>
  );
}

function TabButton({
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
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ tab }: { tab: "guardados" | "canjeados" }) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-5xl">{tab === "guardados" ? "🤍" : "🎫"}</p>
      <p className="mt-3 text-sm font-medium text-slate-600">
        {tab === "guardados"
          ? "Aún no has guardado cupones."
          : "Aún no has canjeado ningún cupón."}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Explora las ofertas de Valencia y guárdalas aquí.
      </p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white"
      >
        Explorar cupones
      </Link>
    </div>
  );
}
