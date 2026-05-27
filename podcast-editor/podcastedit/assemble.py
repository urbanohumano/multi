"""Ensamblado de la pista de voz con música de intro y outro."""

from __future__ import annotations

from dataclasses import dataclass

from .enhance import AudioFormat


@dataclass
class MusicOptions:
    intro_path: str | None = None
    outro_path: str | None = None
    intro_duration: float = 6.0
    outro_duration: float = 8.0
    crossfade: float = 3.0
    music_gain_db: float = -8.0


def _music_branch(
    input_index: int,
    duration: float,
    fmt: AudioFormat,
    gain_db: float,
    *,
    fade_in: bool,
    fade_out: bool,
    label: str,
) -> str:
    chain = [
        f"atrim=0:{duration:g}",
        "asetpts=PTS-STARTPTS",
        fmt.aformat(),
        f"volume={gain_db:g}dB",
    ]
    if fade_in:
        chain.append("afade=t=in:st=0:d=0.8")
    if fade_out:
        fade_dur = 1.5
        start = max(0.0, duration - fade_dur)
        chain.append(f"afade=t=out:st={start:g}:d={fade_dur:g}")
    return f"[{input_index}:a]{','.join(chain)}[{label}]"


def build_assembly_graph(
    voice_label: str,
    fmt: AudioFormat,
    opts: MusicOptions,
    *,
    voice_input_index: int = 0,
    intro_input_index: int | None = None,
    outro_input_index: int | None = None,
) -> tuple[str, str]:
    """Construye el filter_complex que une voz + intro/outro.

    La voz se rellena con silencio (= duración del crossfade) en los extremos
    que llevan música, de modo que el fundido ocurre sobre ese silencio y nunca
    recorta palabras reales.
    """
    has_intro = intro_input_index is not None
    has_outro = outro_input_index is not None
    cf = opts.crossfade

    parts: list[str] = []

    # Relleno de silencio en la voz según qué extremos llevan música.
    pad = []
    if has_intro:
        pad.append(f"adelay={int(cf * 1000)}:all=1")
    if has_outro:
        pad.append(f"apad=pad_dur={cf:g}")
    if pad:
        parts.append(f"[{voice_label}]{','.join(pad)}[voicepad]")
        voice = "voicepad"
    else:
        voice = voice_label

    if has_intro:
        parts.append(
            _music_branch(
                intro_input_index,
                opts.intro_duration,
                fmt,
                opts.music_gain_db,
                fade_in=True,
                fade_out=False,
                label="intro",
            )
        )
    if has_outro:
        parts.append(
            _music_branch(
                outro_input_index,
                opts.outro_duration,
                fmt,
                opts.music_gain_db,
                fade_in=False,
                fade_out=True,
                label="outro",
            )
        )

    xfade = f"acrossfade=d={cf:g}:c1=tri:c2=tri"
    if has_intro and has_outro:
        parts.append(f"[intro][{voice}]{xfade}[iv]")
        parts.append(f"[iv][outro]{xfade}[mixed]")
        mixed = "mixed"
    elif has_intro:
        parts.append(f"[intro][{voice}]{xfade}[mixed]")
        mixed = "mixed"
    elif has_outro:
        parts.append(f"[{voice}][outro]{xfade}[mixed]")
        mixed = "mixed"
    else:
        mixed = voice

    # Limitador final para evitar recortes (clipping) en el máster.
    parts.append(f"[{mixed}]alimiter=limit=0.95[out]")
    return ";".join(parts), "out"
