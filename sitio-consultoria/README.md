# Sitio de consultoría — Guía de campo Nº 01

Sitio standalone (HTML + CSS + JS, sin dependencias ni build) para venderte como
**consultor de IA & Software**. Dirección de diseño: **editorial / dossier**.

Construido siguiendo la checklist de las 8 cosas que separan un sitio de 10K de
uno de 200: punto de vista propio, tipografía con criterio (Fraunces · Newsreader
· Space Mono), paleta sobria de 5 colores con un único acento burdeos, jerarquía
con aire, una firma visual propia (la lámina «Fig. 1»), micro-interacciones
discretas, móvil **diseñado** (no encogido) y lo invisible: HTML semántico,
contraste AA, foco de teclado, `prefers-reduced-motion`, meta tags y carga rápida.

## Cómo verlo en local

```bash
cd sitio-consultoria
python3 -m http.server 8080
# abre http://localhost:8080
```

(O simplemente abre `index.html` en el navegador.)

## Qué reemplazar (datos de ejemplo)

Busca el texto entre corchetes y sustitúyelo:

| Marcador          | Dónde                                  | Qué poner                          |
|-------------------|----------------------------------------|------------------------------------|
| `[TU NOMBRE]`     | título, masthead, sobre mí, pie        | Tu nombre o marca                  |
| `[TU EMAIL]`      | sección de contacto, meta autor        | Tu correo                          |
| `[TU CALENDARIO]` | botón «Reservar una llamada»           | Enlace de Calendly / Cal.com       |
| Casos (1–3)       | sección **Casos seleccionados**        | Resultados y cifras reales         |
| Cita / testimonio | bloque sobre fondo tinta               | Un testimonio real + autor         |
| Foto              | bloque «Sobre mí» (`.about__portrait`) | Una `<img>` con tu retrato         |

### Añadir tu foto

Sustituye el bloque `.about__portrait` en `index.html` por:

```html
<img class="about__portrait" src="assets/retrato.jpg"
     alt="Retrato de [TU NOMBRE]" width="800" height="1000" />
```

## Personalizar el diseño

Todos los colores y tipografías están como tokens al principio de `styles.css`
(bloque `:root`). Cambia `--accent` para otro acento, o las fuentes en `--display`
/ `--body` / `--mono`.
