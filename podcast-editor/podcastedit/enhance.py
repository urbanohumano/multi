"""Construcción de la cadena de filtros de mejora de voz."""

from __future__ import annotations

from dataclasses import dataclass

# Niveles de mejora -> parámetros del denoiser FFT (afftdn) y de-esser.
# nr = reducción de ruido en dB; mayor = más agresivo (más riesgo de artefactos).
ENHANCE_LEVELS: dict[str, dict] = {
    "none": {},
    "light": {"highpass": 70, "denoise_nr": 6, "compress": True, "deess": False},
    "standard": {"highpass": 80, "denoise_nr": 12, "compress": True, "deess": False},
    "strong": {"highpass": 90, "denoise_nr": 21, "compress": True, "deess": True},
}


@dataclass
class AudioFormat:
    sample_rate: int = 44100
    mono: bool = False

    @property
    def channel_layout(self) -> str:
        return "mono" if self.mono else "stereo"

    def aformat(self) -> str:
        return (
            f"aformat=sample_fmts=fltp:sample_rates={self.sample_rate}"
            f":channel_layouts={self.channel_layout}"
        )


def voice_filters(level: str, fmt: AudioFormat) -> list[str]:
    """Filtros aplicados a cada segmento de voz (antes de concatenar)."""
    cfg = ENHANCE_LEVELS[level]
    chain = [fmt.aformat()]
    if not cfg:  # nivel "none": solo formato uniforme
        return chain
    chain.append(f"highpass=f={cfg['highpass']}")
    if cfg["denoise_nr"]:
        chain.append(f"afftdn=nr={cfg['denoise_nr']}:nf=-25:tn=1")
    if cfg.get("deess"):
        chain.append("deesser=i=0.4")
    if cfg["compress"]:
        chain.append(
            "acompressor=threshold=-18dB:ratio=3:attack=15:release=200:detection=rms"
        )
    return chain


def build_voice_graph(
    n_inputs: int,
    level: str,
    fmt: AudioFormat,
    *,
    normalize: bool,
    target_lufs: float,
) -> tuple[str, str]:
    """Devuelve (filter_complex, label_salida) para producir la pista de voz.

    Aplica la mejora a cada entrada, concatena todas en orden y, si procede,
    normaliza el loudness del conjunto a `target_lufs`.
    """
    filters = ",".join(voice_filters(level, fmt))
    parts: list[str] = []
    seg_labels: list[str] = []
    for i in range(n_inputs):
        label = f"v{i}"
        parts.append(f"[{i}:a]{filters}[{label}]")
        seg_labels.append(f"[{label}]")

    if n_inputs > 1:
        joined = "".join(seg_labels)
        parts.append(f"{joined}concat=n={n_inputs}:v=0:a=1[cat]")
        current = "cat"
    else:
        current = "v0"

    if normalize:
        parts.append(
            f"[{current}]loudnorm=I={target_lufs}:TP=-1.5:LRA=11[voiceout]"
        )
        current = "voiceout"

    return ";".join(parts), current
