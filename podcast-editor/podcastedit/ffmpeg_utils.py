"""Utilidades para localizar y ejecutar ffmpeg/ffprobe."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys


class FFmpegError(RuntimeError):
    """Error al ejecutar ffmpeg o ffprobe."""


def find_binary(name: str) -> str | None:
    return shutil.which(name)


def require_ffmpeg() -> tuple[str, str]:
    """Devuelve (ffmpeg, ffprobe) o aborta con instrucciones de instalación."""
    ffmpeg = find_binary("ffmpeg")
    ffprobe = find_binary("ffprobe")
    if not ffmpeg or not ffprobe:
        sys.exit(
            "ERROR: no se encontró ffmpeg/ffprobe en el PATH.\n"
            "Instálalo según tu distribución:\n"
            "  Debian/Ubuntu : sudo apt install ffmpeg\n"
            "  Fedora        : sudo dnf install ffmpeg\n"
            "  Arch          : sudo pacman -S ffmpeg\n"
        )
    return ffmpeg, ffprobe


def probe_duration(ffprobe: str, path: str) -> float | None:
    """Duración en segundos del primer stream de audio, o None si falla."""
    try:
        out = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                path,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        data = json.loads(out.stdout)
        return float(data["format"]["duration"])
    except (subprocess.CalledProcessError, KeyError, ValueError, json.JSONDecodeError):
        return None


def run(ffmpeg_cmd: list[str], *, verbose: bool = False) -> None:
    """Ejecuta un comando ffmpeg, propagando errores legibles."""
    if verbose:
        print("$ " + " ".join(_quote(a) for a in ffmpeg_cmd))
    proc = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = "\n".join(proc.stderr.strip().splitlines()[-25:])
        raise FFmpegError(f"ffmpeg falló (código {proc.returncode}):\n{tail}")


def _quote(arg: str) -> str:
    if any(c in arg for c in " \t\"'"):
        return "'" + arg.replace("'", "'\\''") + "'"
    return arg
