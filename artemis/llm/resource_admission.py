"""Deny local execution until a reviewed resource lifecycle is connected.

Endpoint selection alone is not thermal/process/model ownership evidence.
This module grants no permits and has no environment approval override.
"""

from artemis.llm.local_policy import local_only_enabled
from artemis.llm.reliability import Failure, FailureCategory, LLMPermanentError


class LocalResourceAdmissionError(LLMPermanentError):
    """An explicit local refusal, not a provider outage or retry opportunity."""

    def __init__(self):
        super().__init__(
            "LOCAL_RESOURCE_ADMISSION_NOT_CONNECTED: local execution is blocked; "
            "verified thermal admission, owned resource limits, cancellation, "
            "resume invalidation and model release are not connected.",
            failure=Failure(FailureCategory.BAD_REQUEST, False, False),
        )


def require_local_resource_admission() -> None:
    """Fail closed for the local-only profile before any resource side effects.

    This is denial enforcement only. The actual resource lifecycle is still
    NOT_IMPLEMENTED; metadata, tests, config flags and model absence cannot
    authorize inference. A later reviewed implementation must supply it.
    """
    if local_only_enabled():
        raise LocalResourceAdmissionError()
