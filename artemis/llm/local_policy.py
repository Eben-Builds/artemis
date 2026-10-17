"""Fail-closed local-only selection for the Lumi engineering profile.

This is a routing boundary, not thermal admission or device authorization.
"""

import os


LOCAL_MODEL = "gemma4:e4b"
LOCAL_BASE_URL = "http://127.0.0.1:11434/v1"


def local_only_enabled() -> bool:
    value = os.environ.get("ARTEMIS_LOCAL_ONLY", "0").strip().lower()
    if value not in {"0", "false", "1", "true"}:
        raise ValueError("Invalid ARTEMIS_LOCAL_ONLY value; refusing model creation")
    return value in {"1", "true"}


def enforce_local_endpoint(endpoint) -> None:
    """Check before imports, credentials, fake models and client-cache lookup."""
    if not local_only_enabled():
        return
    if (
        str(endpoint.provider) != "ollama"
        or endpoint.model_name != LOCAL_MODEL
        or endpoint.api_base not in {None, LOCAL_BASE_URL}
        or endpoint.enable_grounding
    ):
        raise ValueError("Local-only profile permits only loopback Ollama gemma4:e4b")
