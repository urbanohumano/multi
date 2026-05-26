export type CategoryId =
  | "restauracion"
  | "cafeterias"
  | "moda"
  | "belleza"
  | "ocio"
  | "supermercado"
  | "deporte"
  | "salud"
  | "hogar"
  | "tecnologia";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  color: string; // tailwind gradient classes
}

export type DiscountType = "porcentaje" | "2x1" | "fijo" | "regalo";

export interface Coupon {
  id: string;
  title: string;
  business: string;
  category: CategoryId;
  neighborhood: string;
  address: string;
  discountLabel: string; // e.g. "-30%", "2x1", "5€"
  discountType: DiscountType;
  discountValue: number; // % off or € off, used for sorting/filtering
  estimatedSaving: number; // € estimated saving per use
  description: string;
  terms: string;
  validUntil: string; // ISO date
  code: string;
  emoji: string;
  rating: number; // 0-5
  distanceKm: number;
  featured?: boolean;
}
