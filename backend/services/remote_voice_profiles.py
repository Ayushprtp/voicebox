"""Service for syncing voice profiles with the remote OmniVoice upstream.

The upstream at ``$VOICEBOX_REMOTE_TTS_URL`` (or its base, derived by stripping
``/v1/audio/speech``) exposes a persistent voice-profile surface:

- ``POST   /v1/voices/profiles`` — create (multipart: profile_id, ref_audio, ref_text?, overwrite?)
- ``GET    /v1/voices/profiles/{profile_id}`` — fetch
- ``PATCH  /v1/voices/profiles/{profile_id}`` — update ref_text
- ``DELETE /v1/voices/profiles/{profile_id}`` — delete

There is **no bulk list endpoint**. The service tracks the linkage on the
local profile (``remote_profile_id`` column) so the UI can show which local
profiles are synced, and offers a ``pull_from_remote`` helper for users who
know the upstream name.
"""

from __future__ import annotations

import io
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .. import config
from ..database import ProfileSample as DBProfileSample, VoiceProfile as DBVoiceProfile
from ..models import VoiceProfileResponse
from .profiles import (
    _profile_to_response,
)

logger = logging.getLogger(__name__)

PROFILE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
DEFAULT_TIMEOUT_SECONDS = 60.0


def _build_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    api_key = os.environ.get("VOICEBOX_REMOTE_TTS_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _profiles_base_url() -> str:
    """Derive the upstream profiles base URL from the configured remote TTS URL.

    The env var points at ``/v1/audio/speech``; we strip that suffix to get the
    API root. An explicit ``VOICEBOX_REMOTE_PROFILES_URL`` overrides.
    """
    explicit = os.environ.get("VOICEBOX_REMOTE_PROFILES_URL")
    if explicit:
        return explicit.rstrip("/")
    base = os.environ.get(
        "VOICEBOX_REMOTE_TTS_URL", "http://3.90.176.251:8000/v1/audio/speech"
    )
    parsed = urlparse(base)
    # Strip the path: keep scheme + netloc. The upstream's profile routes
    # live under /v1/voices/profiles on the same host.
    return f"{parsed.scheme}://{parsed.netloc}"


def validate_remote_profile_id(profile_id: str) -> None:
    if not PROFILE_ID_REGEX.match(profile_id):
        raise HTTPException(
            status_code=400,
            detail=(
                "remote_profile_id must match ^[a-zA-Z0-9_-]{1,64}$ — "
                "alphanumeric, dashes, underscores only, max 64 chars"
            ),
        )


def _ref_audio_for_profile(profile_id: str, db: Session) -> tuple[Path, str]:
    """Pick the first sample of a local cloned profile.

    Returns (absolute_path_to_audio_on_disk, reference_text). Raises 400 if the
    profile has no samples yet — push needs an audio file.
    """
    samples = db.query(DBProfileSample).filter_by(profile_id=profile_id).all()
    if not samples:
        raise HTTPException(
            status_code=400,
            detail=f"Local profile {profile_id} has no audio samples — record one first",
        )
    sample = samples[0]
    audio_path = config.resolve_storage_path(sample.audio_path)
    if audio_path is None or not audio_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Local sample audio file is missing on disk: {sample.audio_path}",
        )
    return Path(audio_path), sample.reference_text


async def push_local_to_remote(
    local_profile_id: str,
    remote_profile_id: str,
    db: Session,
    ref_text_override: Optional[str] = None,
    overwrite: bool = False,
) -> dict:
    """Upload a local profile's first sample to the upstream as a persistent profile.

    Stores the linkage on the local row's ``remote_profile_id`` column.
    """
    validate_remote_profile_id(remote_profile_id)

    profile = db.query(DBVoiceProfile).filter_by(id=local_profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail=f"Local profile {local_profile_id} not found")

    audio_path, default_ref_text = _ref_audio_for_profile(local_profile_id, db)
    ref_text = ref_text_override or default_ref_text

    url = f"{_profiles_base_url()}/v1/voices/profiles"
    timeout = float(os.environ.get("VOICEBOX_REMOTE_TTS_TIMEOUT", DEFAULT_TIMEOUT_SECONDS))
    headers = _build_headers()

    logger.info(
        "Pushing local profile %s (%s) to upstream as %s",
        local_profile_id,
        profile.name,
        remote_profile_id,
    )

    with open(audio_path, "rb") as f:
        files = {"ref_audio": (audio_path.name, f, "audio/wav")}
        data = {"profile_id": remote_profile_id, "overwrite": "true" if overwrite else "false"}
        if ref_text:
            data["ref_text"] = ref_text
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.post(url, data=data, files=files, headers=headers)
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail=f"Upstream unreachable: {exc}") from exc

    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Upstream rejected push: {detail}",
        )

    # Persist the linkage.
    profile.remote_profile_id = remote_profile_id
    profile.updated_at = __import__("datetime").datetime.utcnow()
    db.commit()
    db.refresh(profile)

    body: dict = {}
    try:
        body = response.json()
    except Exception:
        body = {"raw": response.text}

    return {
        "local_profile_id": local_profile_id,
        "remote_profile_id": remote_profile_id,
        "upstream": body,
    }


async def get_remote_profile(remote_profile_id: str) -> dict:
    """Proxy GET /v1/voices/profiles/{id} upstream."""
    validate_remote_profile_id(remote_profile_id)
    url = f"{_profiles_base_url()}/v1/voices/profiles/{remote_profile_id}"
    timeout = float(os.environ.get("VOICEBOX_REMOTE_TTS_TIMEOUT", DEFAULT_TIMEOUT_SECONDS))
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.get(url, headers=_build_headers())
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Upstream unreachable: {exc}") from exc
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Remote profile '{remote_profile_id}' not found")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Upstream error: {response.text.strip() or response.reason_phrase}",
        )
    return response.json()


async def update_remote_profile_ref_text(remote_profile_id: str, ref_text: Optional[str]) -> dict:
    """Proxy PATCH /v1/voices/profiles/{id} upstream (ref_text only).

    The upstream's PATCH endpoint accepts form-encoded or multipart bodies,
    not JSON — verified live. We send form-encoded for simplicity.
    """
    validate_remote_profile_id(remote_profile_id)
    url = f"{_profiles_base_url()}/v1/voices/profiles/{remote_profile_id}"
    timeout = float(os.environ.get("VOICEBOX_REMOTE_TTS_TIMEOUT", DEFAULT_TIMEOUT_SECONDS))
    data: dict = {}
    if ref_text is not None:
        data["ref_text"] = ref_text
    if not data:
        raise HTTPException(
            status_code=400,
            detail="No fields to update — supply ref_text",
        )
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.patch(url, data=data, headers=_build_headers())
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Upstream unreachable: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Upstream error: {response.text.strip() or response.reason_phrase}",
        )
    try:
        return response.json()
    except Exception:
        return {"raw": response.text}


async def delete_remote_profile(remote_profile_id: str, db: Session) -> dict:
    """DELETE upstream AND clear the linkage on any local profile that pointed to it."""
    validate_remote_profile_id(remote_profile_id)
    url = f"{_profiles_base_url()}/v1/voices/profiles/{remote_profile_id}"
    timeout = float(os.environ.get("VOICEBOX_REMOTE_TTS_TIMEOUT", DEFAULT_TIMEOUT_SECONDS))
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.delete(url, headers=_build_headers())
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Upstream unreachable: {exc}") from exc
    # Upstream returns 200/204 with empty body — both are success.
    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Upstream error: {response.text.strip() or response.reason_phrase}",
        )

    # Clear linkage on any local profile that was pointing at it.
    linked = db.query(DBVoiceProfile).filter_by(remote_profile_id=remote_profile_id).all()
    for p in linked:
        p.remote_profile_id = None
    if linked:
        import datetime as _dt
        for p in linked:
            p.updated_at = _dt.datetime.utcnow()
        db.commit()

    return {
        "remote_profile_id": remote_profile_id,
        "deleted": True,
        "unlinked_local_profiles": len(linked),
    }


async def pull_remote_to_local(
    remote_profile_id: str,
    local_profile_name: str,
    db: Session,
    language: str = "en",
    ref_text_override: Optional[str] = None,
) -> VoiceProfileResponse:
    """Pull a remote profile into the local DB.

    The OmniVoice upstream exposes GET /v1/voices/profiles/{id} as **metadata
    only** — it does NOT serve the ref audio bytes back. Probed live on
    2026-06-06: GET returns ``application/json`` (164 B), not audio; every
    plausible ``/audio``, ``/ref_audio``, ``/wav`` subpath returns 404.

    This is a fundamental limitation of the upstream — until they add an
    audio-download endpoint, ``remote_profile_id`` can only be *written*
    from Voicebox, not read. This function therefore returns a 501 with a
    clear error message and a suggested workaround (push from a machine
    that has the original audio).
    """
    raise HTTPException(
        status_code=501,
        detail=(
            f"Cannot pull remote profile '{remote_profile_id}': the OmniVoice "
            "upstream does not expose a ref-audio download endpoint (GET "
            "/v1/voices/profiles/{id} returns metadata only). "
            "Workaround: open this profile on a machine that already has the "
            "original audio, and push it from there."
        ),
    )
