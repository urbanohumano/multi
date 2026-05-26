import type { Coupon } from "./types";

export const VALENCIA_CENTER: [number, number] = [39.4699, -0.3763];

// Centros aproximados de cada barrio de València.
export const NEIGHBORHOOD_COORDS: Record<string, [number, number]> = {
  Russafa: [39.4585, -0.3735],
  "El Carme": [39.4775, -0.3805],
  "Ciutat Vella": [39.4735, -0.3785],
  "El Cabanyal": [39.4665, -0.329],
  Benimaclet: [39.487, -0.356],
  Extramurs: [39.4665, -0.387],
  "L'Eixample": [39.4625, -0.369],
  Campanar: [39.483, -0.401],
  Patraix: [39.459, -0.396],
  Algirós: [39.476, -0.345],
  "El Pla del Real": [39.472, -0.362],
};

// Desplazamiento determinista (~±300 m) a partir del id para que los
// marcadores del mismo barrio no se solapen.
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getCoords(coupon: Coupon): [number, number] {
  const base = NEIGHBORHOOD_COORDS[coupon.neighborhood] ?? VALENCIA_CENTER;
  const h = hash(coupon.id);
  const offLat = (((h & 0xffff) / 0xffff) - 0.5) * 0.006;
  const offLng = ((((h >>> 16) & 0xffff) / 0xffff) - 0.5) * 0.006;
  return [base[0] + offLat, base[1] + offLng];
}
