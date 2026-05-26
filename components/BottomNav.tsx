"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/WalletContext";

const TABS = [
  { href: "/", label: "Explorar", icon: "🔍" },
  { href: "/cerca", label: "Cerca", icon: "📍" },
  { href: "/wallet", label: "Cartera", icon: "🎟️" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { saved, ready } = useWallet();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="grid grid-cols-3">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                active ? "text-brand-600" : "text-slate-400"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.href === "/wallet" && ready && saved.length > 0 && (
                <span className="absolute right-[22%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                  {saved.length}
                </span>
              )}
              {active && (
                <span className="absolute -top-px h-0.5 w-10 rounded-full bg-brand-500" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
