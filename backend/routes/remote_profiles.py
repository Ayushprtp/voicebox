"""Routes for syncing voice profiles with the remote OmniVoice upstream.

The upstream has no list endpoint, so this router returns the synthesised
catalogue — local profiles that have ``remote_profile_id`` set — rather than
a full list of everything on the server. Pull-by-name is supported for
remote-only profiles.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..database import VoiceProfile as DBVoiceProfile, get_db
from ..services import remote_voice_profiles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/remote-profiles", tags=["remote-profiles"])


@router.get("")
async def list_remote_profiles(db: Session = Depends(get_db)) -> dict:
    """List local profiles that are linked to a remote persistent profile.

    The upstream has no list endpoint, so this is the closest we can get:
    the set of local profiles whose ``remote_profile_id`` column is set.
    To pull a remote-only profile, the user types the name into the
    pull-from-remote form.
    """
    rows = (
        db.query(DBVoiceProfile)
        .filter(DBVoiceProfile.remote_profile_id.isnot(None))
        .all()
    )
    items = [
        {
            "local_profile_id": p.id,
            "local_profile_name": p.name,
            "remote_profile_id": p.remote_profile_id,
            "language": p.language,
            "default_engine": p.default_engine,
        }
        for p in rows
    ]
    return {"items": items, "total": len(items)}


@router.post("")
async def push_remote_profile(
    data: models.RemoteProfilePushRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Push a local profile's first sample to the upstream."""
    return await remote_voice_profiles.push_local_to_remote(
        local_profile_id=data.local_profile_id,
        remote_profile_id=data.remote_profile_id,
        db=db,
        ref_text_override=data.ref_text,
        overwrite=data.overwrite,
    )


@router.post("/from-remote", response_model=models.VoiceProfileResponse)
async def pull_remote_profile(
    data: models.RemoteProfilePullRequest,
    db: Session = Depends(get_db),
):
    """Pull a remote profile's ref audio into the local DB as a new cloned profile."""
    return await remote_voice_profiles.pull_remote_to_local(
        remote_profile_id=data.remote_profile_id,
        local_profile_name=data.local_profile_name,
        db=db,
        language=data.language,
        ref_text_override=data.ref_text,
    )


@router.get("/{remote_profile_id}")
async def get_remote_profile(remote_profile_id: str) -> dict:
    """Fetch a remote profile's metadata from the upstream."""
    return await remote_voice_profiles.get_remote_profile(remote_profile_id)


@router.patch("/{remote_profile_id}")
async def update_remote_profile(
    remote_profile_id: str,
    data: models.RemoteProfileUpdateRequest,
) -> dict:
    """Update a remote profile's ref_text upstream."""
    return await remote_voice_profiles.update_remote_profile_ref_text(
        remote_profile_id, data.ref_text
    )


@router.delete("/{remote_profile_id}")
async def delete_remote_profile(
    remote_profile_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Delete a remote profile upstream and clear the linkage on any local profile."""
    return await remote_voice_profiles.delete_remote_profile(remote_profile_id, db)
