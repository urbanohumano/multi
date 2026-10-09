# GrapheneOS: dispositivos soportados, fechas de fin de soporte, Pixel 10/11 y alianza con Motorola (estado a 9 de octubre de 2026)

**Nota de método.** grapheneos.org, support.google.com, androidauthority.com, 9to5google.com, heise.de y motorolanews.com estaban bloqueados por el proxy de red de esta sesión. Para tener la fuente oficial leí el código fuente público del sitio web de GrapheneOS (repositorio `GrapheneOS/grapheneos.org` en GitHub). Ese repositorio genera directamente grapheneos.org y su último commit es del **2026-10-09 00:12 (UTC-4)**, así que el FAQ y la página de releases citados abajo coinciden con lo publicado hoy. Rutas: `static/faq.html` y `static/releases.html`. Para la prensa solo pude usar resúmenes de búsqueda, no los artículos completos, y lo señalo en cada caso.

- FAQ (fuente): https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html (publicado en https://grapheneos.org/faq)
- Releases (fuente): https://github.com/GrapheneOS/grapheneos.org/blob/main/static/releases.html (publicado en https://grapheneos.org/releases)

---

## 1. ¿Qué dispositivos aparecen hoy en grapheneos.org/faq#supported-devices y /releases? ¿Cuáles son de soporte extendido o están al final de su vida útil?

### Takeaway
A 9 de octubre de 2026, GrapheneOS tiene soporte oficial de producción para **21 dispositivos, todos Google Pixel**: del Pixel 6 al Pixel 10a, más el Pixel Fold y el Pixel Tablet. **No hay ningún Pixel 11 ni ningún móvil que no sea Pixel.** Ahora mismo no hay ningún dispositivo en "legacy extended support". Los Pixel 4 a 5a se retiraron en diciembre de 2025. El Pixel 6 y el 6 Pro llegan este mes (octubre de 2026) al fin de su garantía mínima de Google.

### Cited Findings
- Lista oficial de "official production support" en el FAQ, en el orden de la web: Pixel 10a (stallion), Pixel 10 Pro Fold (rango), Pixel 10 Pro XL (mustang), Pixel 10 Pro (blazer), Pixel 10 (frankel), Pixel 9a (tegu), Pixel 9 Pro Fold (comet), Pixel 9 Pro XL (komodo), Pixel 9 Pro (caiman), Pixel 9 (tokay), Pixel 8a (akita), Pixel 8 Pro (husky), Pixel 8 (shiba), Pixel Fold (felix), Pixel Tablet (tangorpro), Pixel 7a (lynx), Pixel 7 Pro (cheetah), Pixel 7 (panther), Pixel 6a (bluejay), Pixel 6 Pro (raven), Pixel 6 (oriole) — [FAQ #supported-devices (fuente, 2026-10-09)](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- El FAQ dice que las "extended support releases" se ofrecen "as a stopgap for users to transition to the far more secure current generation devices". Ningún dispositivo de la lista actual está marcado como legacy/extended — [FAQ #supported-devices](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- La release estable más reciente es **2026100600** (build de octubre de 2026, publicada el 2026-10-07, con el código de vendor de Pixel de octubre de 2026 y el parche de seguridad completo del 2026-10-01). Hay builds para: Pixel 6, 6 Pro, 6a, 7, 7 Pro, 7a, Tablet, Fold, 8, 8 Pro, 8a, 9, 9 Pro, 9 Pro XL, 9 Pro Fold, 9a, 10, 10 Pro, 10 Pro XL, 10 Pro Fold y 10a. Las notas de la versión preliminar de seguridad hablan ya de parches de **Android 17** — [releases.html (fuente)](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/releases.html); [commit ed23d59, 2026-10-07 "update Pixel vendor code to October 2026"](https://github.com/GrapheneOS/grapheneos.org/commit/ed23d59)
- El **2025-12-13** se quitaron de la página de releases los dispositivos que estaban en "legacy extended support": Pixel 5a, Pixel 5, Pixel 4a (5G), Pixel 4a, Pixel 4 XL y Pixel 4 — [commit 88a0d09](https://github.com/GrapheneOS/grapheneos.org/commit/88a0d09)
- El **2026-05-21** el instalador web dejó de aceptar barbet, redfin, bramble, sunfish, coral y flame (Pixel 5a, 5, 4a 5G, 4a, 4 XL y 4) — [commit 02b56ce](https://github.com/GrapheneOS/grapheneos.org/commit/02b56ce)
- Antecedente (2024): los Pixel de 5ª generación pasaron a "legacy extended support" el 2024-09-19 — [commit 1c80fb8](https://github.com/GrapheneOS/grapheneos.org/commit/1c80fb8)
- Dispositivos que el FAQ da como fin de vida (#which-legacy-devices): Pixel 5a, 5, 4a (5G), 4a, 4 XL, 4, 3a XL, 3a, 3 XL, 3, 2 XL, 2, Pixel XL, Pixel, Nexus 6P, 5X, 9 y 5, Samsung Galaxy S4. También las placas de desarrollo HiKey/HiKey 960 — [FAQ #which-legacy-devices](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- Política del FAQ (#device-lifetime): GrapheneOS solo puede dar actualizaciones de seguridad completas mientras el fabricante las publique. Después puede sacar "temporary extended support releases for harm reduction" que "cannot provide full security patches". Las actualizaciones oficiales para Pixel "typically end shortly after end of the minimum guaranteed update support… people shouldn't plan around [extra months] happening" — [FAQ #device-lifetime](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- Sobre el Pixel 6 en concreto: en el foro de Privacy Guides se comenta que el soporte se acaba en octubre de 2026. Swappa marca el Pixel 6/6 Pro como "Expiring now" (oct. 2026) y el Pixel 6a como "Short runway" (jul. 2027). Una respuesta en el foro de GrapheneOS (de un miembro de la comunidad, no del proyecto) dice que el soporte extendido era solo para dispositivos con menos de 5 años de actualizaciones — [Privacy Guides forum](https://discuss.privacyguides.net/t/pixel-6-pro-supports-drops-in-oct-2026/34619); [discuss.grapheneos.org hilo 32427](https://discuss.grapheneos.org/d/32427-pixel-6-support-until-oem-release); [discuss.grapheneos.org hilo 13444](https://discuss.grapheneos.org/d/13444-pixel-6-support-end-gos) (los tres solo vistos en resumen de búsqueda)

### Inferences
- Pixel 6 y 6 Pro: con la garantía de Google acabando en octubre de 2026 y la política del FAQ, lo esperable es que dejen de recibir parches completos en breve. Puede que haya algunas releases "extended", pero no se deben dar por hechas. **En ningún caso son una compra recomendable.**
- Pixel 6a (jul. 2027), Pixel 7/7 Pro (oct. 2027) y Pixel 7a/Fold/Tablet (mayo-jun. 2028) siguen soportados, pero ya no están en la lista de "recomendados" (ver sección 3).

### Gaps
- No encontré un anuncio oficial de GrapheneOS sobre qué hará exactamente con el Pixel 6/6 Pro después de octubre de 2026 (fin inmediato o algunos meses de extended support).

---

## 2. Fecha mínima de soporte garantizado por dispositivo

### Takeaway
Tabla oficial del FAQ (#device-lifetime), con fechas de fin de soporte mínimo del fabricante. Del Pixel 8 en adelante son **7 años**, y antes **5 años**. El dispositivo con soporte más largo es el **Pixel 10a (marzo de 2033)**.

### Cited Findings
Tabla del FAQ de GrapheneOS ("OEM minimum support end / length") — [FAQ #device-lifetime (fuente, 2026-10-09)](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html):

| Dispositivo (codename) | Fin soporte mínimo | Duración | ¿Recomendado por GrapheneOS? |
|---|---|---|---|
| Pixel 10a (stallion) | **marzo 2033** | 7 años | Sí |
| Pixel 10 Pro Fold (rango) | **octubre 2032** | 7 años | Sí |
| Pixel 10 Pro XL (mustang) | agosto 2032 | 7 años | Sí |
| Pixel 10 Pro (blazer) | agosto 2032 | 7 años | Sí |
| Pixel 10 (frankel) | agosto 2032 | 7 años | Sí |
| Pixel 9a (tegu) | abril 2032 | 7 años | Sí |
| Pixel 9 Pro Fold (comet) | agosto 2031 | 7 años | Sí |
| Pixel 9 Pro XL (komodo) | agosto 2031 | 7 años | Sí |
| Pixel 9 Pro (caiman) | agosto 2031 | 7 años | Sí |
| Pixel 9 (tokay) | agosto 2031 | 7 años | Sí |
| Pixel 8a (akita) | mayo 2031 | 7 años | Sí |
| Pixel 8 Pro (husky) | octubre 2030 | 7 años | Sí |
| Pixel 8 (shiba) | octubre 2030 | 7 años | Sí |
| Pixel Fold (felix) | junio 2028 | 5 años | No |
| Pixel Tablet (tangorpro) | junio 2028 | 5 años | No |
| Pixel 7a (lynx) | mayo 2028 | 5 años | No |
| Pixel 7 Pro (cheetah) | octubre 2027 | 5 años | No |
| Pixel 7 (panther) | octubre 2027 | 5 años | No |
| Pixel 6a (bluejay) | julio 2027 | 5 años | No |
| Pixel 6 Pro (raven) | **octubre 2026 (este mes)** | 5 años | No |
| Pixel 6 (oriole) | **octubre 2026 (este mes)** | 5 años | No |

- Los modelos Pixel 10 se añadieron a la tabla de soporte el 2025-12-26 — [commit 6a2c32c](https://github.com/GrapheneOS/grapheneos.org/commit/6a2c32c)
- Pixel 11 (fuera de la tabla porque GrapheneOS no lo soporta): Google le promete 7 años de software y de piezas de repuesto. Se vende desde ~20 de agosto de 2026 con Android 17 — [Smartprix](https://www.smartprix.com/bytes/pixel-11-phones-will-get-replacement-parts-for-seven-years-google-confirms/); [Droid-Life, 2026-08-20](https://www.droid-life.com/2026/08/20/your-pixel-11-gets-first-update-out-of-the-box/) (solo vistos en resumen de búsqueda)

### Inferences
- Para quien compre hoy, el Pixel 10a (hasta mar. 2033) y el Pixel 10/10 Pro/10 Pro XL (hasta ago. 2032) dan unos 6-6,5 años de vida útil restante con GrapheneOS. Un Pixel 8 o 8 Pro comprado ahora solo tiene unos 4 años (hasta oct. 2030).
- Las fechas son mínimos del fabricante (Google). GrapheneOS avisa de que el soporte suele acabar poco después de esa fecha.

### Gaps
- No pude abrir directamente la página de Google (support.google.com/pixelphone/answer/4457705) para contrastar las fechas. Las cito tal como aparecen en el FAQ de GrapheneOS.

---

## 3. ¿Tiene ya el Pixel 10 soporte completo? Retrasos y problemas (Google retira los device trees de AOSP en 2025) y cómo se resolvieron. ¿Qué pasa con el Pixel 11?

### Takeaway
**Sí.** Toda la serie Pixel 10 tiene soporte oficial de producción: el Pixel 10/Pro/Pro XL/Pro Fold desde el 12 de enero de 2026 y el Pixel 10a desde el 12 de mayo de 2026. El retraso vino de que Google, en junio de 2025 (Android 16), dejó de publicar en AOSP los device trees y los binarios de drivers de Pixel. GrapheneOS lo resolvió reescribiendo su herramienta *adevtool*: hubo builds experimentales a finales de noviembre de 2025 y la versión estable llegó en enero de 2026. **El Pixel 11 (agosto de 2026) NO tiene soporte.** GrapheneOS dice que Google le quitó la etiqueta de memoria por hardware (ARM MTE), que el proyecto considera imprescindible.

### Cited Findings
**Cambio de Google en AOSP (2025)**
- Junio de 2025: la publicación de Android 16 en AOSP salió sin los repositorios de hardware específicos de Pixel (device trees). Google confirmó que fue deliberado, pasó a usar el dispositivo virtual "Cuttlefish" como referencia y publicó el kernel con el historial aplanado. También dijo que "AOSP is NOT going away" — [9to5Google, 2025-06-12](https://9to5google.com/2025/06/12/android-open-source-project-pixel-change/); [Android Authority](https://www.androidauthority.com/google-not-killing-aosp-3566882/) (vistos en resumen de búsqueda)
- Las notas de noviembre de 2025 de GrapheneOS describen un rediseño de adevtool que "entirely replaces the small remnants of the Pixel device trees", para preparar los Pixel de 10ª generación sin usar device trees como referencia — (resumen de búsqueda que cita las [releases de GrapheneOS](https://grapheneos.org/releases))
- Android Authority publicó "Here's why the Pixel 10 could be the last truly privacy-friendly Pixel" — [Android Authority](https://www.androidauthority.com/pixel-10-last-privacy-friendly-pixel-3608548/) (solo título y resumen)

**Cronología del soporte Pixel 10 (del repositorio oficial)**
- 2025-11-25: dos releases experimentales independientes (2025112500 y 2025113000) para Pixel 10, 10 Pro, 10 Pro XL y 10 Pro Fold. Después, la release 2025112100 añadió "experimental support" — [commit 5a607bf](https://github.com/GrapheneOS/grapheneos.org/commit/5a607bf); [commit 5d58985 (aclaración, 2025-12-01)](https://github.com/GrapheneOS/grapheneos.org/commit/5d58985); [Privacy Guides, 2025-11-26](https://www.privacyguides.org/news/2025/11/26/grapheneos-now-has-experimental-support-for-pixel-10-series/)
- 2025-12-01: el soporte experimental del Pixel 10 aparece en la web — [commit b123808](https://github.com/GrapheneOS/grapheneos.org/commit/b123808)
- **2026-01-12: "stop marking Pixel 10 support as experimental"**, es decir, soporte de producción — [commit 78329dd](https://github.com/GrapheneOS/grapheneos.org/commit/78329dd)
- Pixel 10a: soporte experimental el 2026-03-20 (huella de verified boot añadida el 2026-03-24) y **"stop marking Pixel 10a as experimental" el 2026-05-12** — [commit 940ae96](https://github.com/GrapheneOS/grapheneos.org/commit/940ae96); [commit f786f8d](https://github.com/GrapheneOS/grapheneos.org/commit/f786f8d)
- Incidencia temporal: del 2026-05-06 al 2026-05-12 el instalador web instaló Alpha en lugar de Stable para rango/mustang/blazer/frankel ("temporarily use Alpha for regular 10th gen devices"), y luego se revirtió. En ese mismo periodo la actualización de Pixel de mayo de 2026 obligó a cancelar la release para Pixel 8a/9a, y además se corrigió un bug de corrupción de memoria del driver Wi-Fi Broadcom bcm4383. Que el bug afectara al Pixel 10 se precisó el 2026-06-21 — [commit 6f4424b (revert)](https://github.com/GrapheneOS/grapheneos.org/commit/6f4424b); [commit bffed6e](https://github.com/GrapheneOS/grapheneos.org/commit/bffed6e); [releases.html](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/releases.html)
- Correcciones del kernel del Pixel 10 en 2026 (en la DisplayPort y en CVE-2026-0163), detectadas gracias al MTE activado por GrapheneOS — [releases.html](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/releases.html)
- 2026-01-09: se añadió una opción voluntaria para "high EMF (PWM)" en los Pixel 10 Pro — log del repositorio (commit "add high EMF (PWM) opt-in for Pixel 10 Pro devices")

**Pixel 11 (lanzado en agosto de 2026): sin soporte**
- 2026-08-29: GrapheneOS cambia el FAQ porque "Pixel 11 no longer meets the listed, inexhaustive future devices requirements". El texto pasa de "met or exceeded by current Pixel devices" a "**met or exceeded by devices starting from Pixel 8 (shiba) through Pixel 10a (stallion)**". "Hardware memory tagging (ARM MTE or equivalent)" figura entre los requisitos — [commit a413736](https://github.com/GrapheneOS/grapheneos.org/commit/a413736); [commit 4d26f97](https://github.com/GrapheneOS/grapheneos.org/commit/4d26f97); [FAQ #future-devices](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- Publicación oficial de GrapheneOS en X (~29 ago 2026): "We have a partial port of GrapheneOS to the Pixel 11 series after a week of work on it. We're unable to complete the port due to lack of support for ARM hardware memory tagging in software, firmware and near certainly hardware. It appears Google cut an important security feature…" — [GrapheneOS en X](https://x.com/GrapheneOS/status/2093731615243411862) (texto tomado del resumen de búsqueda)
- Según la prensa, GrapheneOS "strongly recommends against buying Pixel 11 devices" y dice que Pixel 8, 9 y 10 tienen mejor seguridad. También dice que no planea releases oficiales para más dispositivos sin MTE y que, si algún día diera soporte al Pixel 11, probablemente no llevaría la marca GrapheneOS — [heise, "Porting issues: GrapheneOS advises against buying the Pixel 11"](https://www.heise.de/en/news/Porting-issues-GrapheneOS-advises-against-buying-the-Pixel-11-11435208.html); [Hacker News](https://news.ycombinator.com/item?id=49490702) (vistos en resumen de búsqueda; un segundo resumen dijo no haber encontrado un "avoid" oficial explícito, así que hay **discrepancia en el matiz**)
- Notebookcheck informa de documentos internos filtrados según los cuales Google planificó el MTE para el Tensor G6 y luego lo quitó. No pude verificarlo de forma independiente — [Notebookcheck](https://www.notebookcheck.net/Leaked-documents-show-Google-planned-and-then-cut-a-key-Pixel-11-security-feature-for-GrapheneOS.1382732.0.html); ver también [TechTimes, 2026-08-31](https://www.techtimes.com/articles/325985/20260831/google-removed-pixel-11-memory-safety-hardware-blocking-grapheneos-port.htm), [PhoneArena](https://www.phonearena.com/news/pixel-11-hardware-memory-tagging-mte-grapheneos_id182967)
- **Fuente contradictoria (poco fiable):** un vídeo de YouTube ("Pixel 11 MTE Confirmed — But There's a Catch") dice que el hardware sí tiene MTE. Contradice al proyecto y se debe tratar con escepticismo — [YouTube](https://www.youtube.com/watch?v=kUUwqZx72II)

### Inferences
- **La serie Pixel 10 (incluido el 10a) es la última generación de Pixel soportada.** Mientras siga la postura actual, el Pixel 10a y la gama Pixel 10 son la mejor compra "a futuro" dentro del ecosistema Pixel.
- Que el instalador web solo ofreciera Alpha durante unos días de mayo de 2026 fue un problema puntual y se resolvió en menos de una semana.

### Gaps
- No pude leer completas las publicaciones de X/Bluesky ni el artículo de heise (dominios bloqueados). Las citas vienen de resúmenes de búsqueda.
- No encontré el motivo exacto de que el instalador web pusiera Alpha para los Pixel 10 en mayo de 2026.

---

## 4. ¿Qué recomienda comprar GrapheneOS hoy?

### Takeaway
GrapheneOS recomienda "strongly" comprar **solo Pixel de 8ª generación o posteriores: Pixel 8/8 Pro/8a, 9/9 Pro/9 Pro XL/9 Pro Fold/9a y 10/10 Pro/10 Pro XL/10 Pro Fold/10a**. Los motivos son los 7 años de soporte y el MTE por hardware. Desaconseja el Pixel 11 y recomienda comprar el móvil e instalar GrapheneOS uno mismo, no comprarlo preinstalado.

### Cited Findings
- FAQ #recommended-devices: "We strongly recommend only purchasing one of the following devices for GrapheneOS due to better security and a long minimum support guarantee from launch…: Pixel 10a, Pixel 10 Pro Fold, Pixel 10 Pro XL, Pixel 10 Pro, Pixel 10, Pixel 9a, Pixel 9 Pro Fold, Pixel 9 Pro XL, Pixel 9 Pro, Pixel 9, Pixel 8a, Pixel 8 Pro, Pixel 8". Razones: "8th generation and later Pixels provide a minimum guarantee of 7 years of support from launch" y soporte de "hardware memory tagging", que GrapheneOS usa por defecto, además de PAC/BTI — [FAQ #recommended-devices (2026-10-09)](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- Aviso del FAQ: los dispositivos vendidos con operadora pueden venir bloqueados por ella y no permitir instalar GrapheneOS. Es "primarily an issue with US carriers and isn't common elsewhere in the world" — [FAQ](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- FAQ #preinstalled-devices: "We are currently not affiliated with or endorse any company selling devices with GrapheneOS. Our official recommendation is to buy a supported device and install GrapheneOS yourself" con el instalador web oficial. Si se compra con el sistema preinstalado, hay que verificar el hash de la clave de verified boot y hacer un reset de fábrica — [FAQ #preinstalled-devices](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)
- Evolución: el 2024-12-04 la recomendación era "7th gen Pixel or later for new users". Ahora es 8ª generación o posterior — [commit 443acf3](https://github.com/GrapheneOS/grapheneos.org/commit/443acf3)
- Pixel 11: el proyecto desaconseja comprarlo para GrapheneOS (ver sección 3) — [heise](https://www.heise.de/en/news/Porting-issues-GrapheneOS-advises-against-buying-the-Pixel-11-11435208.html); [GrapheneOS en X](https://x.com/GrapheneOS/status/2093731615243411862)

### Inferences
- Según los criterios de GrapheneOS (más soporte y hardware más nuevo), las mejores opciones de compra en octubre de 2026 son: **Pixel 10a** (soporte hasta mar. 2033, gama media), **Pixel 10 / 10 Pro / 10 Pro XL** (hasta ago. 2032) y **Pixel 10 Pro Fold** (hasta oct. 2032). El Pixel 9a/9 sigue siendo válido (2031-2032) si se encuentra a buen precio.
- En España, los Pixel libres (Google Store ES o tiendas) no deberían dar problemas de bloqueo por operadora. Aun así conviene comprobar que la opción de "OEM unlocking" esté disponible.

### Gaps
- No pude leer directamente los foros ni las redes sociales oficiales de GrapheneOS para ver si recomiendan un modelo concreto (por ejemplo, el 10a frente al 10). El FAQ no ordena los modelos por preferencia más allá de la lista.
- Precios y disponibilidad de cada Pixel en España: fuera del alcance de esta búsqueda.

---

## 5. Alianza con un fabricante distinto de Google (Motorola): anuncio, calendario y disponibilidad en Europa/España

### Takeaway
Motorola y la GrapheneOS Foundation anunciaron una **alianza a largo plazo el 1-2 de marzo de 2026, en el MWC de Barcelona**. Sobre 24 de septiembre de 2026, GrapheneOS confirmó que el **Motorola Signature 27 (con Snapdragon de gama alta)** será su **primer móvil soportado que no es un Pixel**. Aun así, **a 9 de octubre de 2026 no hay ningún Motorola con soporte oficial**: no aparece en el FAQ ni en las releases. El móvil se lanzaría a finales de 2026 (Norteamérica, noviembre) y GrapheneOS para él se espera en **2027**. No hay fecha europea ni española confirmada.

### Cited Findings
- 2026-03-01/02 (MWC Barcelona): Motorola anuncia la alianza con la GrapheneOS Foundation. Incluye investigación conjunta, mejoras de seguridad, llevar algunas funciones de GrapheneOS a otros Motorola y "future devices engineered with GrapheneOS compatibility" — [9to5Google, 2026-03-01](https://9to5google.com/2026/03/01/motorola-confirms-grapheneos-partnership-for-a-future-smartphone-porting-features/); [Android Authority](https://www.androidauthority.com/grapheneos-motorola-partnership-announced-3645710); [Thurrott](https://www.thurrott.com/?p=333231); [Gigazine, 2026-03-03](https://gigazine.net/gsc_news/en/20260303-motorola-partnership-grapheneos); [Motorola News (MWC 2026)](https://motorolanews.com/motorola-three-new-b2b-solutions-at-mwc-2026/) (todo visto en resumen de búsqueda)
- Según la prensa, GrapheneOS dijo que los primeros dispositivos serían gamas altas "similar to the current generation Motorola Signature, Motorola razr fold and Motorola razr ultra, since those will be the 2027 devices meeting our requirements", y que sería el mismo GrapheneOS que en Pixel, sin bloatware — [It's FOSS](https://itsfoss.com/news/motorola-grapheneos-team-up/); [Mezha](https://mezha.ua/en/news/motorola-partnership-with-grapheneos-309013/)
- **Discrepancia sobre la preinstalación:** PhoneArena dice que el anuncio habla de un móvil con GrapheneOS preinstalado. Android Authority dice que no se ha concretado si vendrá preinstalado o será instalable — [PhoneArena](https://www.phonearena.com/news/motorola-has-partnered-with-grapheneos_id178609); [Android Authority](https://www.androidauthority.com/grapheneos-motorola-signature-27-support-3714885/)
- Según Android Authority, GrapheneOS habló de un cambio en 2027 "thanks to our partnership with Motorola Mobility and progress being made by Qualcomm" — [Android Authority](https://www.androidauthority.com/grapheneos-motorola-phone-support-update-3691324/)
- ~2026-09-22/24: el Motorola Signature 27 se presenta en torno al Snapdragon Summit y GrapheneOS confirma: "Yes, that will be the initial supported phone" — [9to5Google, 2026-09-24](https://9to5google.com/2026/09/24/motorola-signature-27-confirmed-to-support-grapheneos/); [Android Authority](https://www.androidauthority.com/grapheneos-motorola-signature-27-support-3714885/); [Android Police](https://www.androidpolice.com/motorola-signature-27-graphene-os-confirmed/); [Android Central](https://www.androidcentral.com/phones/motorola/motorola-signature-27-will-support-graphene-os); [Notebookcheck](https://www.notebookcheck.net/Motorola-s-GrapheneOS-phone-is-teased-with-wild-camera-specs-and-an-audio-partnership.1404834.0.html)
- Calendario: heise dice que el Signature 27 saldría a finales de 2026, pero que GrapheneOS probablemente no estará disponible para él hasta el año que viene. Otra fuente dice que la web de Motorola Norteamérica lo pone para noviembre, sin precio y con despliegue global posterior. Android Central dice que no se sabe cuándo llegará el soporte ni cómo será la instalación — [heise](https://www.heise.de/en/news/Signature-27-is-likely-Motorola-s-first-smartphone-with-GrapheneOS-support-11462875.html); [Android Central](https://www.androidcentral.com/phones/motorola/motorola-signature-27-will-support-graphene-os)
- Wikipedia: GrapheneOS tiene soporte oficial en Pixel lanzados entre 2021 y 2025, y el proyecto planea certificar algunos Motorola — [Wikipedia](https://en.wikipedia.org/wiki/GrapheneOS)
- Europa/España: **no hay fecha ni precio europeo confirmados.** Un precio de 799 € (Finlandia) que circula en comentarios de GSMArena no está verificado y parece referirse al Signature original de 2026, no al Signature 27 — [GSMArena (comentarios)](https://m.gsmarena.com/newscomm-74681.php)
- El FAQ oficial (2026-10-09) sigue diciendo "We plan to partner with OEMs to have devices produced meeting all our requirements… and ideally shipping with GrapheneOS". En la lista de soportados no aparece ningún Motorola — [FAQ #future-devices](https://github.com/GrapheneOS/grapheneos.org/blob/main/static/faq.html)

### Inferences
- Para un comprador en España en octubre de 2026, **el Motorola todavía no es una opción real**: no hay builds oficiales, no hay fecha en la UE y GrapheneOS se espera para 2027. Merece la pena seguirlo, pero hoy la elección práctica sigue siendo un Pixel 8-10a.
- Como el Pixel 11 queda fuera, es probable que a partir de 2027 la vía de futuro de GrapheneOS pase por los Motorola con Snapdragon, si Google no recupera el MTE en el Pixel 12. Esto es una inferencia, no una declaración del proyecto.

### Gaps
- No hay datos confirmados del Signature 27 sobre fecha de venta en España, precio en euros, años de actualizaciones prometidos por Motorola para este modelo, si vendrá con GrapheneOS preinstalado ni el SoC exacto. No pude abrir los artículos (dominios bloqueados) y las fuentes no coinciden en esos puntos.
- La guía de efani.com ("GrapheneOS Supported Devices in 2026…") la publica un vendedor de móviles "seguros". No la usé como fuente principal.
