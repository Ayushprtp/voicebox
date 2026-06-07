"""Remote OpenAI-compatible TTS backend.

This backend delegates speech synthesis to an OpenAI-style
``/v1/audio/speech`` endpoint and adapts the returned audio bytes to the
existing Voicebox ``TTSBackend`` protocol.

Two engines share this module:

- ``RemoteOpenAITTSBackend`` (engine ``"remote_tts"``) — preset-voice
  synthesis via ``POST /v1/audio/speech``. Accepts the upstream's
  ``voice`` parameter (one of 15 named presets, ``auto``, or a free-form
  ``design:<attributes>`` string).
- ``RemoteOpenAITTSCloneBackend`` (engine ``"remote_tts_clone"``) — one-shot
  voice cloning via ``POST /v1/audio/speech/clone``. Takes a reference
  audio file and its transcript, returns audio in the cloned voice.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

import httpx
import numpy as np

from ..utils.audio import load_audio
from .base import combine_voice_prompts as _combine_voice_prompts

REMOTE_TTS_DEFAULT_URL = "http://3.90.176.251:8000/v1/audio/speech"
REMOTE_TTS_CLONE_DEFAULT_URL = "http://3.90.176.251:8000/v1/audio/speech/clone"

# Model ids accepted on the upstream's ``model`` field for both endpoints.
REMOTE_TTS_MODELS = {"tts-1", "tts-1-hd", "omnivoice"}

# Voice id prefix for free-form voice design (e.g. "design:female,young adult,high pitch,indian accent").
REMOTE_TTS_VOICE_DESIGN_PREFIX = "design:"

# Full preset catalogue exposed by the upstream's /v1/voices. The first
# entry's voice_id is the canonical id; the rest are display metadata.
REMOTE_TTS_VOICES = [
    # Preset voices
    ("alloy", "Alloy", "female", "en"),
    ("ash", "Ash", "male", "en"),
    ("ballad", "Ballad", "male", "en"),
    ("cedar", "Cedar", "male", "en"),
    ("coral", "Coral", "female", "en"),
    ("echo", "Echo", "male", "en"),
    ("fable", "Fable", "female", "en"),
    ("marin", "Marin", "female", "en"),
    ("nova", "Nova", "female", "en"),
    ("onyx", "Onyx", "male", "en"),
    ("sage", "Sage", "female", "en"),
    ("shimmer", "Shimmer", "female", "en"),
    ("verse", "Verse", "male", "en"),
    # Auto-fallback
    ("auto", "Auto", "neutral", "en"),
    # Free-form design: voice_id is the literal prefix; the user supplies
    # the attributes after the colon. Listed so the picker can show a
    # "Design voice…" hint.
    (REMOTE_TTS_VOICE_DESIGN_PREFIX, "Design (custom attributes)", "neutral", "en"),
]

# Mirror set used by services/profiles.py's _get_preset_voice_ids for
# validation of voice_type=preset profiles. Excludes the design entry
# because its value is parameterised.
REMOTE_TTS_VOICE_IDS = {voice_id for voice_id, *_ in REMOTE_TTS_VOICES}


def _is_valid_remote_voice(voice: str) -> bool:
    """Accept a known preset id, ``auto``, or any ``design:...`` string."""
    if voice in REMOTE_TTS_VOICE_IDS:
        return True
    if voice == "auto":
        return True
    if voice.startswith(REMOTE_TTS_VOICE_DESIGN_PREFIX):
        return True
    return False


def _suffix_for_content_type(content_type: str) -> str:
    normalized = content_type.split(";", 1)[0].strip().lower()
    if normalized in {"audio/wav", "audio/x-wav", "audio/wave"}:
        return ".wav"
    if normalized in {"audio/ogg", "application/ogg"}:
        return ".ogg"
    if normalized == "audio/flac":
        return ".flac"
    if normalized in {"audio/mpeg", "audio/mp3"}:
        return ".mp3"
    return ".wav"


def _build_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = os.environ.get("VOICEBOX_REMOTE_TTS_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


async def _post_speech(
    endpoint: str,
    payload: dict,
    headers: dict,
    timeout: float,
) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(endpoint, json=payload, headers=headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = response.text.strip() or exc.response.reason_phrase
            raise RuntimeError(f"Remote TTS request failed: {detail}") from exc
    return response.content, response.headers.get("content-type", "")


async def _post_clone(
    endpoint: str,
    text: str,
    ref_audio_path: str,
    ref_text: Optional[str],
    language: Optional[str],
    timeout: float,
) -> tuple[bytes, str]:
    headers: dict[str, str] = {}
    api_key = os.environ.get("VOICEBOX_REMOTE_TTS_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    ref_path = Path(ref_audio_path)
    if not ref_path.is_file():
        raise FileNotFoundError(f"Reference audio not found: {ref_audio_path}")

    data: dict[str, str] = {"text": text}
    if ref_text:
        data["ref_text"] = ref_text
    if language:
        data["language"] = language

    async with httpx.AsyncClient(timeout=timeout) as client:
        with open(ref_path, "rb") as f:
            files = {"ref_audio": (ref_path.name, f, "audio/wav")}
            response = await client.post(endpoint, data=data, files=files, headers=headers)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = response.text.strip() or exc.response.reason_phrase
            raise RuntimeError(f"Remote TTS clone request failed: {detail}") from exc
    return response.content, response.headers.get("content-type", "")


class RemoteOpenAITTSBackend:
    """TTS backend for OpenAI-compatible remote speech APIs (preset voices)."""

    def __init__(self) -> None:
        self.model_size = "tts-1"

    async def load_model(self, model_size: str = "tts-1") -> None:
        """Select the remote model. No local weights are loaded."""
        if model_size not in REMOTE_TTS_MODELS:
            raise ValueError(f"Unknown remote TTS model: {model_size}")
        self.model_size = model_size

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        """Remote TTS preset engine has no cloned-voice path."""
        raise ValueError("Remote TTS (preset engine) only supports built-in preset voices")

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        """Remote TTS preset engine has no cloned-voice path."""
        raise ValueError("Remote TTS (preset engine) only supports built-in preset voices")

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: Optional[int] = None,
        instruct: Optional[str] = None,
    ) -> tuple[np.ndarray, int]:
        """Generate speech through the configured remote API."""
        voice = voice_prompt.get("preset_voice_id") or "alloy"
        if not _is_valid_remote_voice(voice):
            raise ValueError(f"Unknown remote TTS voice: {voice}")

        endpoint = os.environ.get("VOICEBOX_REMOTE_TTS_URL", REMOTE_TTS_DEFAULT_URL)
        timeout = float(os.environ.get("VOICEBOX_REMOTE_TTS_TIMEOUT", "120"))
        headers = _build_headers()

        payload = {
            "model": self.model_size,
            "input": text,
            "voice": voice,
            "response_format": "wav",
        }
        if language:
            payload["language"] = language

        content, content_type = await _post_speech(endpoint, payload, headers, timeout)

        suffix = _suffix_for_content_type(content_type)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            audio, sample_rate = load_audio(tmp_path, sample_rate=24000, mono=True)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        return audio.astype(np.float32), sample_rate

    def unload_model(self) -> None:
        """No-op: remote backend has no local model state."""

    def is_loaded(self) -> bool:
        """Remote models are always available if the endpoint is reachable."""
        return True

    def _get_model_path(self, model_size: str) -> str:
        return f"remote://{model_size}"

    def _is_model_cached(self, model_size: str = "tts-1") -> bool:
        return model_size in REMOTE_TTS_MODELS


class RemoteOpenAITTSCloneBackend:
    """TTS backend for the upstream's ``/v1/audio/speech/clone`` endpoint.

    Takes a reference audio + reference text via the cloned-voice profile
    flow and produces speech in the cloned voice.
    """

    def __init__(self) -> None:
        self.model_size = "default"

    async def load_model(self, model_size: str = "default") -> None:
        """No local weights — accepts any model_size but ignores it."""
        self.model_size = model_size

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> tuple[dict, bool]:
        """Build a voice-prompt dict pointing at the on-disk reference audio.

        The reference bytes are read at generation time (not prompt time) so
        chunked TTS doesn't re-upload the same file on every chunk.
        """
        return (
            {
                "voice_type": "cloned",
                "ref_audio_path": str(Path(audio_path).resolve()),
                "ref_text": reference_text,
            },
            False,
        )

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> tuple[np.ndarray, str]:
        """Concatenate reference samples into a single prompt locally."""
        return await _combine_voice_prompts(audio_paths, reference_texts, sample_rate=24000)

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: Optional[int] = None,
        instruct: Optional[str] = None,
    ) -> tuple[np.ndarray, int]:
        """Generate cloned speech through the upstream's clone endpoint."""
        ref_audio_path = voice_prompt.get("ref_audio_path")
        if not ref_audio_path:
            raise ValueError(
                "remote_tts_clone voice_prompt missing 'ref_audio_path' — was this profile built with the remote_tts_clone engine?"
            )
        ref_text = voice_prompt.get("ref_text") or ""

        endpoint = os.environ.get("VOICEBOX_REMOTE_TTS_CLONE_URL", REMOTE_TTS_CLONE_DEFAULT_URL)
        timeout = float(os.environ.get("VOICEBOX_REMOTE_TTS_TIMEOUT", "300"))

        content, content_type = await _post_clone(
            endpoint=endpoint,
            text=text,
            ref_audio_path=ref_audio_path,
            ref_text=ref_text or None,
            language=language,
            timeout=timeout,
        )

        suffix = _suffix_for_content_type(content_type)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            audio, sample_rate = load_audio(tmp_path, sample_rate=24000, mono=True)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        return audio.astype(np.float32), sample_rate

    def unload_model(self) -> None:
        """No-op: clone backend has no local state."""

    def is_loaded(self) -> bool:
        """Clone engine is always available if the endpoint is reachable."""
        return True

    def _get_model_path(self, model_size: str) -> str:
        return "remote://clone"

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return True
