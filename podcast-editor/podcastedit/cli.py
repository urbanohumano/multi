"""Interfaz de línea de comandos de podcastedit."""

from __future__ import annotations

import argparse
import os
import sys

from . import __version__
from .assemble import MusicOptions, build_assembly_graph
from .enhance import ENHANCE_LEVELS, AudioFormat, build_voice_graph
from .ffmpeg_utils import find_binary, probe_duration, require_ffmpeg, run, FFmpegError

FORMATS = {
    "mp3": {"ext": "mp3", "codec": "libmp3lame", "bitrate": True},
    "m4a": {"ext": "m4a", "codec": "aac", "bitrate": True},
    "wav": {"ext": "wav", "codec": "pcm_s16le", "bitrate": False},
}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="podcast-edit",
        description=(
            "Edita automáticamente audio para podcasts: mejora la voz y añade "
            "música de intro/outro con fundidos suaves."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("inputs", nargs="+", help="Archivo(s) de voz. Si das varios, se unen en orden.")
    p.add_argument("-o", "--output", required=True, help="Archivo de salida.")

    music = p.add_argument_group("música")
    music.add_argument("--intro", help="Archivo de música para la intro.")
    music.add_argument("--outro", help="Archivo de música para la outro.")
    music.add_argument("--intro-duration", type=float, default=6.0, help="Segundos de intro.")
    music.add_argument("--outro-duration", type=float, default=8.0, help="Segundos de outro.")
    music.add_argument("--crossfade", type=float, default=3.0, help="Segundos de fundido voz/música.")
    music.add_argument("--music-gain", type=float, default=-8.0, help="Ganancia de la música en dB (relativa a la voz).")

    enh = p.add_argument_group("mejora de voz")
    enh.add_argument("--enhance", choices=list(ENHANCE_LEVELS), default="standard", help="Nivel de mejora.")
    enh.add_argument("--no-normalize", action="store_true", help="No normalizar loudness.")
    enh.add_argument("--target-lufs", type=float, default=-16.0, help="Loudness objetivo (LUFS).")

    out = p.add_argument_group("salida")
    out.add_argument("--format", choices=list(FORMATS), help="Formato de salida (por defecto se infiere de la extensión, o mp3).")
    out.add_argument("--bitrate", default="192k", help="Bitrate para mp3/m4a.")
    out.add_argument("--sample-rate", type=int, default=44100, help="Frecuencia de muestreo.")
    out.add_argument("--mono", action="store_true", help="Salida en mono.")
    out.add_argument("--title", help="Metadato: título.")
    out.add_argument("--artist", help="Metadato: artista/autor.")
    out.add_argument("--album", help="Metadato: álbum/podcast.")

    misc = p.add_argument_group("otros")
    misc.add_argument("-v", "--verbose", action="store_true", help="Mostrar comandos ffmpeg.")
    misc.add_argument("--dry-run", action="store_true", help="Mostrar el comando sin ejecutarlo.")
    misc.add_argument("-y", "--overwrite", action="store_true", help="Sobrescribir la salida sin preguntar.")
    misc.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return p


def resolve_format(args) -> dict:
    if args.format:
        name = args.format
    else:
        ext = os.path.splitext(args.output)[1].lower().lstrip(".")
        name = ext if ext in FORMATS else "mp3"
    return {"name": name, **FORMATS[name]}


def clamp_music(args, ffprobe: str | None) -> None:
    """Ajusta duraciones/crossfade a la longitud real de la música si se conoce."""
    if not ffprobe:
        return
    for path, attr in ((args.intro, "intro_duration"), (args.outro, "outro_duration")):
        if not path:
            continue
        dur = probe_duration(ffprobe, path)
        if dur is None:
            continue
        if getattr(args, attr) > dur:
            setattr(args, attr, round(dur, 2))
    longest_segment = min(
        d for d in (args.intro_duration if args.intro else None,
                    args.outro_duration if args.outro else None) if d is not None
    ) if (args.intro or args.outro) else None
    if longest_segment is not None and args.crossfade >= longest_segment:
        args.crossfade = max(0.2, longest_segment / 2)


def build_command(args, ffmpeg: str, fmt_info: dict) -> list[str]:
    fmt = AudioFormat(sample_rate=args.sample_rate, mono=args.mono)
    n_voice = len(args.inputs)

    voice_fc, voice_label = build_voice_graph(
        n_voice,
        args.enhance,
        fmt,
        normalize=not args.no_normalize,
        target_lufs=args.target_lufs,
    )

    intro_idx = n_voice if args.intro else None
    outro_idx = (n_voice + (1 if args.intro else 0)) if args.outro else None

    asm_fc, out_label = build_assembly_graph(
        voice_label,
        fmt,
        MusicOptions(
            intro_path=args.intro,
            outro_path=args.outro,
            intro_duration=args.intro_duration,
            outro_duration=args.outro_duration,
            crossfade=args.crossfade,
            music_gain_db=args.music_gain,
        ),
        voice_input_index=0,
        intro_input_index=intro_idx,
        outro_input_index=outro_idx,
    )

    filter_complex = f"{voice_fc};{asm_fc}"

    cmd = [ffmpeg, "-hide_banner"]
    if args.overwrite:
        cmd.append("-y")
    else:
        cmd.append("-n")
    for inp in args.inputs:
        cmd += ["-i", inp]
    if args.intro:
        cmd += ["-i", args.intro]
    if args.outro:
        cmd += ["-i", args.outro]

    cmd += ["-filter_complex", filter_complex, "-map", f"[{out_label}]"]
    cmd += ["-c:a", fmt_info["codec"]]
    if fmt_info["bitrate"]:
        cmd += ["-b:a", args.bitrate]
    cmd += ["-ar", str(args.sample_rate)]
    cmd += ["-ac", "1" if args.mono else "2"]

    for tag, value in (("title", args.title), ("artist", args.artist), ("album", args.album)):
        if value:
            cmd += ["-metadata", f"{tag}={value}"]

    cmd.append(args.output)
    return cmd


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    for inp in args.inputs:
        if not os.path.isfile(inp):
            sys.exit(f"ERROR: no existe el archivo de entrada: {inp}")
    for label, path in (("intro", args.intro), ("outro", args.outro)):
        if path and not os.path.isfile(path):
            sys.exit(f"ERROR: no existe el archivo de {label}: {path}")
    if not args.overwrite and os.path.exists(args.output):
        sys.exit(f"ERROR: la salida ya existe: {args.output} (usa -y para sobrescribir)")

    fmt_info = resolve_format(args)

    if args.dry_run:
        ffmpeg = find_binary("ffmpeg") or "ffmpeg"
        ffprobe = find_binary("ffprobe")
    else:
        ffmpeg, ffprobe = require_ffmpeg()

    clamp_music(args, ffprobe)
    cmd = build_command(args, ffmpeg, fmt_info)

    if args.dry_run:
        print(" ".join(_q(a) for a in cmd))
        return 0

    print(f"Procesando {len(args.inputs)} pista(s) de voz...")
    try:
        run(cmd, verbose=args.verbose)
    except FFmpegError as e:
        sys.exit(str(e))
    print(f"Listo: {args.output}")
    return 0


def _q(a: str) -> str:
    return f"'{a}'" if any(c in a for c in " ;[]") else a


if __name__ == "__main__":
    raise SystemExit(main())
