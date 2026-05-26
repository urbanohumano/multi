import type { Category, CategoryId } from "./types";

export const CATEGORIES: Category[] = [
  { id: "restauracion", label: "Restauración", emoji: "🍽️", color: "from-orange-400 to-red-500" },
  { id: "cafeterias", label: "Cafeterías", emoji: "☕", color: "from-amber-400 to-amber-600" },
  { id: "moda", label: "Moda", emoji: "👗", color: "from-pink-400 to-fuchsia-500" },
  { id: "belleza", label: "Belleza", emoji: "💅", color: "from-rose-400 to-pink-500" },
  { id: "ocio", label: "Ocio", emoji: "🎭", color: "from-violet-400 to-purple-600" },
  { id: "supermercado", label: "Supermercado", emoji: "🛒", color: "from-green-400 to-emerald-600" },
  { id: "deporte", label: "Deporte", emoji: "🏋️", color: "from-cyan-400 to-blue-500" },
  { id: "salud", label: "Salud", emoji: "💊", color: "from-teal-400 to-emerald-500" },
  { id: "hogar", label: "Hogar", emoji: "🏠", color: "from-yellow-400 to-orange-500" },
  { id: "tecnologia", label: "Tecnología", emoji: "📱", color: "from-slate-400 to-slate-600" },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: CategoryId): Category {
  return byId.get(id) ?? CATEGORIES[0];
}
