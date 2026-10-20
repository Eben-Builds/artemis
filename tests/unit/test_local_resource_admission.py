"""No model, device, daemon or actual resource is started in these tests."""

import ast
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from artemis.llm.resource_admission import (
    LocalResourceAdmissionError,
    require_local_resource_admission,
)
from artemis.llm.router import ModelEndpoint, ModelFactory, ModelProvider
from artemis.services.llm import RobustChatModelWrapper, with_fallback


@pytest.fixture(autouse=True)
def local_mode(monkeypatch):
    monkeypatch.setenv("ARTEMIS_LOCAL_ONLY", "1")
    monkeypatch.delenv("ARTEMIS_FAKE_LLM", raising=False)
    ModelFactory._cache.clear()
    yield
    ModelFactory._cache.clear()


def endpoint():
    return ModelEndpoint(provider=ModelProvider.OLLAMA, model_name="gemma4:e4b")


def test_missing_lifecycle_is_terminal_not_retryable_or_fallback():
    with pytest.raises(LocalResourceAdmissionError) as caught:
        require_local_resource_admission()
    assert caught.value.failure.retryable is False
    assert caught.value.failure.should_fallback is False
    assert "NOT_CONNECTED" in str(caught.value)


def test_cache_cannot_bypass_missing_lifecycle():
    cached = Mock()
    ModelFactory._cache[endpoint().cache_key()] = cached
    with pytest.raises(LocalResourceAdmissionError):
        ModelFactory.get_model(endpoint())
    assert ModelFactory._cache[endpoint().cache_key()] is cached


@pytest.mark.parametrize("fake", ["0", "1"])
def test_denied_before_sdk_client_or_http_creation(monkeypatch, fake):
    import httpx
    import langchain_openai

    monkeypatch.setenv("ARTEMIS_FAKE_LLM", fake)
    sdk, sync, async_client = Mock(), Mock(), Mock()
    monkeypatch.setattr(langchain_openai, "ChatOpenAI", sdk)
    monkeypatch.setattr(httpx, "Client", sync)
    monkeypatch.setattr(httpx, "AsyncClient", async_client)
    with pytest.raises(LocalResourceAdmissionError):
        ModelFactory.create_model(endpoint())
    for constructor in (sdk, sync, async_client):
        constructor.assert_not_called()


def test_metadata_style_approval_flags_cannot_grant_a_permit(monkeypatch):
    monkeypatch.setenv("ARTEMIS_LOCAL_RESOURCES_VERIFIED", "1")
    monkeypatch.setenv("ARTEMIS_ALLOW_UNVERIFIED", "1")
    with pytest.raises(LocalResourceAdmissionError):
        require_local_resource_admission()


def test_non_lumi_mode_unchanged(monkeypatch):
    monkeypatch.setenv("ARTEMIS_LOCAL_ONLY", "0")
    assert require_local_resource_admission() is None


@pytest.mark.asyncio
async def test_denial_never_switches_to_fallback():
    async def denied():
        require_local_resource_admission()

    primary = AsyncMock(side_effect=denied)
    fallback = AsyncMock()
    with pytest.raises(LocalResourceAdmissionError):
        await with_fallback(main_call=primary, fallback_call=fallback)
    assert primary.await_count == 1
    fallback.assert_not_awaited()


@pytest.mark.asyncio
async def test_gateway_does_not_retry_a_terminal_local_denial():
    class DeniedModel:
        calls = 0

        async def astream(self, *_args, **_kwargs):
            self.calls += 1
            require_local_resource_admission()
            yield  # pragma: no cover

    model = DeniedModel()
    with pytest.raises(LocalResourceAdmissionError):
        await RobustChatModelWrapper(model).complete([])
    assert model.calls == 1


@pytest.mark.parametrize("mode", ["Flash", "Pro"])
@pytest.mark.parametrize("standalone", ["0", "1"])
def test_mcp_refuses_before_trace_device_daemon_queue_or_process(monkeypatch, mode, standalone):
    from mcp_server.tools import task_runner

    monkeypatch.setenv("ARTEMIS_STANDALONE", standalone)
    effects = []
    for owner, name in (
        (task_runner.uuid, "uuid4"),
        (task_runner.trace_store, "init_trace"),
        (task_runner, "_validate_device_serial"),
        (task_runner, "ensure_daemon_running"),
        (task_runner, "submit_task_to_daemon"),
        (task_runner.DeviceExecutionLock, "reserve"),
        (task_runner.subprocess, "Popen"),
    ):
        effect = Mock(side_effect=AssertionError("side effect before admission"))
        monkeypatch.setattr(owner, name, effect)
        effects.append(effect)
    result = task_runner.mobile_run_task(
        task_desc="public fixture",
        model=mode,
        device_serial="fixture-device",
    )
    assert result["status"] == "blocked"
    assert result["resource_admission"] == "NOT_IMPLEMENTED"
    assert result["hardware_status"] == "NOT_VERIFIED"
    assert "trace_id" not in result
    for name in ("task_started", "device_touched", "model_started"):
        assert result[name] is False
    for effect in effects:
        effect.assert_not_called()


def test_sdk_constructor_refuses_before_config_or_device(monkeypatch):
    from artemis.sdk.agent import Agent
    from artemis.sdk.builders import Builders

    builder = Mock(side_effect=AssertionError("config touched before admission"))
    monkeypatch.setattr(type(Builders), "AgentConfig", property(lambda _self: builder()))
    with pytest.raises(LocalResourceAdmissionError):
        Agent(device_serial="fixture-device")
    builder.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["run_task", "resume_task"])
async def test_web_ingress_refuses_before_readiness_or_session_data(entry):
    # Compile the actual entry body without importing database/state modules.
    # Missing globals intentionally fail if denial ever reaches later code.
    from fastapi import HTTPException

    root = Path(__file__).resolve().parents[2]
    tree = ast.parse((root / "apps/admin_console/routers/tasks.py").read_text(encoding="utf-8"))
    function = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == entry)
    guard = next(
        n
        for n in tree.body
        if isinstance(n, ast.FunctionDef) and n.name == "_require_local_task_admission"
    )
    function.decorator_list = []
    namespace = {
        "require_local_resource_admission": require_local_resource_admission,
        "LocalResourceAdmissionError": LocalResourceAdmissionError,
        "HTTPException": HTTPException,
        "RunRequest": object,
    }
    exec(
        compile(ast.Module(body=[guard, function], type_ignores=[]), "web-admission-test", "exec"),
        namespace,
    )
    with pytest.raises(HTTPException) as caught:
        await namespace[entry](*([SimpleNamespace()] if entry == "run_task" else []))
    assert caught.value.status_code == 409
    assert caught.value.detail["code"] == "LOCAL_RESOURCE_ADMISSION_NOT_CONNECTED"
