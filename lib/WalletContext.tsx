"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SAVED_KEY = "valencupon:saved";
const USED_KEY = "valencupon:used";

interface WalletState {
  saved: string[];
  used: string[];
  isSaved: (id: string) => boolean;
  isUsed: (id: string) => boolean;
  toggleSave: (id: string) => void;
  markUsed: (id: string) => void;
  ready: boolean;
}

const WalletContext = createContext<WalletState | null>(null);

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSaved(readList(SAVED_KEY));
    setUsed(readList(USED_KEY));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  }, [saved, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(USED_KEY, JSON.stringify(used));
  }, [used, ready]);

  const toggleSave = useCallback((id: string) => {
    setSaved((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]
    );
  }, []);

  const markUsed = useCallback((id: string) => {
    setUsed((prev) => (prev.includes(id) ? prev : [id, ...prev]));
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      saved,
      used,
      isSaved: (id: string) => saved.includes(id),
      isUsed: (id: string) => used.includes(id),
      toggleSave,
      markUsed,
      ready,
    }),
    [saved, used, toggleSave, markUsed, ready]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet debe usarse dentro de WalletProvider");
  return ctx;
}
