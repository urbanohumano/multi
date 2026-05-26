"use client";

import { useWallet } from "@/lib/WalletContext";

export default function SaveButton({
  id,
  variant = "icon",
}: {
  id: string;
  variant?: "icon" | "full";
}) {
  const { isSaved, toggleSave, ready } = useWallet();
  const saved = ready && isSaved(id);

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={() => toggleSave(id)}
        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
          saved
            ? "border-brand-500 bg-brand-50 text-brand-700"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
        }`}
      >
        <span>{saved ? "❤️" : "🤍"}</span>
        {saved ? "Guardado en tu cartera" : "Guardar en cartera"}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={saved ? "Quitar de la cartera" : "Guardar en la cartera"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSave(id);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-sm backdrop-blur transition-transform active:scale-90"
    >
      {saved ? "❤️" : "🤍"}
    </button>
  );
}
