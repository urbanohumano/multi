"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@/lib/WalletContext";
import type { Coupon } from "@/lib/types";

export default function RedeemPanel({ coupon }: { coupon: Coupon }) {
  const { isUsed, markUsed, ready } = useWallet();
  const [open, setOpen] = useState(false);
  const used = ready && isUsed(coupon.id);

  const payload = `VALENCUPON|${coupon.id}|${coupon.code}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          markUsed(coupon.id);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600 active:scale-[0.99]"
      >
        {used ? "🎫 Ver mi cupón canjeado" : "✨ Canjear cupón ahora"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-pop w-full max-w-md rounded-t-3xl bg-white p-6 text-center sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Muéstralo en {coupon.business}
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              {coupon.title}
            </h3>

            <div className="mx-auto mt-5 w-fit rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <QRCodeSVG value={payload} size={180} level="M" />
            </div>

            <div className="mt-5 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3">
              <p className="text-xs text-slate-500">Código de descuento</p>
              <p className="font-mono text-2xl font-extrabold tracking-widest text-brand-700">
                {coupon.code}
              </p>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Válido hasta el {formatDate(coupon.validUntil)}. El comercio
              escaneará el código para aplicar tu descuento.
            </p>

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Hecho
            </button>
          </div>
        </div>
      )}
    </>
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
