# Brúixola · buscador de ayudas a la medida de cada entidad

Brúixola es una app que pregunta **qué tipo de entidad eres** (pyme, startup, autónomo, cooperativa, empresa de inserción, asociación, fundación, ONGD…), **dónde estás** y **qué quieres financiar**, y devuelve solo las ayudas, subvenciones, préstamos, premios y convocatorias europeas o privadas que encajan con ese perfil. Cada resultado indica por qué encaja, cuánto plazo queda y de qué fuente sale el dato. Se centra en España y la Comunitat Valenciana: Estado, Generalitat, diputaciones y ayuntamientos, más los programas europeos y las fundaciones privadas.

Este documento describe **cómo funciona** la app y **de qué fuentes se alimenta**. Las fuentes se comprobaron el 19/10/2026 (ver [notas técnicas](../research_notes/Fuentes%20datos%20app%20ayudas/fuentes_datos.md)). El contenido sobre ayudas viene del [informe verificado de octubre de 2026](../reports/Ayudas%20Espa%C3%B1a%20y%20Comunitat%20Valenciana%20verificaci%C3%B3n.md).

---

## 1. El problema que resuelve

- **La información está dispersa.** Una misma entidad valenciana tiene que vigilar el BOE, el DOGV, tres BOP, la sede de la Generalitat, las webs de IVACE+i, IVF, LABORA, CDTI y ENISA, el portal europeo y una docena de fundaciones.
- **El buscador oficial no distingue entidades sociales.** La Base de Datos Nacional de Subvenciones (BDNS) recoge todas las convocatorias públicas, pero clasifica a los beneficiarios en solo cinco tipos. No separa una cooperativa de una pyme, ni una asociación juvenil de una fundación, ni un centro especial de empleo de una empresa de inserción.
- **Los plazos suelen ser relativos.** Por ejemplo, "20 días naturales desde la publicación en el BOP" o "15 días hábiles desde el extracto en el DOGV": hay que calcularlos.
- **El calendario es cíclico.** En la Comunitat Valenciana, casi todas las líneas sociales se convocan entre marzo y julio, y las empresariales entre enero y marzo. Quien no lo sabe llega tarde.
- **El tipo de dinero ha cambiado.** Con el cierre del Plan de Recuperación en 2026, la financiación permanente es reembolsable (ENISA, CDTI, ICO, IVF). Un buscador que solo muestre subvenciones deja fuera la mitad de las opciones.

---

## 2. Cómo funciona

### 2.1 Paso 1: el perfil de la entidad

El usuario rellena un perfil corto. La app lo prellena y lo valida donde puede.

| Dato | Cómo se obtiene | Para qué sirve |
|---|---|---|
| **NIF** | Lo escribe el usuario | La **letra** da la forma jurídica, según la Orden EHA/451/2008: A/B sociedades, **F cooperativas**, **G asociaciones y fundaciones**, J sociedades civiles, R entidades religiosas. Un DNI o NIE indica persona física o autónomo. |
| **Tipo de entidad detallado** | Lista cerrada, preseleccionada a partir del NIF | Autónomo · microempresa/pyme · startup (certificada por ENISA o no) · gran empresa · cooperativa · sociedad laboral · empresa de inserción · centro especial de empleo · asociación · asociación juvenil · fundación · ONGD · federación o entidad representativa · entidad local (solo como socia) |
| **Calificaciones y registros** | Casillas y declaración responsable; se validan contra directorios abiertos cuando existen | Utilidad pública · inscripción en el registro autonómico de servicios sociales · calificación como CEE o empresa de inserción (LABORA) · registro de agentes de cooperación · concierto o subvención previa de la Conselleria (requisito, por ejemplo, del préstamo del IVF al tercer sector) |
| **Ubicación** | Municipio | Se traduce a la cadena territorial municipio → provincia → Comunitat → España → UE |
| **Sector** | Buscador de actividad que devuelve el código **CNAE-2025**, con correspondencia desde la CNAE-2009 | Cruce con los sectores de cada convocatoria |
| **Tamaño y antigüedad** | Plantilla, facturación y fecha de constitución | Requisitos habituales: pyme, menos de 5 años, 2 o 3 años de antigüedad mínima |
| **Qué quiere financiar** | Selección múltiple | Contratar personal · I+D+i · digitalización · inversión o equipamiento · eficiencia energética · internacionalización · actividad social o programas · cultura · cooperación · participación ciudadana · creación de la entidad · circulante |
| **Tipo de dinero aceptado** | Selección múltiple | Subvención · préstamo bonificado o participativo · premio · capital o inversión de impacto · consorcio europeo (como socio o como líder) |

Un perfil puede tener varios **proyectos**: la misma cooperativa puede buscar a la vez financiación para contratar y para invertir en maquinaria.

### 2.2 Paso 2: el motor de coincidencias

Cada oportunidad del catálogo pasa por tres capas.

**Capa 1. Filtros de elegibilidad, que descartan.**
- **Tipo de beneficiario:** compatible con el perfil, según la tabla de la sección 4.
- **Territorio:** la convocatoria cubre la ubicación del usuario. En la BDNS hay que consultar la unión de nodos España (1), Este (48), Comunitat Valenciana (54) y la provincia (55, 56 o 57), porque el filtro no hereda de padres a hijos. Lo municipal se deduce del órgano convocante.
- **Instrumento:** está entre los tipos de dinero aceptados.
- **Solicitud posible:** se excluyen las concesiones directas y nominativas, que no admiten solicitud.
- **Requisitos duros conocidos:** antigüedad, utilidad pública, ámbito estatal (el 0,7 % del IRPF estatal y el FSE+ de atención temprana solo admiten entidades de ámbito estatal), jefe de fila público (Interreg Euro-MED), concierto previo, etc.

**Capa 2. Clasificación semántica, que afina.**

La BDNS solo distingue cinco tipos de beneficiario. Para saber si una convocatoria es "para cooperativas" o "para entidades juveniles", la app clasifica el **título** (en castellano y valenciano) y el **texto de las bases** (los PDF que la BDNS enlaza) con dos herramientas:
- reglas de palabras clave ("economía social", "Ley 44/2007", "centros especiales de empleo", "IVAJ"…);
- un modelo de lenguaje con salida estructurada, que extrae beneficiarios finos, requisitos, gastos subvencionables, intensidad, importe máximo y plazo.

Cada etiqueta extraída guarda el fragmento de texto del que sale, para que el usuario pueda comprobarla.

**Capa 3. Puntuación y orden.** Cada oportunidad elegible recibe una nota de 0 a 100:

| Criterio | Peso | Señal |
|---|---|---|
| Encaje temático | 40 | Objeto y finalidad de la convocatoria frente a lo que el usuario quiere financiar; sector CNAE |
| Tiempo frente a esfuerzo | 20 | Días hábiles que quedan frente a la carga de preparación estimada (formulario simple, memoria técnica o consorcio europeo) |
| Importe | 15 | Ayuda máxima frente al tamaño del proyecto |
| Probabilidad | 15 | Presión competitiva histórica, calculada con las concesiones de años anteriores (número de concesiones y presupuesto). Por ejemplo, EMPYME 2026 recibió 2.776 solicitudes para 2,0 M€. |
| Fiabilidad del dato | 10 | Dato oficial estructurado, extraído de las bases o curado a mano |

El resultado se agrupa en **Encaja**, **Posible (revisar requisito X)** y **No encaja**. En "No encaja" se explica el motivo, por ejemplo: "solo para entidades de ámbito estatal".

### 2.3 Paso 3: la ficha de cada oportunidad

Cada resultado muestra:

- **Título, organismo y nivel** (Estado, Generalitat, diputación, ayuntamiento, UE o fundación), con el código BDNS o el identificador de la convocatoria.
- **Semáforo de plazo**, que puede ser:
  - abierta (con el cierre calculado y la hora: las convocatorias de la AEI cierran a las 14:00, INNOVAE a las 12:00 y la Comisión a las 17:00 CET);
  - por orden de llegada (hay que presentar ya);
  - prevista (con el mes estimado);
  - permanente;
  - cerrada.
- **Qué financia, cuánto y en qué forma**: intensidad, tope, y si es subvención, préstamo, premio o capital.
- **Por qué encaja**, con los requisitos cumplidos marcados y los dudosos señalados.
- **Fiabilidad**, con una de estas etiquetas: *Oficial estructurado* (campo de la BDNS o del BOE), *Extraído de las bases* (con la cita), *Curado* (revisado a mano en una fecha) o *Secundario*.
- **Enlaces** a la ficha de la BDNS, el extracto en el BOE, DOGV o BOP, las bases y la sede de tramitación.
- **Siguiente paso**: registro necesario (por ejemplo, SIGES para el 0,7 % estatal), documentación habitual y aviso de que el gasto no puede haber empezado antes de solicitar, cuando las bases lo exigen.

### 2.4 Paso 4: plazos, calendario y alertas

**Cálculo de plazos relativos.** Cuando la BDNS da el plazo solo en texto libre (los campos `textInicio` y `textFin`), la app:
1. lee la fórmula ("20 días naturales desde el día siguiente a la publicación del extracto");
2. busca la fecha de publicación en `anuncios[]` o en el BOE, DOGV o BOP;
3. cuenta los días sobre un calendario de días hábiles, sin sábados, domingos ni festivos nacionales, autonómicos y locales, según la Ley 39/2015.

Si no puede confirmar la fecha de publicación, muestra el plazo como *estimado*.

**Previsión de convocatorias recurrentes.** La app agrupa las convocatorias del mismo órgano con títulos equivalentes de años anteriores, que están en la BDNS desde hace años. Con eso proyecta la próxima ventana: "Fomento de la economía social (GVA): prevista para mayo de 2027, según 2025 y 2026". Así se construye la vista **"Prepara 2027"**: lo que conviene redactar en el último trimestre para llegar a enero con los proyectos listos.

**Alertas.** Hay tres tipos:
- un correo semanal (o diario, si el usuario lo elige) con las convocatorias **nuevas** que encajan;
- avisos de **cierre** a 15, 7 y 2 días;
- avisos de **apertura** de las previstas.

**Control de minimis.** Con el NIF de una persona jurídica, la app consulta en la BDNS las ayudas ya concedidas y avisa si la entidad se acerca al límite de minimis (300.000 € en tres años según el Reglamento (UE) 2023/2831; hay que confirmar el tope en cada convocatoria).

### 2.5 Paso 5: la hoja de ruta

La vista final ordena la cartera de la entidad en tres columnas:
- **Ahora**: plazos de las próximas seis semanas.
- **Preparar**: convocatorias previstas para los próximos seis meses.
- **Base permanente**: préstamos y líneas abiertas todo el año.

Incluye un recordatorio de los registros que conviene tener al día: inscripciones autonómicas, alta en SIGES, certificación de empresa emergente de ENISA y calificación como ONGD.

### Ejemplos de comportamiento (con datos de octubre de 2026)

- **Cooperativa agroalimentaria de la provincia de Valencia que quiere invertir.**
  - Ahora: préstamo IVF Industria Agroalimentaria o Agro Anticrisis al 1,5 %, hasta el 31/12/2026.
  - Preparar: ESEMDI, la línea de inversión del fomento de la economía social, prevista entre mayo y junio de 2027, y la línea de inversiones agroalimentarias del PEPAC, prevista en julio de 2027.
  - Base permanente: ENISA, si es una pyme con ánimo de lucro.
  - En "No encaja": la convocatoria estatal de economía social, porque solo financia a federaciones.
- **Asociación juvenil de Castelló.**
  - Ahora: no hay subvención pública autonómica abierta, y la app lo dice expresamente.
  - Preparar: entidades juveniles del IVAJ (marzo de 2027), Erasmus+ KA2 (5/03/2027) y CERV Memoria Europea, si se une a un consorcio (cierra el 24/02/2027).
  - Fundaciones: la Fundació Caixa Castelló (febrero).
- **Startup tecnológica de Alicante que va a contratar a una doctora.**
  - Ahora: Torres Quevedo, hasta el 29/10 a las 14:00, y Doctorados Industriales, hasta el 26/10 a las 14:00.
  - Preparar: NEOTEC (abril y mayo de 2027).
  - Base permanente: ENISA y el participativo del IVF para startups.

---

## 3. Fuentes de datos

La regla de diseño es **BDNS primero**. Por la Ley 38/2003 (arts. 18 y 20), toda administración (Estado, comunidades autónomas y entidades locales) registra sus convocatorias en la BDNS, y los extractos del BOE, el DOGV y los BOP salen de ahí. Las demás fuentes completan lo que la BDNS no tiene: textos y fechas de publicación, programas europeos, financiación privada y líneas permanentes.

### 3.1 Fuentes de convocatorias

| # | Fuente | Qué aporta | Acceso | Frecuencia | Papel en la app |
|---|---|---|---|---|---|
| 1 | **BDNS / InfoSubvenciones** (IGAE, Ministerio de Hacienda) | Todas las convocatorias públicas de España: órgano, tipo de beneficiario, región NUTS, finalidad, instrumento, sectores CNAE-2025, presupuesto, plazos (fechas o texto), fondos europeos, bases en PDF, título en valenciano. Además, concesiones y ayudas de Estado y de minimis | API REST JSON pública y sin clave, en `https://www.infosubvenciones.es/bdnstrans/api`, con la cabecera `Accept: application/json`. Endpoints: `/convocatorias/busqueda`, `/convocatorias?numConv=` (detalle), `/convocatorias/documentos`, `/concesiones/busqueda`, `/minimis/busqueda`, `/terceros` y los catálogos | Diaria (unas 3.110 convocatorias nuevas entre el 1 y el 18/10/2026) | **Fuente principal** de convocatorias públicas, del historial (para las previsiones) y del control de minimis |
| 2 | **BOE**, API de datos abiertos (AEBOE) | Sumario diario: la sección V-B trae los extractos de las convocatorias estatales y la III, las bases. Legislación consolidada. Canal RSS de ayudas | `GET /datosabiertos/api/boe/sumario/AAAAMMDD` (con `Accept`), RSS `boe.es/rss/canal.php?c=ayudas` | Diaria, de lunes a sábado | Fecha oficial de publicación (para calcular plazos), alerta temprana y enlace al texto oficial |
| 3 | **DOGV** (Generalitat Valenciana) | Sumario diario. La subsección III-B "Subvenciones y becas" trae convocatorias, extractos, ampliaciones y resoluciones | El portal funciona sobre una API JSON interna, sin documentar y sin RSS. **Antes de usarla en producción hay que pedir acceso formal** a la Generalitat. Mientras tanto, la BDNS cubre las convocatorias autonómicas | Diaria, en días laborables | Fecha de publicación de las convocatorias autonómicas, ampliaciones de plazo y crédito |
| 4 | **BOP de València, Castelló y Alicante** | Convocatorias municipales y provinciales. Los anuncios llevan el "Identificador BDNS" | Solo HTML o PDF; el de Castelló tiene URLs de descarga estables; el de Alicante está pendiente de localizar | Varios días por semana | Solo para confirmar la fecha de publicación de lo local, enlazado por código BDNS. La convocatoria viene de la BDNS |
| 5 | **Portal de convocatorias de la UE** (Funding & Tenders, API de búsqueda SEDIA) | Convocatorias de Horizonte Europa, CERV, Erasmus+, Europa Creativa, LIFE, Digital Europe, EIC, convocatorias en cascada… Estado (abierta o próxima), cortes y programa | `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA` (clave pública del portal), detalle en `topicDetails/{id}.json` | Diaria | Oportunidades europeas. No informa de elegibilidad regional, así que se marcan como "requiere consorcio" o "abierta a cualquier país elegible". Es una API no documentada formalmente: se trata como frágil |
| 6 | **Programas europeos con portal propio** (Interreg Euro-MED, URBACT, Iniciativa Urbana Europea, EIT, NEB) | Convocatorias que no siempre aparecen en el portal de la Comisión | Curación manual con revisión mensual | Mensual | Completan la fuente 5 |
| 7 | **Organismos con líneas permanentes**: ENISA, CDTI (PID, LIC, Innvierte), ICO (Crecimiento, mediación), IVF (Liquidez, Pyme Inversión, DANA, Agro, participativos, tercer sector), FAIIP | Préstamos y financiación que no siempre se registran como convocatoria con plazo | Ficha curada, revisada cada trimestre. Para detectar cambios se usan el RSS de noticias del CDTI y el de la AVI (`innoavi.es/feed/`) | Trimestral, o cuando hay novedades | Columna "Base permanente" |
| 8 | **Fundaciones y financiadores privados**: "la Caixa" (convocatoria Comunitat Valenciana), Bancaja-CaixaBank, Caixa Popular, Fundació Caixa Castelló, Juan Perán-Pikolinos, Daniel y Nina Carasso, Iberdrola, Mapfre, ONCE, Repsol, Santander… | Convocatorias sociales, premios e inversión de impacto | Curación manual. Algunas webs bloquean el acceso automatizado ("la Caixa" responde 403) y solo Bancaja tiene RSS | Calendario anual, revisado al abrir cada ventana | Financiación privada. La ficha curada sigue el mismo esquema que el resto |
| 9 | **Finanzas éticas y de impacto**: Coop57, Fiare, Triodos, Ship2B, Bolsa Social, Goteo (matchfunding) | Crédito para la economía social e inversión de impacto | Curación manual | Semestral | Alternativa reembolsable para entidades sociales |

### 3.2 Fuentes para el perfil y la validación

| Fuente | Qué aporta | Acceso |
|---|---|---|
| **Letra del NIF** (Orden EHA/451/2008, art. 3) | Forma jurídica | Regla local, sin llamadas externas |
| **Directorio de Cooperativas de la CV** (`soc-cooperativas-AAAA`) | NIF, razón social y clase de cooperativa | dadesobertes.gva.es (CKAN, CC BY) |
| **Directorio de Asociaciones de la CV** (`soc-asociaciones-v2`) | Indicador de asociación juvenil, utilidad pública y situación (sin NIF; se busca por nombre) | dadesobertes.gva.es |
| **Registro de Fundaciones de la CV** (`soc-fundaciones-2023`) | Listado de fundaciones | dadesobertes.gva.es (último año publicado: 2023) |
| **Registro de Agentes de Cooperación (ONGD) de la CV** (`soc-agecop`) | NIF y denominación | dadesobertes.gva.es |
| **Concesiones de la Generalitat** (`eco-gvo-subv-AAAA`) | Importes, líneas, finalidad y tipo de beneficiario de lo concedido, con código BDNS | dadesobertes.gva.es, semanal. Sirve para la presión competitiva y el historial |
| **BDNS `/terceros` y `/concesiones?nifCif=`** | Ayudas ya recibidas por un NIF | API de la BDNS |
| **CNAE-2025** (INE, RD 10/2025) | Clasificación de actividad y correspondencia con la CNAE-2009 | Tablas del INE |
| **BORME** (API de la AEBOE) | Fecha de constitución de sociedades. No incluye el NIF | API del BOE |

**Sin fuente abierta**, se resuelven con declaración responsable: el registro de **centros especiales de empleo** y el de **empresas de inserción** (LABORA), las **sociedades laborales** y la calificación de **entidad del tercer sector** (el RD 592/2026 regula su reconocimiento, pero no consta que el registro esté operativo).

### 3.3 Cómo se ingieren las fuentes

```
Diario (1–2 veces):
  BDNS  /convocatorias/busqueda?fechaDesde=<ayer>   →  detalle por numConv  →  descarga de bases (PDF)
        →  normalización  →  clasificación semántica  →  cálculo de plazo  →  catálogo
  BOE   sumario del día + RSS "ayudas"              →  fechas de publicación y alertas
  DOGV  sumario del día (con acceso formal)         →  fechas de publicación, ampliaciones
  BOP   enlace por "Identificador BDNS"             →  fecha de publicación local
  UE    búsqueda SEDIA (estado abierta o próxima)   →  catálogo europeo
  Reproceso de las convocatorias abiertas (la BDNS corrige y borra datos)
Semanal:
  Catálogos BDNS (regiones, finalidades, instrumentos, actividades)
  Concesiones GVA (CKAN) y directorios de entidades
Trimestral / según calendario:
  Fichas curadas: líneas permanentes, fundaciones, programas europeos con portal propio
```

**Modelo de la ficha de oportunidad** (común a todas las fuentes):

`id_fuente` (BDNS, SEDIA o curada) · `título_es` / `título_va` · `organismo` · `nivel` · `ámbito territorial` · `beneficiarios_finos[]` (con su evidencia) · `requisitos[]` · `finalidad` · `sectores_cnae[]` · `instrumento` · `presupuesto` · `importe_máx` · `intensidad` · `plazo_inicio` / `plazo_fin` / `hora` / `tipo_plazo` (fijo, relativo, orden de llegada o permanente) · `estado` · `es_recurrente` y `próxima_ventana_estimada` · `urls` (BDNS, diario, bases, sede) · `fiabilidad` · `fecha_extracción` · `fecha_revisión`.

---

## 4. Correspondencia entre tipos de entidad y la BDNS

| Tipo de entidad en la app | Tipo de beneficiario en la BDNS | Pistas que usa la clasificación semántica |
|---|---|---|
| Autónomo | 3: pyme y persona física con actividad económica | "autónom*", "trabajo por cuenta propia", "RETA" |
| Pyme o microempresa | 3 | "pyme", "microempresa"; artículos 17 a 22 del RGEC |
| Startup | 3 | "empresa emergente", "Ley 28/2022", "NEOTEC", "base tecnológica"; antigüedad |
| Gran empresa | 4 | — |
| Cooperativa o sociedad laboral | 3 | "economía social", "cooperativ*", "sociedad laboral", "Ley 5/2011" |
| Empresa de inserción | 3 | "empresa(s) de inserción", "Ley 44/2007"; artículos 32 y 35 del RGEC |
| Centro especial de empleo | 3, a veces 2 | "centro(s) especial(es) de empleo", "unidades de apoyo"; artículos 33 y 34 del RGEC. A vigilar: la Ley 4/2026 cambiaría su denominación |
| Asociación, fundación, ONGD o entidad juvenil | 2: persona jurídica sin actividad económica | "sin ánimo de lucro", "asociaciones", "fundaciones", "ONGD", finalidad 20 (cooperación), "juvenil", "IVAJ" |
| Cualquiera | 5: sin información específica | Siempre se muestra como "Posible: revisar" |

Las finalidades de la BDNS que más se usan son: 5 servicios sociales, 6 empleo, 11 cultura, 12 agricultura, 13 industria y energía, 14 comercio, turismo y pymes, 17 I+D+i y 20 cooperación. Los instrumentos se mapean así: 1 subvención; 2 préstamo, 4 garantía y 6 financiación de riesgo, que pasan a la columna de financiación.

---

## 5. Fiabilidad, legalidad y privacidad

- **La fuente oficial manda.** Si la BDNS, el boletín y la web del organismo no coinciden (pasa: en octubre de 2026 la ficha en inglés de la AEI daba por cerrada Torres Quevedo con el plazo abierto), prevalece el extracto del boletín, después la BDNS. La app muestra la discrepancia en lugar de esconderla.
- **Cada dato lleva su procedencia y su fecha de extracción.** La app cita la fuente ("Fuente: BDNS/IGAE", "BOE", "DOGV", "GVA Dades Obertes, CC BY") y no da a entender que ningún organismo la patrocina, tal como exigen la Ley 37/2007 de reutilización y el RD 1495/2011.
- **Uso responsable de las API:**
  - En la BDNS: no superar 10 peticiones por segundo (la app trabaja a 1–4), usar caché y sincronización incremental, y un *User-Agent* identificable con contacto. La IGAE puede bloquear usos abusivos.
  - En el DOGV: acceso formal antes de producción.
- **Webs que no se rastrean:** el `robots.txt` de `sede.gva.es` prohíbe expresamente a los rastreadores de IA y a Scrapy, así que la app no la rastrea: enlaza a la ficha del trámite y toma los datos de la BDNS y del DOGV. Tampoco se sortean bloqueos de webs privadas; esas fuentes se curan a mano.
- **Datos personales:**
  - Las concesiones a personas físicas de la BDNS tienen reutilización restringida (RD 130/2019). La app no las muestra ni las cruza con perfiles; solo usa agregados (número de concesiones e importes por convocatoria).
  - Los perfiles de **autónomos** son datos personales, porque su NIF es su DNI. Se aplican RGPD y LOPDGDD: base contractual, minimización, cifrado, plazo de conservación y transparencia sobre la lógica de recomendación.
  - Si el modelo de lenguaje lo presta un tercero, procesa las **bases** (documentos públicos), no los datos del usuario, salvo con contrato de encargo de tratamiento.

---

## 6. Limitaciones conocidas

- La BDNS **no tiene filtro de "plazo abierto" ni de sector** en la búsqueda de convocatorias, y a menudo da el plazo solo en texto libre. Por eso la app descarga el detalle de cada convocatoria y calcula el plazo, con el coste de procesamiento que eso supone.
- El nivel municipal **no existe** en la taxonomía territorial: se deduce del órgano convocante.
- La clasificación de beneficiarios finos depende de leer las bases. Si una convocatoria no tiene bases accesibles, se marca como "Posible: revisar".
- La API de la UE no informa de elegibilidad regional, y la mayoría de las convocatorias europeas exige consorcio.
- Las fundaciones privadas y las líneas permanentes dependen de la **curación manual**. Su ficha muestra la fecha de la última revisión.
- **Pendiente de comprobar** antes de construir:
  - el formato de los filtros con varios valores en la BDNS (`regiones=1,48,54,57` frente a parámetros repetidos);
  - la versión 1.2.4 de su API frente a la especificación 1.1.0;
  - el documento de buenas prácticas de la API de la BDNS;
  - la dirección y el formato del BOP de Alicante;
  - el aviso legal del DOGV;
  - una consulta completa con filtros a la API de la UE.

---

## 7. Alcance por fases

| Fase | Contenido |
|---|---|
| **MVP** | Perfil con NIF, tipo, municipio, CNAE y qué quiere financiar · Ingesta diaria de la BDNS con detalle y bases · Clasificación semántica · Cálculo de plazos con el BOE y el DOGV · Fichas curadas de las líneas permanentes (ENISA, CDTI, ICO, IVF) · Resultados en tres grupos y alertas por correo |
| **Fase 2** | Previsión de convocatorias recurrentes y vista "Prepara el próximo año" · Presión competitiva a partir de concesiones · Control de minimis por NIF · Catálogo europeo (SEDIA + curación) |
| **Fase 3** | Fundaciones y finanzas éticas con calendario anual · Búsqueda de socios para consorcios (entidades con el mismo interés o ayuntamientos que necesitan socio técnico) · Exportación del calendario (iCal) · Interfaz en valenciano |

---

## 8. En qué se diferencia de lo que ya existe

- **Buscador de la BDNS:** completo y oficial, pero sus filtros solo distinguen cinco tipos de beneficiario y no calcula plazos relativos.
- **Buscador de ayudas de IPYME / Plataforma ONE:** pensado para empresas, con guías por comunidad y sector, pero sin API y sin foco en el tercer sector.
- **Buscadores comerciales** (por ejemplo, FANDIT): generalistas y sin foco en la economía social.

Ninguno de estos buscadores trata como perfiles propios a la **cooperativa, la empresa de inserción, el centro especial de empleo, la asociación juvenil o la ONGD**. Ninguno combina la BDNS con el **DOGV, los BOP, la UE y las fundaciones valencianas**. Tampoco convierten el calendario recurrente en una **hoja de ruta**.
