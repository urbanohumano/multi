import type { Category, CategoryId } from "./types";

export const CATEGORIES: Category[] = [
  { id: "restauracion", label: "Restauración", emoji: "🍽️", color: "from-orange-400 to-red-500", pin: "#ef4444" },
  { id: "cafeterias", label: "Cafeterías", emoji: "☕", color: "from-amber-400 to-amber-600", pin: "#d97706" },
  { id: "moda", label: "Moda", emoji: "👗", color: "from-pink-400 to-fuchsia-500", pin: "#d946ef" },
  { id: "belleza", label: "Belleza", emoji: "💅", color: "from-rose-400 to-pink-500", pin: "#f43f5e" },
  { id: "ocio", label: "Ocio", emoji: "🎭", color: "from-violet-400 to-purple-600", pin: "#8b5cf6" },
  { id: "supermercado", label: "Supermercado", emoji: "🛒", color: "from-green-400 to-emerald-600", pin: "#16a34a" },
  { id: "deporte", label: "Deporte", emoji: "🏋️", color: "from-cyan-400 to-blue-500", pin: "#0ea5e9" },
  { id: "salud", label: "Salud", emoji: "💊", color: "from-teal-400 to-emerald-500", pin: "#14b8a6" },
  { id: "hogar", label: "Hogar", emoji: "🏠", color: "from-yellow-400 to-orange-500", pin: "#f59e0b" },
  { id: "tecnologia", label: "Tecnología", emoji: "📱", color: "from-slate-400 to-slate-600", pin: "#64748b" },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: CategoryId): Category {
  return byId.get(id) ?? CATEGORIES[0];
}
