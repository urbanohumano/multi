# podcast-edit

Edición **automática** de audio para podcasts en Linux. A partir de tu
grabación de voz:

- **Mejora la calidad**: filtro pasa-altos (quita rumble/zumbido), reducción de
  ruido (denoise FFT), opcional de-esser, compresión para nivelar el volumen y
  **normalización de loudness** al estándar de podcast (-16 LUFS).
- **Añade música de intro y outro** con fundidos suaves (crossfade), sin cortar
  tus palabras.
- **Une varias grabaciones** en un solo episodio.
- Exporta a **MP3 / M4A / WAV** con metadatos (título, autor, álbum).

Está construido sobre `ffmpeg`, así que no necesita librerías de audio pesadas.

## Requisitos

- Python 3.10+
- `ffmpeg` y `ffprobe` en el PATH:
  - Debian/Ubuntu: `sudo apt install ffmpeg`
  - Fedora: `sudo dnf install ffmpeg`
  - Arch: `sudo pacman -S ffmpeg`

## Instalación

```bash
cd podcast-editor
pip install .          # instala el comando `podcast-edit`
```

O sin instalar nada (desde la carpeta `podcast-editor`):

```bash
python3 -m podcastedit ...
```

## Uso rápido

```bash
podcast-edit grabacion.wav \
  --intro intro.mp3 \
  --outro outro.mp3 \
  --title "Episodio 1" --artist "Mi Podcast" \
  -o episodio1.mp3
```

Unir varias tomas en un episodio (se concatenan en orden):

```bash
podcast-edit parte1.wav parte2.wav parte3.wav --intro intro.mp3 -o episodio.mp3
```

Solo mejorar la voz, sin música:

```bash
podcast-edit entrevista.wav --enhance strong -o entrevista_limpia.mp3
```

Ver el comando ffmpeg sin ejecutarlo:

```bash
podcast-edit voz.wav --intro intro.mp3 -o out.mp3 --dry-run
```

## Opciones principales

| Opción | Por defecto | Descripción |
|---|---|---|
| `--intro FILE` / `--outro FILE` | — | Música de intro / outro |
| `--intro-duration` / `--outro-duration` | 6 / 8 s | Segundos de música usados |
| `--crossfade` | 3 s | Fundido entre música y voz |
| `--music-gain` | -8 dB | Volumen de la música relativo a la voz |
| `--enhance {none,light,standard,strong}` | standard | Intensidad de la mejora de voz |
| `--no-normalize` | — | No normalizar loudness |
| `--target-lufs` | -16 | Loudness objetivo (estándar de podcast) |
| `--format {mp3,m4a,wav}` | (según extensión) | Formato de salida |
| `--bitrate` | 192k | Bitrate para mp3/m4a |
| `--mono` | — | Salida en mono (episodios de solo voz) |
| `--title/--artist/--album` | — | Metadatos del archivo |
| `-y` | — | Sobrescribir la salida |

### Niveles de mejora

- `none`: sin procesado (solo formato uniforme).
- `light`: pasa-altos suave + denoise ligero + compresión.
- `standard` (recomendado): pasa-altos 80 Hz + denoise medio + compresión.
- `strong`: más denoise + de-esser (para grabaciones ruidosas o con mucha "s").

## ¿No tienes música de intro todavía?

Puedes generar tonos de prueba con ffmpeg para probar el flujo:

```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=10" intro.mp3
ffmpeg -f lavfi -i "sine=frequency=330:duration=10" outro.mp3
```

(Para publicar, usa música con licencia adecuada.)

## Cómo funciona

1. Cada pista de voz pasa por: `highpass → afftdn (denoise) → [deesser] →
   acompressor`, luego se concatenan todas y se aplica `loudnorm`.
2. La voz se rellena con silencio (igual a la duración del crossfade) en los
   extremos que llevan música, para que el fundido ocurra sobre el silencio y
   **nunca recorte palabras**.
3. La intro/outro se recortan a la duración pedida, se les ajusta volumen y
   fundidos, y se unen con la voz mediante `acrossfade`.
4. Un `alimiter` final evita recortes (clipping) en el máster.

Todo en una sola llamada a `ffmpeg`.
