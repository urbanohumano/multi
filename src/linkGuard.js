'use strict';

/**
 * Vínculo no permite compartir enlaces: la conversación vive dentro de la red
 * y la revista impresa no puede "hacer clic". Este módulo detecta URLs y
 * dominios en cualquier texto enviado por los usuarios, incluyendo intentos
 * habituales de disimularlos.
 */

const TLDS =
  'com|net|org|info|biz|io|co|me|app|dev|xyz|site|online|store|blog|club|live|news|page|link|ly|gg|to|cc|tv|fm|ai|es|mx|ar|cl|pe|uy|ve|bo|ec|us|uk|fr|de|it|pt|br|ca|au|nz|jp|cn|ru|in|edu|gov|mil|int|eu|cat|gal|social|email|chat|zip|mov';

const PATTERNS = [
  // Protocolo explícito: https://..., ftp://..., o "://" suelto.
  /\b[a-z][a-z0-9+.-]*:\/\//i,
  // Esquemas sin barras que abren recursos externos.
  /\b(?:mailto|tel|magnet|data|javascript):/i,
  // www. o variantes con espacios/puntuación intercalados: "www . ejemplo . com"
  /w\s*w\s*w\s*[.。]\s*\S/i,
  // Dominio con TLD conocido, admitiendo espacios alrededor del punto y
  // sustitutos comunes del punto: "ejemplo (punto) com", "ejemplo[.]com", "ejemplo dot com".
  new RegExp(
    String.raw`\b[a-z0-9áéíóúñ-]{2,}\s*(?:[.。]|\[\s*\.\s*\]|\(\s*\.\s*\)|\s\(?\s*(?:punto|dot)\s*\)?\s)\s*(?:${TLDS})\b`,
    'i'
  ),
  // Puerto o ruta pegados a algo con pinta de host: "midominio:8080/pagina"
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{2,5})?\/[^\s]*/i,
  // Direcciones IP (con o sin puerto/ruta).
  /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{2,5})?\b/,
];

/** Devuelve true si el texto contiene un enlace o algo que lo aparenta. */
function containsLink(text) {
  if (!text) return false;
  const normalized = String(text).normalize('NFKC');
  return PATTERNS.some((re) => re.test(normalized));
}

/**
 * Revisa una lista de campos de texto y devuelve un mensaje de error si
 * alguno contiene un enlace, o null si todo está limpio.
 */
function rejectLinks(...fields) {
  for (const field of fields) {
    if (containsLink(field)) {
      return 'En Vínculo no se pueden compartir enlaces ni direcciones web. Cuenta lo que quieras con tus propias palabras.';
    }
  }
  return null;
}

module.exports = { containsLink, rejectLinks };
