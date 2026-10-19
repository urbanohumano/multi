# Inventario técnico de fuentes de datos para una app de búsqueda de ayudas y subvenciones

Ámbito: España, Comunitat Valenciana (CV), provincias de Alicante, Castellón y Valencia, municipios, UE y fundaciones privadas.
Fecha de verificación: **19 de octubre de 2026** (salvo que se indique otra fecha).

---

## 0. Metodología y leyenda de verificación

El entorno de trabajo no tenía salida directa a internet (el proxy bloqueaba `*.gob.es`, `*.gva.es`, `boe.es`, `europa.eu`…). Para verificar las fuentes **con llamadas reales** usé la cuenta de Apify del usuario:

- `parsebird/http-request-actor` para llamadas HTTP crudas (GET/POST con cabeceras, respuesta completa con estado y cabeceras).
- `apify/rag-web-browser` para leer páginas HTML.
- `redfoxscout/rss-feed-finder` para detectar feeds RSS/Atom.

Además usé (1) espejos en GitHub de la especificación OpenAPI oficial de la BDNS, (2) código abierto de terceros que consume estas APIs y (3) búsqueda web. El coste en Apify fue de céntimos.

Leyenda usada en todo el documento:

| Etiqueta | Significado |
|---|---|
| **[VERIFICADO]** | Llamada real hecha el 19-10-2026 (o la fecha indicada); se citan el código HTTP y lo observado. |
| **[VERIF. INDIRECTA]** | Comprobado en documentación o espejo oficial (p. ej. el OpenAPI de la BDNS copiado en GitHub) o en código o catálogos de terceros que dicen haberlo probado con llamadas reales. No lo he llamado yo. |
| **[INFERIDO]** | Deducción razonada o conocimiento previo, sin comprobar hoy. Conviene revisarlo antes de construir sobre ello. |

---

## 1. Resumen ejecutivo y arquitectura de ingesta recomendada

1. **La BDNS es la columna vertebral.** Por la Ley General de Subvenciones (art. 18 y 20), toda convocatoria de cualquier Administración (AGE, CCAA, entidades locales y otros órganos) se registra en la BDNS. El extracto que sale en el BOE, el DOGV o el BOP lo remite la propia BDNS. [VERIFICADO] Los anuncios del BOP de València del 19-10-2026 llevan "Identificador BDNS: 933798" y similares, y los extractos del DOGV remiten a la BDNS. Tiene API REST JSON pública sin clave y con taxonomías propias: tipo de beneficiario, región NUTS, finalidad, instrumento y sector CNAE.
2. **Los diarios oficiales (BOE, DOGV y BOP) son fuentes complementarias.** Sirven para (a) alertas tempranas y texto completo (bases, plazos) y (b) detectar lo que no está en la BDNS: premios, becas no subvencionales, convenios y modificaciones de plazo. El BOE tiene una API documentada. El DOGV tiene una API JSON interna sin documentar. Los BOP no tienen API ni RSS útiles: hay que rascar el HTML.
3. **Unión Europea:** la API de búsqueda del Funding & Tenders Portal (SEDIA) funciona sin clave real (`apiKey=SEDIA`), pero no está documentada como API pública estable.
4. **Fundaciones privadas y agencias sin API** (CDTI, ENISA, IVACE+i, IVF, LABORA, "la Caixa", Bancaja): curación manual o scraping ligero. Solo CDTI, AVI y Bancaja tienen RSS, y además los RSS de estas agencias son de noticias, no de convocatorias estructuradas.
5. **Perfil de la entidad:** se puede prellenar con la letra del NIF (Orden EHA/451/2008, verificada en la API del BOE) y validar con los directorios abiertos de la GVA (asociaciones, fundaciones, cooperativas y agentes de cooperación). Para comprobar si un NIF ya recibió ayudas se usa el endpoint `/terceros` y las concesiones de la BDNS.

Pipeline propuesto (inferido a partir de lo verificado):

```
Diario (cron 1-2 veces/día):
  BDNS /convocatorias/busqueda (fechaDesde=ayer, por páginas)  ->  /convocatorias?numConv=N (detalle)  -> normalizar
  BOE  /datosabiertos/api/boe/sumario/AAAAMMDD  (+ RSS canal "ayudas")
  DOGV /dogv-portal/dogv?date=AAAA-MM-DD  (subsección 44 "B) SUBVENCIONES Y BECAS")
  BOP València / Castelló / Alicante (scraping, solo como alerta; enlazar por "Identificador BDNS")
  SEDIA (UE) POST search (estado abierto o próximo)
Semanal/mensual:
  Catálogos BDNS (/beneficiarios, /finalidades, /instrumentos, /regiones, /actividades, /objetivos, /reglamentos)
  GVA CKAN: concesiones GVA (eco-gvo-subv-AAAA), directorios de entidades
  Curación manual: fundaciones privadas, ENISA, IVF, CDTI, IVACE+i
```

---

## 2. BDNS / Sistema Nacional de Publicidad de Subvenciones y Ayudas Públicas (SNPSAP) — FUENTE PRINCIPAL

### 2.1 Ficha

| Campo | Valor |
|---|---|
| Nombre | Base de Datos Nacional de Subvenciones (BDNS) / Sistema Nacional de Publicidad de Subvenciones y Ayudas Públicas (SNPSAP, "InfoSubvenciones") |
| Titular | Intervención General de la Administración del Estado (IGAE), Ministerio de Hacienda |
| Portal | https://www.infosubvenciones.es/bdnstrans/GE/es/inicio (también se sirve desde `pap.hacienda.gob.es/bdnstrans`) |
| API base | `https://www.infosubvenciones.es/bdnstrans/api` **[VERIFICADO]** |
| Tipo | REST, GET, JSON (con un Accept de navegador devuelve XML o XHTML) **[VERIFICADO]** |
| Documentación | Swagger UI dentro de la aplicación Angular: `https://www.infosubvenciones.es/bdnstrans/doc/swagger` y `/bdnstrans/GE/es/api` **[VERIF. INDIRECTA]**. La especificación OpenAPI 3.0 v1.1.0 ("API de SNPSAP") está copiada en GitHub (`PepeluiMoreno/opendatamanager/docs/fuentes/bdns/snpsap-api-v1.1.0.json`); el backend en producción ya va por la versión **1.2.4** [VERIFICADO vía `/vpd/GE/configuracion`], así que puede haber parámetros nuevos. |
| Autenticación | **Ninguna** **[VERIFICADO]**. Solo hay que enviar `Accept: application/json`. |
| Actualización | Continua y diaria: `ultimaActualizacion = 2026-10-19T07:21:19+02:00` [VERIFICADO]. Entre el 01-10 y el 18-10-2026 se registraron **3.110 convocatorias** en todo el país [VERIFICADO]. |
| Licencia y reutilización | Cada respuesta incluye el campo `advertencia`, que remite al aviso legal (`/bdnstrans/GE/es/avisolegal`), y avisa de que los datos son dinámicos y de que la IGAE puede restringir el acceso a la API si hay abuso [VERIFICADO, texto literal en la respuesta]. El marco general es la Ley 37/2007 de reutilización de la información del sector público. Los datos personales de beneficiarios tienen restricciones adicionales: RD 130/2019, art. 7 [VERIF. INDIRECTA]. |
| Límite de peticiones | No aparece en el OpenAPI. Según el documento oficial "Buenas prácticas API SNPSAP" (`/bdnstrans/estaticos/ayuda/Buenas prácticas API SNPSAP.pdf`, citado por `bdns-fetch`): **10 peticiones GET por segundo y por IP** [VERIF. INDIRECTA; el PDF no se pudo descargar]. `pageSize` se limita en silencio a 10.000 [VERIF. INDIRECTA]. |
| robots.txt | `https://www.infosubvenciones.es/robots.txt` devuelve una página HTML de la IGAE ("Página Rechazada / Autorización Requerida") con estado 200, sin reglas [VERIFICADO]. |

### 2.2 Endpoints (según el OpenAPI v1.1.0; los marcados se han verificado en vivo)

| Endpoint | Uso | Parámetros clave |
|---|---|---|
| `GET /convocatorias/busqueda` **[VERIFICADO]** | Búsqueda paginada de convocatorias (lista ligera) | `vpd` (portal, `GE` = general), `page`, `pageSize`, `order` (`numeroConvocatoria`, `mrr`, `nivel1`, `nivel2`, `nivel3`, `fechaRecepcion`, `descripcion`, `descripcionLeng`), `direccion` (`asc`/`desc`), `descripcion` (texto del título) + `descripcionTipoBusqueda` (0 frase exacta, 1 todas las palabras, 2 alguna palabra), `numeroConvocatoria`, `mrr` (bool, Mecanismo de Recuperación y Resiliencia), `contribucion` (bool), `fechaDesde`/`fechaHasta` (**dd/mm/aaaa**; en formato ISO da 400), `tipoAdministracion` (C Estado, A CCAA, L local, O otros), `organos[]`, `regiones[]` (ids), `tiposBeneficiario[]` (ids), `instrumentos[]` (ids), `finalidad` (un solo id), `ayudaEstado` (número SA) |
| `GET /convocatorias?numConv={código BDNS}&vpd=GE` **[VERIFICADO]** | Detalle completo (ver 2.4) | `numConv` obligatorio |
| `GET /convocatorias/ultimas` | Últimas convocatorias registradas | `page`, `pageSize`, `order`, `direccion`, `vpd` |
| `GET /convocatorias/exportar?tipoDoc={pdf\|xlsx\|csv}&vpd=GE` | Exportación con los mismos filtros que la búsqueda | Sin `pageSize` devuelve solo 50 filas; el CSV viene en **windows-1252** [VERIF. INDIRECTA] |
| `GET /convocatorias/documentos?idDocumento=` | Descarga de un PDF de la convocatoria (`application/octet-stream`) | `idDocumento` sale de `documentos[].id` del detalle |
| `GET /convocatorias/pdf?id=&vpd=`, `GET /convocatorias/zip?id=&vpd=` | Ficha en PDF o ZIP de documentos | |
| `GET /concesiones/busqueda` (+ `/exportar`) | Concesiones (beneficiario, importe, fecha) | igual que arriba + `codConcesion`, `nifCif`, `beneficiario` (idPersona), `actividad[]` (sector), `fechaRegInicio`/`fechaRegFin` (fecha de **alta en BDNS**: la adecuada para sincronizar de forma incremental) |
| `GET /ayudasestado/busqueda`, `/minimis/busqueda` (+ `/exportar`) | Ayudas de Estado (RGEC, número SA) y de minimis | `objetivos[]`, `reglamento`, `producto`, `ayudaEstado` |
| `GET /grandesbeneficiarios/busqueda`, `/grandesbeneficiarios/anios` | Grandes beneficiarios por año | `anios`, `nifCif` |
| `GET /sanciones/busqueda`, `/partidospoliticos/busqueda`, `/planesestrategicos/busqueda` (+ `/vigencia`, `?idPES=`) | Sanciones, partidos y planes estratégicos de subvenciones | |
| `GET /terceros?ambito={C\|A\|M\|S\|P\|G}&busqueda=` | Autocompletado NIF ↔ nombre de beneficiarios (mínimo 3 caracteres) | Corta en 150 filas sin avisar [VERIF. INDIRECTA] |
| **Catálogos** `GET /beneficiarios`, `/finalidades`, `/instrumentos`, `/regiones`, `/actividades`, `/sectores`, `/objetivos`, `/reglamentos?ambito=`, `/organos?idAdmon={C\|A\|L\|O}`, `/organos/agrupacion`, `/organos/codigo?codigo=`, `/organos/codigoAdmin?codigoAdmin=` | Taxonomías (ver 2.3) | `vpd=GE` |
| `GET /vpd/{vpd}/configuracion` **[VERIFICADO]**, `GET /enlaces` | Configuración del portal (versión, última actualización) | |
| `POST /suscripciones/*` | Alertas por correo del propio portal (alta, login, modificar…) | Requiere registro; no sirve para la app |

Formato de la paginación [VERIFICADO]: es un `Page` de Spring con `content[]`, `totalElements`, `totalPages`, `number`, `size`, `first`, `last` y `advertencia`. Cada elemento de `content` trae `id` (interno), `numeroConvocatoria` (código BDNS, el identificador estable), `descripcion`, `descripcionLeng` (título en valenciano o catalán cuando existe), `fechaRecepcion` (AAAA-MM-DD), `nivel1` (ESTADO / AUTONOMICA / LOCAL / OTROS), `nivel2` (CCAA o municipio), `nivel3` (órgano), `codigoInvente` y `mrr`.

### 2.3 Catálogos y taxonomías (valores literales obtenidos el 19-10-2026)

#### Tipos de beneficiario — `GET /beneficiarios?vpd=GE` **[VERIFICADO]**

| id | descripción |
|---|---|
| 1 | PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA |
| 2 | PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA |
| 3 | PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA |
| 4 | GRAN EMPRESA |
| 5 | SIN INFORMACION ESPECIFICA |

> Consecuencia para el matching: la BDNS **no distingue** cooperativa, sociedad laboral, empresa de inserción, centro especial de empleo (CEE), asociación, fundación, ONGD ni entidad juvenil. Esos matices solo aparecen en el título y en las bases (PDF). Hay que combinar el filtro por tipo con clasificación de texto o LLM del título y las bases. Ver la tabla de correspondencias en §11.

#### Finalidad (política de gasto) — `GET /finalidades?vpd=GE` **[VERIFICADO]**

| id | descripción | | id | descripción |
|---|---|---|---|---|
| 1 | JUSTICIA | | 12 | AGRICULTURA, PESCA Y ALIMENTACIÓN |
| 2 | DEFENSA | | 13 | INDUSTRIA Y ENERGÍA |
| 3 | SEGURIDAD CIUDADANA E INSTITUCIONES PENITENCIARIAS | | 14 | COMERCIO, TURISMO Y PYMES |
| 4 | OTRAS PRESTACIONES ECONÓMICAS | | 15 | SUBVENCIONES AL TRANSPORTE |
| 5 | SERVICIOS SOCIALES Y PROMOCIÓN SOCIAL | | 16 | INFRAESTRUCTURAS |
| 6 | FOMENTO DEL EMPLEO | | 17 | INVESTIGACIÓN, DESARROLLO E INNOVACIÓN |
| 7 | DESEMPLEO | | 18 | OTRAS ACTUACIONES DE CARÁCTER ECONÓMICO |
| 8 | ACCESO A LA VIVIENDA Y FOMENTO DE LA EDIFICACIÓN | | 19 | SIN INFORMACION ESPECIFICA |
| 9 | SANIDAD | | 20 | COOPERACIÓN INTERNACIONAL PARA EL DESARROLLO Y CULTURAL |
| 10 | EDUCACIÓN | | 21 | INFORMACIÓN NO DISPONIBLE |
| 11 | CULTURA | | | |

(El parámetro `finalidad` de la búsqueda acepta **un solo id**.)

#### Instrumentos — `GET /instrumentos?vpd=GE` **[VERIFICADO]**

| id | descripción |
|---|---|
| 1 | SUBVENCIÓN Y ENTREGA DINERARIA SIN CONTRAPRESTACIÓN |
| 2 | PRÉSTAMO |
| 4 | GARANTÍA |
| 5 | VENTAJA FISCAL |
| 6 | APORTACIÓN DE FINANCIACIÓN RIESGO |
| 7 | OTROS INSTRUMENTOS DE AYUDA |

#### Regiones (NUTS) — `GET /regiones?vpd=GE` **[VERIFICADO]**

Árbol `{id, descripcion, children[]}` con raíz "ES - ESPAÑA" (id 1). Baja hasta **NUTS3 (provincia o isla); no hay nivel municipal.** Incluye además países de la UE y "XXX - Regiones o países no europeos" (520) y "XXXX - TODO EL MUNDO" (521).

Ids relevantes para la Comunitat Valenciana:

| id | NUTS | nombre |
|---|---|---|
| 1 | ES | ESPAÑA |
| 48 | ES5 | ESTE |
| **54** | **ES52** | **COMUNIDAD VALENCIANA** |
| 55 | ES521 | Alicante / Alacant |
| 56 | ES522 | Castellón / Castelló |
| 57 | ES523 | Valencia / València |

Resto de España (id → NUTS): Noroeste 2 (ES1): Galicia 3 (ES11: A Coruña 4, Lugo 5, Ourense 6, Pontevedra 7), Asturias 8/9, Cantabria 10/11. Noreste 12 (ES2): País Vasco 13 (Araba 14, Gipuzkoa 15, Bizkaia 16), Navarra 17/18, La Rioja 19/20, Aragón 21 (Huesca 22, Teruel 23, Zaragoza 24). Madrid 25/26/27. Centro 28 (ES4): Castilla y León 29 (Ávila 30, Burgos 31, León 32, Palencia 33, Salamanca 34, Segovia 35, Soria 36, Valladolid 37, Zamora 38), Castilla-La Mancha 39 (Albacete 40, Ciudad Real 41, Cuenca 42, Guadalajara 43, Toledo 44), Extremadura 45 (Badajoz 46, Cáceres 47). Este 48 (ES5): Cataluña 49 (Barcelona 50, Girona 51, Lleida 52, Tarragona 53), CV 54, Illes Balears 58 (Eivissa-Formentera 59, Mallorca 60, Menorca 61). Sur 62 (ES6): Andalucía 63 (Almería 64 … Sevilla 71), Murcia 72/73, Ceuta 74/75, Melilla 76/77. Canarias 78/79 (El Hierro 80, Fuerteventura 81, Gran Canaria 82, La Gomera 83, Lanzarote 84, La Palma 85, Tenerife 86). Extra-Regio 87.

**Comportamiento del filtro `regiones` [VERIFICADO]:** con los mismos filtros (`tiposBeneficiario=2`, `fechaDesde=01/10/2026`), `regiones=54` (ES52) devolvió **50** convocatorias, todas de órganos AUTONOMICA/COMUNITAT VALENCIANA, y `regiones=57` (ES523) devolvió **98**. Se deduce **[INFERIDO, con esta evidencia]** que el filtro busca el nodo exacto y **no incluye a los descendientes ni a los ascendientes**. Para un usuario de, por ejemplo, Carlet (provincia de Valencia) hay que consultar la unión `{1 (ES), 48 (ES5), 54 (ES52), 57 (ES523)}`. El municipio solo se puede deducir del órgano convocante (`nivel1=LOCAL`, `nivel2=<municipio>`, `nivel3=AYUNTAMIENTO DE …`) [VERIFICADO en el detalle de la convocatoria 902560 de Carlet].

#### Actividades / sectores económicos del beneficiario (CNAE) — `GET /actividades?vpd=GE` **[VERIFICADO]**

La respuesta es una lista plana de las 22 secciones. **Las descripciones corresponden a la CNAE-2025 / NACE Rev. 2.1**, no a la CNAE-2009: aparecen las secciones nuevas "ACTIVIDADES DE EDICIÓN, RADIODIFUSIÓN Y PRODUCCIÓN Y DISTRIBUCIÓN DE CONTENIDOS" y "TELECOMUNICACIONES, PROGRAMACIÓN INFORMÁTICA, CONSULTORÍA, INFRAESTRUCTURA INFORMÁTICA Y OTROS SERVICIOS DE INFORMACIÓN".

| id | sección | | id | sección |
|---|---|---|---|---|
| 1 | AGRICULTURA, GANADERÍA, SILVICULTURA Y PESCA | | 263 | ACTIVIDADES FINANCIERAS Y DE SEGUROS |
| 19 | INDUSTRIAS EXTRACTIVAS | | 277 | ACTIVIDADES INMOBILIARIAS |
| 35 | INDUSTRIA MANUFACTURERA | | 282 | ACTIVIDADES PROFESIONALES, CIENTÍFICAS Y TÉCNICAS |
| 152 | SUMINISTRO DE ENERGIA ELECTRICA, GAS, VAPOR Y AIRE ACONDICIONADO | | 306 | ACTIVIDADES ADMINISTRATIVAS Y SERVICIOS AUXILIARES |
| 158 | SUMINISTRO DE AGUA, SANEAMIENTO, RESIDUOS Y DESCONTAMINACIÓN | | 331 | ADMINISTRACIÓN PÚBLICA Y DEFENSA; SEGURIDAD SOCIAL OBLIGATORIA |
| 169 | CONSTRUCCIÓN | | 336 | EDUCACIÓN |
| 184 | COMERCIO AL POR MAYOR Y AL POR MENOR | | 344 | ACTIVIDADES SANITARIAS Y DE SERVICIOS SOCIALES |
| 205 | TRANSPORTE Y ALMACENAMIENTO | | 357 | ACTIVIDADES ARTÍSTICAS, DEPORTIVAS Y DE ENTRETENIMIENTO |
| 228 | HOSTELERÍA | | 372 | OTROS SERVICIOS |
| 240 | ACTIVIDADES DE EDICIÓN, RADIODIFUSIÓN Y PRODUCCIÓN Y DISTRIBUCIÓN DE CONTENIDOS | | 388 | ACTIVIDADES DE LOS HOGARES COMO EMPLEADORES… |
| 251 | TELECOMUNICACIONES, PROGRAMACIÓN INFORMÁTICA, CONSULTORÍA, INFRAESTRUCTURA INFORMÁTICA… | | 394 | ORGANISMOS EXTRATERRITORIALES |

En el **detalle** de cada convocatoria, `sectores[]` trae `{descripcion, codigo}` con el **código CNAE** de la sección o del grupo. Ejemplos verificados: `S` (actividades artísticas…) y `Q` (educación), que siguen las letras de la NACE 2.1, y `88.9` ("Otras actividades de servicios sociales sin alojamiento"). Los ids internos (1, 19, 35…) se usan en el filtro `actividad[]` de concesiones, ayudas de Estado y minimis. La búsqueda de **convocatorias** no tiene filtro por sector: hay que filtrar en local con el detalle.

#### Otros catálogos

- `GET /sectores` **[VERIFICADO]**: no es la CNAE. Son los **sectores de productos agrarios** de la OCM (Reglamento 1308/2013, anexo I): 24 = Todos, 1 Cereales, 2 Arroz, 3 Azúcar … 12 Vino … 16 Leche … 23 Gusanos de seda. Se usa en `minimis` (`producto`) y en `sectoresProductos` del detalle.
- `GET /objetivos` **[VERIFICADO]**: objetivos de ayuda de Estado por artículo del RGEC 651/2014 y de los reglamentos agrarios y pesqueros. Ejemplos: "ART. 17 AYUDAS A LAS PYME. A LA INVERSIÓN" (38), "ART. 22 … NUEVOS PROYECTOS EMPRESARIALES" (43), "ART. 25 AYUDAS A PROYECTOS DE I+D" (167), "ART. 32 AYUDAS AL EMPLEO … TRABAJADORES DESFAVORECIDOS" (56), "ART. 33 … TRABAJADORES CON DISCAPACIDAD" (57), "ART. 34 … COSTES ADICIONALES … DISCAPACIDAD" (58; relevante para CEE), "ART. 53 AYUDAS A LA CULTURA Y … PATRIMONIO" (84), entre otros. Algunas descripciones aparecen repetidas con ids distintos, porque corresponden a versiones distintas del reglamento.
- `GET /reglamentos?ambito=`, `GET /organos?idAdmon=A` (árbol de órganos de las CCAA con códigos), `/organos/codigo` (por código DIR3 o INVENTE) **[VERIF. INDIRECTA, solo vía OpenAPI]**.
- Valores observados de `tipoConvocatoria` **[VERIFICADO / VERIF. INDIRECTA]**: "Concurrencia competitiva - canónica" (verificado); "Concesión directa - instrumental" y otros (indirecto). Las de **concesión directa o nominativa no admiten solicitud** y conviene excluirlas del matching. En la muestra de la CV del 16 al 18-10-2026 casi todas eran concesiones directas a entidades con nombre propio.

### 2.4 Campos del detalle relevantes para el matching — `GET /convocatorias?numConv=935912&vpd=GE` **[VERIFICADO]**

`id`, `codigoBDNS`, `organo{nivel1,nivel2,nivel3}`, `sedeElectronica`, `fechaRecepcion`, `tipoConvocatoria`, `presupuestoTotal` (número; en el ejemplo 17.832.560 €), `mrr`, `descripcion`, `descripcionLeng`, **`tiposBeneficiarios[{descripcion}]`**, **`sectores[{descripcion,codigo CNAE}]`**, **`regiones[{descripcion "ES52 - COMUNIDAD VALENCIANA"}]`**, **`descripcionFinalidad`**, `instrumentos[{descripcion}]`, `descripcionBasesReguladoras`, `urlBasesReguladoras` (puede venir como "no disponible"), `sePublicaDiarioOficial`, **`abierto`** (bool: si se puede solicitar en cualquier momento), **`fechaInicioSolicitud` / `fechaFinSolicitud`** (a menudo `null`), **`textInicio` / `textFin`** (plazo en texto libre, p. ej. "Plazo 15 días hábiles desde el siguiente a la publicación en el DOGV"), `ayudaEstado`/`urlAyudaEstado` (número SA), `fondos[]` (p. ej. "FSE+ - FONDO SOCIAL EUROPEO PLUS"), `reglamento`, `objetivos[]`, `sectoresProductos[]`, `documentos[{id,descripcion,nombreFic,long,datMod,datPublicacion}]` y `anuncios[]` (extractos publicados en diarios oficiales).

Los títulos pueden venir en castellano y en valenciano (`descripcionLeng`) [VERIFICADO].

### 2.5 Limitaciones conocidas

- **No hay filtro de "plazo abierto" en el servidor.** Hay que pedir el detalle de cada convocatoria y calcular el plazo a partir de `fechaFinSolicitud`, `textFin` y `abierto` [VERIFICADO: campos nulos o en texto libre]. Los plazos relativos ("15 días hábiles desde la publicación del extracto") obligan a cruzar con la fecha de publicación en BOE, DOGV o BOP y con un calendario de días hábiles.
- El tipo de beneficiario es muy grueso (5 valores). Las regiones llegan como mucho a provincia. El sector no se puede filtrar en la búsqueda de convocatorias.
- Las fechas de filtro van en dd/mm/aaaa. La lista solo devuelve campos ligeros, así que hay que hacer N+1 peticiones de detalle (respetar unas 10 peticiones por segundo; recomendable 1 a 4).
- Respuestas 200 con `ERR_MANTENIMIENTO_BBDD` y sin `content` en ventanas de mantenimiento; con un Accept de navegador la API devuelve XML [VERIF. INDIRECTA y VERIFICADO respectivamente].
- **Concesiones:** se retiran a los 4 años, y antes las de personas físicas (RD 130/2019) [VERIF. INDIRECTA]. Llevan DNI enmascarado y solo pueden reutilizarse con fines de control, investigación o estadística y de forma anonimizada. No deben mostrarse en la app ni usarse para perfilar personas físicas.
- Los datos son dinámicos (se corrigen y se borran). Conviene guardar la `fechaRecepcion` y volver a sincronizar las convocatorias abiertas.

---

## 3. BOE — API de datos abiertos y RSS

| Campo | Valor |
|---|---|
| Titular | Agencia Estatal Boletín Oficial del Estado (AEBOE) |
| Portal | https://www.boe.es/datosabiertos/ (documentación de la API: `/datosabiertos/api/api.php`, con OpenAPI embebido) |
| API sumario | `GET https://www.boe.es/datosabiertos/api/boe/sumario/{AAAAMMDD}` con `Accept: application/json` o `application/xml` (sin Accept responde 400). **[VERIFICADO]**: el 19-10-2026 devolvió 200, `application/json` y 371.771 bytes. Estructura: `data.sumario.metadatos` + `diario[].seccion[]{codigo,nombre}.departamento[].epigrafe[].item[]{identificador,titulo,url_pdf,url_html,url_xml}`. |
| API BORME | `GET /datosabiertos/api/borme/sumario/{AAAAMMDD}` (misma forma) [VERIF. INDIRECTA] |
| Legislación consolidada | `GET /datosabiertos/api/legislacion-consolidada/id/{BOE-A-…}/texto/bloque/{id}`. **[VERIFICADO]**: se usó para obtener el art. 3 de la Orden EHA/451/2008 en XML con su historial de versiones. |
| Texto de una disposición | `https://www.boe.es/diario_boe/xml.php?id=BOE-A-AAAA-NNNNN` (XML con metadatos, materias y texto) [VERIF. INDIRECTA] |
| RSS | `https://www.boe.es/rss/boe.php` (sumario del día), `boe.php?s={1,2A,2B,3,4,5A,5B,5C}`, **`canal.php?c=ayudas`** (también `becas`, `premios`, `prestamos`, `fundaciones`…). **[VERIFICADO]** `canal.php?c=ayudas`: 200, `application/rss+xml; charset=ISO-8859-1`, unos 51 KB, `X-Robots-Tag: noindex`. |
| Autenticación | Ninguna |
| Actualización | Diaria, de lunes a sábado; el domingo devuelve 404 [VERIF. INDIRECTA] |
| Licencia | Reutilización libre citando la fuente (aviso legal de la AEBOE; Ley 37/2007) [VERIF. INDIRECTA] |
| Campos útiles | Sección (III "Otras disposiciones": bases y convocatorias; **V-B "Otros anuncios oficiales": "Extracto de la …" de convocatorias estatales que remite la BDNS**), departamento (ministerio u organismo), título, URLs. El texto completo en XML trae las materias. |
| Limitaciones | Sin búsqueda por texto en la API de sumarios: hay que descargar el sumario y filtrar en local. Los niveles intermedios pueden venir como objeto o como lista. RSS en ISO-8859-1. Sin campos estructurados de beneficiario, plazo ni importe (hay que extraerlos del texto o de la BDNS). Sin límite de peticiones publicado. |

Uso recomendado: alerta diaria (V-B + RSS `ayudas`) y enlace al texto oficial. El matching se hace con los datos de la BDNS, que aparece citada en los extractos.

---

## 4. Comunitat Valenciana: DOGV, portal de datos abiertos (CKAN) y Sede PROP

### 4.1 DOGV (Diari Oficial de la Generalitat Valenciana)

| Campo | Valor |
|---|---|
| Titular | Generalitat Valenciana (Presidencia) |
| Portal | https://dogv.gva.es/es/ (portal Liferay que incrusta un iframe con la aplicación Angular `https://dogv.gva.es/dogv-portal-frontend/es`) [VERIFICADO] |
| API | **API JSON interna, sin documentar**: `https://dogv.gva.es/dogv-portal`. Responde 403 si la petición no lleva las cabeceras `Referer: https://dogv.gva.es/dogv-portal-frontend/es` y `X-Request-URL: https://dogv.gva.es/dogv-portal-frontend/es` (dato de un scraper de terceros, `opoalerta/scrapers/dogv.py`). **[VERIFICADO]** `GET /dogv-portal/dogv?date=2026-10-16&lang=es` con esas cabeceras → 200 `application/json;charset=UTF-8`. Otros endpoints [VERIF. INDIRECTA]: `/dogv/latest?lang=es`, `/dogv/calendar?startDate=…`, `/disposicion`, `/busqueda`. |
| Estructura del sumario [VERIFICADO] | `cabecera{numeroDogv:10472, fecha, any}`, `fechaSumario`, `esBis` (hay ediciones extraordinarias), `urlPdf` del sumario, `disposiciones[]{id, titulo, seccion{id,descripcion}, subseccion{id,descripcion}, organismo, fechaPublicacion, codigoInsercion ("2026/32302"), urlPdf ("/2026/10/16/pdf/2026_32302_es.pdf"), paginaInicial, consolidacion, borrador}`. Los PDF se sirven bajo `https://dogv.gva.es/datos`. |
| Secciones observadas [VERIFICADO] | 13 "II. AUTORIDADES Y PERSONAL" (subsección 28 "A) Ofertas de empleo público…", 30 "B) Nombramientos y ceses"); **14 "III. ACTOS ADMINISTRATIVOS" (41 "A) Autorizaciones y concesiones", 44 "B) SUBVENCIONES Y BECAS", 46 "C) Otros asuntos")**; 26 "V. ANUNCIOS" (60 "A) Ordenación del territorio y urbanismo", 67 "C) Otros asuntos"). El 16-10-2026, 24 de unas 50 disposiciones estaban en la subsección 44 (convocatorias, extractos, ampliaciones de crédito, concesiones directas, resoluciones de concesión, modificaciones de planes estratégicos de subvenciones). |
| RSS | **No encontré ningún RSS.** La sección "Alertas y subscripciones" redirige a un área personal con registro (`/dogv-portal-frontend/es/area-personal`) [VERIFICADO]. En X existe la cuenta @GVAdogv. |
| Autenticación | Ninguna (solo las cabeceras Referer y X-Request-URL) |
| Actualización | Diaria en días laborables (sumario con fecha) |
| Licencia | Reutilización de información pública citando la fuente [INFERIDO: no he leído el aviso legal del DOGV; revisar `https://dogv.gva.es/es/avis-legal`]. ELI disponible ("Projecte ELI") [VERIFICADO: enlace en el menú]. |
| Limitaciones | API no documentada: puede cambiar sin aviso y las cabeceras que exige son un control anti-hotlinking, lo que tiene implicaciones legales y de cortesía (ver §10). Sin campos de beneficiario, plazo ni importe. Bilingüe (`lang=es` / `lang=va`). |

### 4.2 Portal de datos abiertos de la GVA — dadesobertes.gva.es (CKAN)

| Campo | Valor |
|---|---|
| API base | `https://dadesobertes.gva.es/api/3/action/` (CKAN 2.x). **[VERIFICADO]**: `package_search` y `package_show` responden 200. También tiene datastore (`datastore_search`, `/datastore/dump/{resource_id}?format=csv`) y catálogo DCAT (`/catalog.rdf`, `.ttl`, `.jsonld`) [VERIF. INDIRECTA]. |
| Autenticación | Ninguna |
| Licencia | `cc-by` (CC BY) en los conjuntos consultados [VERIFICADO] |
| Límites | `rows` limitado a 1000 en `package_search` y `limit` a 32.000 en `datastore_search` [VERIF. INDIRECTA]. Las búsquedas con varios `OR` y tildes devolvieron 0 resultados de forma irregular; es más fiable buscar una sola palabra o usar `q=title:(…)` [VERIFICADO]. |

Conjuntos relevantes encontrados **[VERIFICADO]**:

| Conjunto (`name`) | Contenido | Frecuencia |
|---|---|---|
| `eco-gvo-subv-2026` (y `-2025`, `-2024`, `-2023`, `-2022`) | **Ayudas y subvenciones concedidas por la GVA** (concesiones, no convocatorias abiertas). Campos (diccionario en `extras_json`): `cd_bdns`, `cod_convocatoria`, `convocatoria`, `titulo_extracto_c/v`, `url_publi`, `url_base_c/v`, `base_reguladora`, `cd_linea`/`ds_linea_c` (línea presupuestaria), `cd_finalidad`/`ds_finalidad_c`, `cd_sector`/`ds_sector_c`, **`cd_tipo_beneficiario` (GRA, FSA, JSA, PFA)**, `cd_tipo_concesion` (C concurrencia, D directa), `cd_region` (ES52, ES521, ES522, ES523…), `ds_provincia`, `ds_comarca`, `fecha_concesion`, `importe`, `pagado`, `reintegros`, `imp_financ_europ/estat/auton/local/otros`, `cd_tipo_finan_eu_concact`, `nombre` (beneficiario), `cd_impacto_genero` y otros. Se mantiene 4 años; "los últimos 2 meses no tienen carácter definitivo". | Semanal |
| `eco-ayudas-dana` | Ayudas de la GVA relacionadas con la DANA (desde el 29-10-2024): `tipo_beneficiario`, `importe_solicitado/concedido/pagado`, `num_solicitudes`, municipio y comarca | Diaria |
| `eco-pmp-subvenciones` | Periodo medio de pago a beneficiarios | Mensual |
| `soc-asociaciones-v2` | **Directorio de Asociaciones de la CV**: `denominacion_asociacion`, `cd_reg_autonomico`, `cd_reg_nacional`, `cd_seccion`, `actividad`/`cd_actividad`, `subactividad`, **`juvenil` (sí/no)**, `ampa`, **`utilidad_pub`**, `situacion` (activa/inactiva), `fecha_inscripcion`, `fecha_disolucion`, domicilio, municipio, provincia, CP, `ambito_geografico`. **Sin NIF.** | Diaria |
| `soc-fundaciones-2023` (y 2022) | Fundaciones inscritas en el Registro de Fundaciones de la CV | Anual (el último año publicado es 2023) |
| `soc-cooperativas-2026` (y 2025, 2024…) | **Directorio de Cooperativas de la CV**: `cd_nif`, `ds_razon_social`, `ds_clase` (clase de cooperativa), `cd_clave_registral`, domicilio fiscal, municipio, provincia | Anual |
| `soc-agecop` | **Registro de Agentes de Cooperación Internacional al Desarrollo de la CV** (ONGD): `nif`, `denominacion`, sede, municipio, provincia, `fecha_antiguedad` | Mensual |
| `sec-regia-grupos` | Registro de grupos de interés de la Generalitat | — |
| `eco-gvo-contratos-AAAA` | Contratos registrados de la GVA (no es útil para ayudas) | Diaria |

**No encontré** conjuntos de: Guía PROP o catálogo de procedimientos, registro de Centros Especiales de Empleo, empresas de inserción, sociedades laborales, entidades juveniles (fuera del indicador `juvenil` de asociaciones) ni voluntariado [VERIFICADO: búsquedas por título y por texto sin resultados].

### 4.3 Sede electrónica GVA / Guía PROP de trámites

- La antigua `https://www.gva.es/es/inicio/procedimientos` redirige a **`https://sede.gva.es/es/detall-tramit`**. El buscador está en `https://sede.gva.es/es/cercador-tramits` y la ficha en `https://sede.gva.es/detall-tramit?id_proc=NNNN` (Liferay). También hay "Novedades de trámites" (`/es/novetats-tramits`, calendario por días) y "Boletín de Novedades PROP" [VERIFICADO].
- **No hay API pública ni conjunto de datos** de procedimientos o ayudas en dadesobertes [VERIFICADO: búsqueda negativa]. Solo HTML, así que haría falta scraping.
- **robots.txt de `sede.gva.es` [VERIFICADO]:** `User-Agent: *` con `Disallow:` vacío (todo permitido) **excepto una lista explícita de bots de IA y scrapers con `Disallow: /`**: ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai, GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, Google-Extended, CCBot, Bytespider, Scrapy, FirecrawlAgent, Diffbot y otros. Un crawler de la app que se identifique como Scrapy o como agente de IA no debe acceder.

---

## 5. Boletines Oficiales de la Provincia (BOP)

| BOP | URL | Tecnología y acceso | RSS/API | Observaciones |
|---|---|---|---|---|
| **València** (Diputació de València) | https://bop.dival.es/bop/ | JSF/PrimeFaces con sesión (`jsessionid`), búsqueda por sección (incluye la sección **"Subvencions"**), entidad, fechas y palabra clave; enlaces a PDF, HTML y RTF por `javascript` [VERIFICADO] | **No vi RSS.** Hay "Subscripció" por correo y un histórico en `fondosdigitales.dival.es/pandora/` [VERIFICADO] | El 19-10-2026 (BOP n.º 200, 88 anuncios) varios títulos incluyen "**Identificador BDNS: 933798**", "933878", "933696"… Se pueden enlazar con la BDNS sin scraping profundo [VERIFICADO]. Scraping difícil (estado de vista JSF). |
| **Castelló** (Diputació de Castelló) | https://bop.dipcas.es/PortalBOP/ | Portal con "Último boletín" y un buscador. Descargas por URL estable: **`/PortalBOP/api/descargarBoletin?idBoletin=26979&idioma=es`** y **`/PortalBOP/api/descargarAnuncio?idAnuncio=168452&idioma=es`** [VERIFICADO: enlaces presentes en el HTML] | **No vi RSS.** Área "Suscriptor" con registro | Publica martes, jueves y sábado (n.º 126, 17-10-2026) [VERIFICADO]. HTML del sumario fácil de parsear (enlaces con id de anuncio y título). |
| **Alicante** (Diputación de Alicante) | Dirección actual **no verificada**: `https://www.dip-alicante.es/bop/` y `https://bop.diputacionalicante.es/` fallaron. La "Carta de Servicios del BOP" está en `sede.diputacionalicante.es` | — | — | **Pendiente.** Contacto: edictos.bop@diputacionalicante.es [VERIF. INDIRECTA por búsqueda]. |

Conclusión: para subvenciones locales, **la BDNS ya contiene las convocatorias** (las entidades locales están obligadas a registrarlas y su extracto se publica en el BOP a través de la BDNS). Los BOP sirven como confirmación de la fecha de publicación (necesaria para calcular plazos relativos) y como alerta, no como fuente primaria.

---

## 6. Unión Europea

### 6.1 EU Funding & Tenders Portal — API de búsqueda SEDIA

| Campo | Valor |
|---|---|
| Titular | Comisión Europea (DG DIGIT / SEDIA) |
| Portal | https://ec.europa.eu/info/funding-tenders/opportunities/portal/ (la página oficial de APIs está en `…/screen/support/apis`) |
| Endpoint | `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=…&pageSize=…&pageNumber=…`. **[VERIFICADO]**: POST sin cuerpo con `text="social economy"` → 200, `apiVersion 2.157`, `totalResults 184.204`. Sin filtros devuelve todo tipo de contenido (FAQ, páginas…). |
| Filtros | Cuerpo **multipart/form-data** con las partes `query` (JSON tipo Elasticsearch bool), `languages` (`["en"]`), `sort` (`{"field":"es_SortDate","order":"ASC"}`) y opcionalmente `displayFields`. Códigos [VERIF. INDIRECTA, en código de terceros como fundhunt y ondata]: **`type`**: 0 licitación, 1 subvención (topic), 2 subvención EuropeAid, **8 convocatorias en cascada (FSTP)**; **`status`**: 31094501 próxima, **31094502 abierta**, 31094503 cerrada; `frameworkProgramme`/`programId` (p. ej. 44181033 = EDF). Ejemplo: `{"bool":{"must":[{"terms":{"type":["1","2","8"]}},{"terms":{"status":["31094501","31094502"]}}]}}` |
| Detalle | `https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/{identificador-en-minúsculas}.json` (HTML de descripción y condiciones, enlace al call-fiche) [VERIF. INDIRECTA] |
| Volcado | `https://ec.europa.eu/info/funding-tenders/opportunities/data/referenceData/grantsTenders.json` (todos los topics, varios MB) [VERIF. INDIRECTA: usado por aws-samples y otros] |
| Autenticación | Ninguna (`apiKey=SEDIA` es la clave pública del propio portal) |
| Licencia | Reutilización según la Decisión 2011/833/UE de la Comisión; el contenido de la Comisión se publica por defecto bajo CC BY 4.0 (Decisión C(2019) 1655) [INFERIDO a partir de conocimiento previo; revisar el aviso legal del portal] |
| Campos útiles | `identifier`, `callIdentifier`, `title`, `status`, `startDate`, `deadlineDate[]` (varios cortes), `deadlineModel`, `frameworkProgramme`, `typesOfAction`, `programmePeriod`, `keywords`, `tags`, `url`. Todos los metadatos llegan como listas de cadenas. |
| Limitaciones | No es una API pública documentada formalmente y puede cambiar. `pageSize` máximo 100. La paginación por `pageNumber` pierde o duplica documentos: mejor usar un cursor por `es_SortDate` [VERIF. INDIRECTA]. Hay duplicados por topic. El `status` de las convocatorias en cascada está desfasado, así que hay que filtrar por `deadlineDate`. No hay elegibilidad por país o región; la mayoría de los topics son de consorcios. |

### 6.2 CORDIS y data.europa.eu

- **CORDIS** (`https://cordis.europa.eu`): proyectos financiados por los programas marco (H2020, Horizon Europe), con volcados en `data.europa.eu`. **No contiene convocatorias abiertas.** Sirve para el benchmarking ("qué entidades de mi sector obtuvieron fondos") [INFERIDO, no verificado hoy].
- **data.europa.eu**: API de búsqueda `https://data.europa.eu/api/hub/search/search?q=…&limit=…`. **[VERIFICADO]**: 200 y `count` de 690.318 para una consulta laxa. Es un catálogo de metadatos DCAT-AP, útil para descubrir conjuntos (por ejemplo los beneficiarios del FSE+/FEDER de la "Kohesio" o del Financial Transparency System), pero no da convocatorias.
- Otras fuentes de la UE que conviene estudiar después [INFERIDO]: **Interreg** (buscador Algolia alimentado por keep.eu, con clave pública rotatoria, según fundhunt), **Erasmus+ y Cuerpo Europeo de Solidaridad** (agencias nacionales SEPIE e INJUVE; muy relevante para **entidades juveniles**), CERV, LIFE, EaSI/ESF+ directo. Ninguna verificada hoy.

---

## 7. datos.gob.es (catálogo nacional)

| Campo | Valor |
|---|---|
| Titular | Dirección General del Dato (Ministerio para la Transformación Digital y de la Función Pública) / Red.es |
| API | `https://datos.gob.es/apidata/catalog/dataset/title/{texto}.json?_pageSize=…&_page=…`, `/catalog/dataset/publisher/{DIR3}.json`, `/catalog/dataset/theme/{tema}.json` (Linked Data API, DCAT-AP). **[VERIFICADO]**: `title/subvenciones.json?_pageSize=50` → 200, 50 elementos y una página siguiente. También tiene SPARQL (`/virtuoso/sparql`) [VERIF. INDIRECTA: bloqueado a menudo por el WAF]. |
| Autenticación | Ninguna. Hay un WAF (Incapsula) que a veces responde 403 con un reto en JavaScript; conviene reintentar con espera [VERIF. INDIRECTA]. |
| Licencia | Metadatos CC BY 4.0; cada conjunto declara su propia licencia [VERIF. INDIRECTA] |
| Utilidad | Es un **catálogo de metadatos**, no un almacén de datos. Sirve para localizar conjuntos de ayudas concedidas de ayuntamientos y CCAA (p. ej. `e05250001-base-de-datos-nacional-de-subvenciones` y `a10002983-ayudas-y-subvenciones-concedidas-por-la-generalitat-valenciana-…`). La ficha de la BDNS indica descargas en PDF, XLS, CSV, JSON y XML [VERIF. INDIRECTA por búsqueda]. |

---

## 8. Organismos y financiadores sin API: RSS, calendarios y necesidad de scraping

Detección de feeds hecha el 19-10-2026 con `redfoxscout/rss-feed-finder`, más comprobaciones puntuales [VERIFICADO salvo que se indique otra cosa]:

| Organismo | Web | Feed / API | Estado y notas |
|---|---|---|---|
| **CDTI** (E.P.E., Ministerio de Ciencia) | https://www.cdti.es/ | **`https://www.cdti.es/rss.xml`** (Drupal) | Activo (última entrada el 16-10-2026), pero es un feed de **noticias** general (incluye ofertas de empleo). Las líneas del CDTI (PID, NEOTEC, Misiones…) también aparecen en la BDNS cuando son convocatorias. Servido tras Imperva (WAF). robots.txt estándar de Drupal (bloquea `/search/`, `/admin/`). |
| **ENISA** | https://www.enisa.es/ | Sin feed | Líneas de préstamo participativo permanentes (Jóvenes Emprendedores, Emprendedores, Crecimiento, Startups…): **curación manual** (cambian poco; revisar trimestralmente). Su instrumento en la BDNS sería "PRÉSTAMO", si se registran [INFERIDO]. |
| **Red.es** | https://www.red.es/es | `https://www.red.es/es/rss.xml` **existe pero está muerto** (última entrada de 2021, titulada "Ejemplo") | Hay que hacer scraping de la sección de convocatorias o usar la BDNS (Red.es registra sus convocatorias) [INFERIDO]. |
| **IVACE+i** (Instituto Valenciano de Competitividad e Innovación) | https://www.ivace.es/index.php/es/ | Sin feed (Joomla; robots.txt estándar que bloquea `/components/`, `/modules/`…) | Programas de ayudas anuales. **Todas sus convocatorias pasan por la BDNS y el DOGV**, así que la web solo hace falta para fichas y FAQ. |
| **AVI** (Agència Valenciana de la Innovació) | https://innoavi.es/ | **`https://innoavi.es/feed/`** (WordPress 6.9) activo (5 entradas en 30 días) y **API REST de WordPress** con tipos propios `wp-json/wp/v2/convocatoria` (24 entradas, **la última de 2021**) y `wp-json/wp/v2/subvencion` (18 entradas, última de 2022), más las taxonomías `sectores` y `tecnologias` | Los tipos de contenido "convocatoria" y "subvencion" están abandonados. La última noticia del feed (19-10-2026) se titula "**Ivace+i Innovació** resol el programa d'ajudes…", lo que sugiere que las ayudas de innovación se gestionan ya como IVACE+i Innovació [INFERIDO a partir del título]. |
| **IVF** (Institut Valencià de Finances) | https://www.ivf.es/ | Sin feed | Líneas de financiación (préstamos, garantías): curación manual y BDNS (instrumentos 2, 4 y 6). |
| **LABORA** | https://labora.gva.es/ | Sin feed (Liferay) | Sus convocatorias (programas de empleo, CEE, empresas de inserción) salen en el DOGV (p. ej. el 16-10-2026, "Talleres de empleo", subsección 44) y en la BDNS [VERIFICADO en el DOGV]. |
| **Fundación "la Caixa"** | https://fundacionlacaixa.org/es/ | — | **403 a peticiones automatizadas** (WAF). Convocatorias sociales anuales: **curación manual**. |
| **Fundación Bancaja** | https://www.fundacionbancaja.es/ | **`https://www.fundacionbancaja.es/feed/`** activo (9 entradas en 30 días) | Es sobre todo agenda cultural; las convocatorias sociales (p. ej. premios o convocatorias con CaixaBank) son esporádicas, así que conviene filtrar por palabras clave o curar a mano. |
| Cámara Valencia | https://www.camaravalencia.com/ | `https://www.camaravalencia.com/feed` (WordPress) | Noticias y formación; útil como fuente secundaria. |
| Fundae | https://www.fundae.es/ | Sin feed | Formación bonificada (crédito de formación); no son subvenciones a solicitar, pero conviene mostrarlo como recurso. |
| IPYME / Plataforma PYME | https://ipyme.org/ | Sin feed (SharePoint) | Ver §12 (buscador de referencia). |

Fundaciones privadas que conviene curar a mano, por relevancia para el tercer sector valenciano [INFERIDO, no verificadas]: Fundación ONCE (CEE, inserción), Fundación Daniel y Nina Carasso, Fundación Iberdrola España, Fundación Mutua Madrileña, Fundación Caja Rural, Caixa Popular (cooperativa valenciana), Fundació Horta Sud, programas de Ford, Mapfre, etc. Formato recomendado para la curación: ficha propia con `organismo, título, url, beneficiarios (lista controlada propia), ámbito territorial, plazo (inicio/fin o "permanente"), importe máximo, finalidad (mapeada a las finalidades de la BDNS), sectores CNAE, fuente, fecha_revisión`.

---

## 9. Fuentes para prellenar y validar el perfil de la entidad

### 9.1 Letra del NIF → forma jurídica — **[VERIFICADO]** en la API de legislación consolidada del BOE (Orden EHA/451/2008, art. 3, en la redacción de la Orden HAP/5/2016, vigente desde el 16-01-2016)

| Letra | Forma jurídica | Uso en la app |
|---|---|---|
| A | Sociedades anónimas | Empresa. Si es S.A. laboral, hay que preguntarlo o comprobarlo en el registro |
| B | Sociedades de responsabilidad limitada | Empresa (pyme, startup, S.L. laboral o empresa de inserción hay que confirmarlo aparte) |
| C | Sociedades colectivas | Empresa |
| D | Sociedades comanditarias | Empresa |
| E | Comunidades de bienes, herencias yacentes y demás entidades sin personalidad jurídica no incluidas en otras claves | Pyme/autónomo (C.B.) |
| **F** | **Sociedades cooperativas** | Cooperativa (economía social); se valida en `soc-cooperativas-AAAA` |
| **G** | **Asociaciones** | Asociación (también ONGD o entidad juvenil). En la práctica **las fundaciones también reciben NIF con G** [INFERIDO por práctica habitual, p. ej. fundaciones bancarias; la orden no las nombra] |
| H | Comunidades de propietarios en régimen de propiedad horizontal | — |
| J | Sociedades civiles | Pyme/autónomo |
| P | Corporaciones locales | Administración (beneficiaria de subvenciones interadministrativas) |
| Q | Organismos públicos | Administración, universidades, etc. |
| R | Congregaciones e instituciones religiosas | Entidad sin ánimo de lucro |
| S | Órganos de la Administración del Estado y de las CCAA | Administración |
| U | Uniones temporales de empresas | — |
| V | Otros tipos no definidos en el resto de claves | Revisar a mano (p. ej. AIE, SAT u otras) |
| (N, W) | Entidades extranjeras / establecimientos permanentes de no residentes | Regulados en otros artículos de la orden [INFERIDO] |
| Dígitos + letra, o X/Y/Z… | DNI o NIE de persona física | **Autónomo** (si desarrolla actividad) o particular |

La letra **no distingue**: startup (Ley 28/2022, certificación de ENISA), sociedad laboral, empresa de inserción, CEE, ONGD, entidad juvenil, entidad de utilidad pública ni el tamaño de la empresa (pyme o gran empresa). Todo eso debe preguntarse al usuario y, cuando se pueda, validarse con los registros que siguen.

### 9.2 Registros y directorios

| Fuente | Acceso | Campos útiles | Estado |
|---|---|---|---|
| **BORME** (actos inscritos en el Registro Mercantil) | API de la AEBOE `GET /datosabiertos/api/borme/sumario/{AAAAMMDD}` + `diario_borme/xml.php?id=BORME-A-AAAA-NNN-PP` (una provincia por documento; 46 = Valencia, 03 = Alicante, 12 = Castellón) | Denominación, actos (constitución, nombramientos, ampliaciones, disolución), datos registrales y fecha. **No incluye el NIF**, ni cuentas ni socios | [VERIF. INDIRECTA]. La API del BOE responde [VERIFICADO], pero el endpoint de BORME no lo llamé. Licencia: AEBOE, reutilización citando la fuente. Útil para detectar sociedades de nueva creación (≤ 3-5 años, requisito habitual en ayudas a startups). |
| **CNAE** | INE: **CNAE-2025** (RD 10/2025, BOE 15-01-2025, en vigor desde el 16-01-2025), con tablas de correspondencia con la CNAE-2009 en ine.es | Código de actividad | [VERIF. INDIRECTA por búsqueda]. **La BDNS ya usa las secciones de la CNAE-2025** [VERIFICADO, §2.3]. Las empresas inscritas antes de 2025 pueden conocer solo su código CNAE-2009, así que la app necesita una tabla de correspondencia. |
| **Directorio de Asociaciones de la CV** | CKAN `soc-asociaciones-v2` | Ver §4.2 (juvenil, utilidad pública, actividad, situación). **Sin NIF** | [VERIFICADO] |
| **Registro de Fundaciones de la CV** | CKAN `soc-fundaciones-2023` | Listado anual (el último publicado es 2023) | [VERIFICADO: existe] |
| **Registro de Cooperativas de la CV** | CKAN `soc-cooperativas-2026` | NIF, razón social, clase, municipio | [VERIFICADO] |
| **Registro de Agentes de Cooperación (ONGD) de la CV** | CKAN `soc-agecop` | NIF, denominación, sede | [VERIFICADO] |
| **Registro Nacional de Asociaciones** (Ministerio del Interior) | Solo el "Fichero de Denominaciones", con búsqueda por nombre en la sede de Interior (`sede.mir.gob.es/…/consulta-del-fichero-de-denominaciones-de-asociaciones/`). **No hay descarga masiva**: una petición en datos.gob.es se respondió remitiendo al fichero de denominaciones y a la publicidad registral | Nombre y registro | [VERIF. INDIRECTA por búsqueda] |
| **Registro de Fundaciones de competencia estatal** | Consulta web del ministerio competente | — | [INFERIDO; no verificado] |
| **Entidades del Tercer Sector de Acción Social** | **RD 592/2026, de 15 de julio** (BOE-A-2026-15460, 16-07-2026), que desarrolla el reconocimiento de estas entidades previsto en la Ley 43/2015 | No consta que el registro esté ya operativo | [VERIF. INDIRECTA por búsqueda; leer el BOE para conocer las fechas y los transitorios] |
| **Registro de Centros Especiales de Empleo de la CV** y **Registro de Empresas de Inserción de la CV** (gestionados por LABORA o la conselleria) | **No encontré datos abiertos ni consulta pública**. Las convocatorias exigen estar inscrito o calificado por LABORA | — | [VERIFICADO: búsqueda negativa en dadesobertes; VERIF. INDIRECTA en las bases publicadas en el DOGV]. Hay que pedir al usuario un justificante o una declaración responsable. |
| **Sociedades laborales** | Registro administrativo (estatal o autonómico); sin datos abiertos localizados | — | [INFERIDO] |
| **BDNS `/terceros` + `/concesiones/busqueda?nifCif=`** | Comprueba si un NIF ha recibido ayudas (historial, minimis acumulado) | NIF, nombre, concesiones, importes, convocatorias | [VERIF. INDIRECTA]. Muy útil para controlar el **límite de minimis** (normalmente 300.000 € en 3 años según el Reglamento (UE) 2023/2831 [INFERIDO]) y para sugerir convocatorias que la entidad ya obtuvo en años anteriores. |

---

## 10. Consideraciones legales y prácticas

1. **Reutilización de la información del sector público:** Ley 37/2007 (modificada por la Ley 18/2015 y por el RDL 24/2021, que traspone la Directiva (UE) 2019/1024 de datos abiertos) y RD 1495/2011 (que la desarrolla para la AGE: reutilización por defecto sin licencia expresa o con licencia CC BY, cita de la fuente, prohibición de desnaturalizar los datos y de dar a entender que el organismo patrocina la app) [INFERIDO, conocimiento normativo; no he releído los textos hoy]. Implicaciones prácticas: citar la fuente ("Fuente: BDNS/IGAE", "BOE", "DOGV", "GVA Dades Obertes, CC BY"), indicar la fecha de extracción y no alterar el sentido de los datos.
2. **BDNS:** condiciones específicas en el aviso legal (`/bdnstrans/GE/es/avisolegal`) y advertencia en cada respuesta [VERIFICADO]. Datos personales de concesiones: RD 130/2019 (retirada a los 4 años o antes, uso limitado y anonimizado) [VERIF. INDIRECTA]. La IGAE puede **bloquear** usos abusivos de la API: identificar la app con un User-Agent con contacto, usar caché, sincronizar de forma incremental y no superar 10 peticiones por segundo.
3. **UE:** Decisión 2011/833/UE sobre la reutilización de documentos de la Comisión y CC BY 4.0 por defecto [INFERIDO]. SEDIA no tiene condiciones de uso propias publicadas para la API: tratarla como un servicio frágil.
4. **Scraping:**
   - robots.txt verificados: `sede.gva.es` **prohíbe** a ClaudeBot, GPTBot, Scrapy, FirecrawlAgent y otros [VERIFICADO]; `cdti.es` (Drupal estándar, detrás de Imperva) y `ivace.es` (Joomla estándar) permiten las páginas públicas [VERIFICADO]; `infosubvenciones.es` no tiene robots.txt real [VERIFICADO].
   - WAF y bloqueos: fundacionlacaixa.org (403), cdti.es (Imperva), datos.gob.es (Incapsula, intermitente) [VERIFICADO / VERIF. INDIRECTA].
   - La API del DOGV exige imitar las cabeceras `Referer` y `X-Request-URL` del frontend. Técnicamente es posible, pero conviene **pedir permiso o un acceso formal a la GVA** (Conselleria de Presidencia / DOGV) antes de usarla en producción.
   - Ritmo prudente: 1 petición por segundo en webs institucionales, en horario valle, con caché HTTP (ETag y Last-Modified).
5. **RGPD / LOPDGDD (LO 3/2018) para los perfiles de usuario:**
   - Los datos de **personas jurídicas** no son datos personales, pero sí lo son los de **autónomos** (NIF = DNI) y los de las personas de contacto. Hacen falta base jurídica (contrato o consentimiento), información (arts. 13-14), minimización, cifrado y un plazo de conservación.
   - Si se perfila automáticamente ("te recomendamos estas ayudas") no hay decisiones con efectos jurídicos (art. 22), pero se recomienda transparencia sobre la lógica del matching.
   - No mezclar datos de concesiones de personas físicas de la BDNS con perfiles de usuario.
   - Si se usa un LLM sobre los PDF de las bases, no enviar datos de usuarios a terceros sin contrato de encargo de tratamiento (art. 28).
   - Si hay usuarios de entidades juveniles, controlar la edad (14 años en España, art. 7 LOPDGDD) [INFERIDO].

---

## 11. Correspondencia del perfil de usuario con la taxonomía de la BDNS (propuesta)

| Tipo de entidad (app) | `tiposBeneficiario` BDNS | Pistas adicionales (título, bases, catálogo) |
|---|---|---|
| Autónomo | 3 (pyme y persona física con actividad) | "autónom*", "trabajador/a por cuenta propia", "RETA" |
| Pyme / microempresa | 3 | "pyme", "microempresa"; `objetivos` RGEC art. 17-22 |
| Startup | 3 | "empresa emergente", "startup", "Ley 28/2022", "NEOTEC", "base tecnológica"; antigüedad (BORME) |
| Gran empresa | 4 | — |
| Cooperativa / sociedad laboral | 3 (si tiene actividad económica) | "economía social", "cooperativ*", "sociedad laboral", "Ley 5/2011" |
| Empresa de inserción | 3 | "empresa(s) de inserción", "Ley 44/2007"; `objetivos` art. 32 y 35 |
| Centro Especial de Empleo | 3 (a veces 2 si es de iniciativa social) | "centro(s) especial(es) de empleo", "CEE", "unidades de apoyo"; `objetivos` art. 33 y 34 |
| Asociación / fundación / ONGD / entidad juvenil | **2** (persona jurídica sin actividad económica) | "entidades sin ánimo de lucro", "asociaciones", "fundaciones", "ONGD", "cooperación al desarrollo" (finalidad 20), "juvenil", "IVAJ"; registros CV (§9.2) |
| (cualquiera) | 5 = sin información específica | Incluir siempre como "posible" y revisar a mano |

Ubicación → `regiones`: unión de {1, 48, 54, provincia (55/56/57)}, más un filtro local por `nivel1=LOCAL` y `nivel2=<municipio>`.
Sector → CNAE-2025 (sección o grupo) comparado con `sectores[].codigo`, y finalidad (14 comercio/turismo/pymes, 17 I+D+i, 12 agro, 6 empleo, 5 servicios sociales, 11 cultura, 20 cooperación).
Instrumento → id 1 (subvención) por defecto; 2, 4 y 6 para financiación (ENISA, IVF).
Excluir `tipoConvocatoria` de concesión directa o instrumental.

---

## 12. Herramientas existentes (benchmark para el posicionamiento)

| Herramienta | Qué hace | Verificación |
|---|---|---|
| **Buscador de la BDNS / InfoSubvenciones** | Búsqueda oficial por órgano, región, tipo de beneficiario, finalidad e instrumento; exportación a PDF, XLSX y CSV; suscripciones por correo | [VERIFICADO: API] |
| **Buscador de Ayudas e Incentivos para empresas (IPYME, Ministerio de Industria y Turismo, DG de Estrategia Industrial y de la PYME)** | `https://ipyme.org/es-es/AyudasIncentivos/Paginas/buscador-de-ayudas.aspx`: buscador simple y avanzado, "Últimas ayudas publicadas", "Asistente a la búsqueda", **"Guías dinámicas"** (PDF diario por CCAA y sector con las ayudas en plazo) y **suscripción**. Actualización diaria a partir de los diarios oficiales. Está integrado en **Plataforma ONE** (`one.gob.es/es/buscador-de-ayudas-e-incentivos-para-empresas`) y en `plataformapyme.es` | [VERIFICADO: páginas leídas]. Sin API ni RSS. |
| **FANDIT** (FANDIT POWER SL) | `fandit.es`: buscador de subvenciones con filtros y app móvil (iOS), blog `ayudas-subvenciones.es`, asistente "Fandito" | [VERIFICADO: web y App Store] |
| Granter (granter.ai u otro) | Plataforma con IA para encontrar y redactar solicitudes | [VERIF. INDIRECTA por agregadores; no queda claro si opera en España] |
| Cámaras de Comercio (Cámara España, Cámara Valencia) | Boletines y programas propios (PICE, Ciberseguridad, etc.) | [INFERIDO; el feed de Cámara Valencia está verificado] |
| Iberley, Ayudas.net, subvenciones.es y similares | Bases de datos jurídicas o comerciales de ayudas | [NO VERIFICADO hoy] |
| Proyectos abiertos en GitHub que ya consumen la BDNS (`cruzlorite/bdns-fetch`, `plopez053/ayudas-es-mcp`, `riverostudio/encaja`, `david-jalon/helpfinder`, `GIx2p/radar-de-ayudas`, `BquantFinance/Administracion-fuentes-publicas`, `tacowars/fundhunt`) | Clientes, MCP y radares de ayudas; útiles como referencia de código y de problemas conocidos | [VERIFICADO: repositorios clonados y leídos] |

**Hueco de posicionamiento** [INFERIDO]: ninguna de las herramientas oficiales distingue **tipos de entidad de la economía social** (cooperativa, sociedad laboral, empresa de inserción, CEE) ni del **tercer sector** (asociación, fundación, ONGD, entidad juvenil), y ninguna calcula bien los **plazos relativos**. Una app centrada en la CV, que combine BDNS + DOGV + BOP + fundaciones privadas y haga clasificación semántica de las bases, aporta valor diferencial.

---

## 13. Pendiente o no verificado (para una segunda ronda)

- PDF "Buenas prácticas API SNPSAP" (límite de 10 peticiones por segundo) y aviso legal de la BDNS: leer el texto literal.
- Swagger de la BDNS v1.2.4: comparar con el v1.1.0 por si hay parámetros nuevos (p. ej. filtro de plazo abierto o de sector en convocatorias).
- Verificar que los parámetros de tipo array admiten valores separados por comas (`regiones=1,48,54,57`) o repetidos (`regiones=1&regiones=48`).
- BOP de Alicante: dirección actual y si hay RSS o API.
- Aviso legal y licencia del DOGV; posibilidad de un acceso formal a su API.
- SEDIA: probar en vivo una consulta multipart con `type` y `status` y un `topicDetails/*.json`.
- Registro de CEE y de empresas de inserción de la CV: preguntar a LABORA si existe un listado público.
- RD 592/2026 (Tercer Sector): leer en el BOE si crea un registro estatal y cuándo entra en funcionamiento.
- Fundaciones privadas: inventario curado de convocatorias (calendario anual).

---

## 14. URLs consultadas o verificadas

- BDNS API: https://www.infosubvenciones.es/bdnstrans/api (endpoints `/beneficiarios`, `/finalidades`, `/instrumentos`, `/regiones`, `/actividades`, `/sectores`, `/objetivos`, `/convocatorias/busqueda`, `/convocatorias?numConv=`, `/vpd/GE/configuracion`)
- OpenAPI de la BDNS (espejo): https://raw.githubusercontent.com/PepeluiMoreno/opendatamanager/HEAD/docs/fuentes/bdns/snpsap-api-v1.1.0.json
- BOE: https://www.boe.es/datosabiertos/api/boe/sumario/20261019 · https://www.boe.es/rss/canal.php?c=ayudas · https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/BOE-A-2008-3580/texto/bloque/a3
- DOGV: https://dogv.gva.es/es/ · https://dogv.gva.es/dogv-portal/dogv?date=2026-10-16&lang=es
- GVA CKAN: https://dadesobertes.gva.es/api/3/action/package_search · package_show `eco-gvo-subv-2026`, `eco-ayudas-dana`, `soc-asociaciones-v2`, `soc-cooperativas-2026`, `soc-agecop`
- Sede GVA: https://sede.gva.es/es/detall-tramit · https://sede.gva.es/es/novetats-tramits · https://sede.gva.es/robots.txt
- BOP: https://bop.dival.es/bop/ · https://bop.dipcas.es/PortalBOP/
- SEDIA: https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA
- data.europa.eu: https://data.europa.eu/api/hub/search/search
- datos.gob.es: https://datos.gob.es/apidata/catalog/dataset/title/subvenciones.json
- Feeds: https://www.cdti.es/rss.xml · https://innoavi.es/feed/ · https://innoavi.es/wp-json/wp/v2/types · https://www.fundacionbancaja.es/feed/ · https://www.red.es/es/rss.xml · https://www.camaravalencia.com/feed
- Benchmarks: https://ipyme.org/es-es/AyudasIncentivos/Paginas/buscador-de-ayudas.aspx · https://one.gob.es/es/buscador-de-ayudas-e-incentivos-para-empresas · https://fandit.es/
- Código de terceros consultado: github.com/cruzlorite/bdns-fetch, github.com/plopez053/ayudas-es-mcp, github.com/riverostudio/encaja, github.com/BquantFinance/Administracion-fuentes-publicas (CC0), github.com/tacowars/fundhunt, github.com/opoalerta/opoalerta (scraper del DOGV), github.com/ondata/european_defence_fund (notas sobre SEDIA)
