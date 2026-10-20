"""Offline regression coverage: never load a model or touch a phone."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from artemis.config.llm import LLMConfig, _expand_default_into_nodes
from artemis.llm.local_policy import LOCAL_BASE_URL, LOCAL_MODEL
from artemis.llm.router import ModelEndpoint, ModelFactory, ModelProvider
from artemis.services import llm as service


@pytest.fixture(autouse=True)
def isolated_policy(monkeypatch):
    monkeypatch.setenv("ARTEMIS_LOCAL_ONLY", "1")
    monkeypatch.delenv("ARTEMIS_FAKE_LLM", raising=False)
    ModelFactory._cache.clear()
    yield
    ModelFactory._cache.clear()


@pytest.fixture
def ctx():
    role = {
        "provider": "ollama",
        "model": LOCAL_MODEL,
        "fallback": {"provider": "ollama", "model": LOCAL_MODEL},
    }
    config = LLMConfig.model_validate(_expand_default_into_nodes({"default": role}))
    return SimpleNamespace(llm_config=config, data_engine=None)


@pytest.mark.parametrize(
    "provider", ["google", "vertexai", "openai", "anthropic", "openrouter", "xai", "vllm", "custom"]
)
def test_cloud_and_other_providers_denied_before_factory(provider):
    with pytest.raises(ValueError, match="Local-only"):
        ModelFactory.create_model(
            ModelEndpoint(provider=ModelProvider(provider), model_name=LOCAL_MODEL)
        )


@pytest.mark.parametrize(
    "base",
    [
        "https://example.com/v1",
        "http://localhost:11434/v1",
        "http://127.0.0.1:8000/v1",
        "http://127.0.0.1:11434/v1/",
        "http://127.0.0.1:11434@evil.example/v1",
    ],
)
def test_non_exact_loopback_denied(base):
    with pytest.raises(ValueError, match="Local-only"):
        ModelFactory.create_model(
            ModelEndpoint(provider=ModelProvider.OLLAMA, model_name=LOCAL_MODEL, api_base=base)
        )


def test_wrong_model_denied():
    with pytest.raises(ValueError, match="Local-only"):
        ModelFactory.create_model(
            ModelEndpoint(provider=ModelProvider.OLLAMA, model_name="other-model")
        )


def test_grounding_denied():
    with pytest.raises(ValueError, match="Local-only"):
        ModelFactory.create_model(
            ModelEndpoint(
                provider=ModelProvider.OLLAMA, model_name=LOCAL_MODEL, enable_grounding=True
            )
        )


def test_cached_cloud_client_cannot_bypass_policy():
    endpoint = ModelEndpoint()
    ModelFactory._cache[endpoint.cache_key()] = Mock()
    with pytest.raises(ValueError, match="Local-only"):
        ModelFactory.get_model(endpoint)


def test_fake_model_cannot_bypass_policy(monkeypatch):
    monkeypatch.setenv("ARTEMIS_FAKE_LLM", "1")
    with pytest.raises(ValueError, match="Local-only"):
        ModelFactory.create_model(ModelEndpoint())


def test_invalid_switch_fails_closed(monkeypatch):
    monkeypatch.setenv("ARTEMIS_LOCAL_ONLY", "yes-typo")
    with pytest.raises(ValueError, match="Invalid ARTEMIS_LOCAL_ONLY"):
        ModelFactory.get_model(ModelEndpoint())


def test_legacy_google_factory_cannot_bypass_policy():
    with pytest.raises(ValueError, match="Local-only"):
        service.get_google_llm()


@pytest.mark.parametrize("base", [None, LOCAL_BASE_URL])
def test_ollama_factory_ignores_cloud_url_and_credentials(monkeypatch, base):
    # Client construction below is the upstream non-Lumi mode. The Lumi
    # local-only mode now denies before construction until resources connect.
    monkeypatch.setenv("ARTEMIS_LOCAL_ONLY", "0")
    import langchain_openai
    import httpx

    sync_ctor = Mock()
    async_ctor = Mock()
    monkeypatch.setattr(httpx, "Client", sync_ctor)
    monkeypatch.setattr(httpx, "AsyncClient", async_ctor)
    ctor = Mock(return_value=Mock())
    monkeypatch.setattr(langchain_openai, "ChatOpenAI", ctor)
    monkeypatch.setenv("OPENAI_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "public-test-placeholder")
    ModelFactory.create_model(
        ModelEndpoint(
            provider=ModelProvider.OLLAMA,
            model_name=LOCAL_MODEL,
            api_base=base,
            api_key="public-endpoint-placeholder",
        )
    )
    args = ctor.call_args.kwargs
    assert args["base_url"] == LOCAL_BASE_URL
    assert args["api_key"] == "ollama-local-no-credential"
    assert args["max_retries"] == 0
    sync_ctor.assert_called_once_with(trust_env=False, follow_redirects=False)
    async_ctor.assert_called_once_with(trust_env=False, follow_redirects=False)


def test_all_roles_and_fallbacks_local(ctx):
    endpoints = []
    for role in type(ctx.llm_config).model_fields:
        if role == "utils":
            continue
        for fallback in [False, True]:
            endpoints.append(service._resolve_endpoint(ctx, role, use_fallback=fallback))
    for role in type(ctx.llm_config.utils).model_fields:
        for fallback in [False, True]:
            endpoints.append(
                service._resolve_endpoint(ctx, role, is_utils=True, use_fallback=fallback)
            )
    assert len(endpoints) == 40
    assert all(
        e.provider == ModelProvider.OLLAMA and e.model_name == LOCAL_MODEL for e in endpoints
    )


def test_missing_optional_judges_inherit_local_operator(ctx):
    ctx.llm_config.validator_pixel_safety_net = None
    ctx.llm_config.planner_validation = None
    for role in ["validator_pixel_safety_net", "planner_validation"]:
        assert ctx.llm_config.get_agent(role).provider == "ollama"


@pytest.mark.parametrize("fallback", [False, True])
def test_raw_summary_primary_and_fallback_preserve_provider(ctx, monkeypatch, fallback):
    factory = Mock(return_value=Mock())
    monkeypatch.setattr(ModelFactory, "get_model", factory)
    service.get_role_raw_model(ctx, "summarizer", LOCAL_MODEL, use_fallback=fallback)
    endpoint = factory.call_args.args[0]
    assert endpoint.provider == ModelProvider.OLLAMA
    assert endpoint.model_name == LOCAL_MODEL


def test_visual_summary_uses_local_role(ctx, monkeypatch):
    from artemis.agents.flash.summarizer import VisualStepSummarizer

    factory = Mock(return_value=Mock(model_name=LOCAL_MODEL))
    monkeypatch.setattr(ModelFactory, "get_model", factory)
    VisualStepSummarizer(ctx, model_name=LOCAL_MODEL)
    assert factory.call_args.args[0].provider == ModelProvider.OLLAMA


def test_capsule_primary_and_fallback_use_local_role(ctx, monkeypatch):
    from artemis.memory.chunking import StepCapsuleLens

    factory = Mock(return_value=Mock())
    monkeypatch.setattr(ModelFactory, "get_model", factory)
    lens = StepCapsuleLens(LOCAL_MODEL, ctx=ctx)
    lens._fallback_model_name = LOCAL_MODEL
    lens._get_llm()
    lens._get_fallback_llm()
    assert factory.call_count == 2
    assert all(c.args[0].provider == ModelProvider.OLLAMA for c in factory.call_args_list)


def test_flash_operator_config_failure_does_not_use_cloud(ctx, monkeypatch):
    from artemis.agents.flash import runner

    monkeypatch.setattr(runner, "get_llm", Mock(side_effect=ValueError("invalid config")))
    instance = object.__new__(runner.FlashRunner)
    instance.ctx = ctx
    with pytest.raises(ValueError, match="invalid config"):
        instance._init_llm()


@pytest.mark.asyncio
async def test_no_startup_warmup(ctx, monkeypatch):
    from artemis.sdk import agent

    cloud = Mock(side_effect=AssertionError("must not initialize Google"))
    monkeypatch.setattr(agent.genai, "Client", cloud)
    instance = object.__new__(agent.Agent)
    await instance._prewarm_llm_connections(api_key="public-test-placeholder")
    cloud.assert_not_called()


def test_explorer_cannot_reuse_google_client(ctx):
    from artemis.agents.explorer.explorer import Explorer

    instance = object.__new__(Explorer)
    instance.ctx = ctx
    ctx._genai_client = Mock()
    instance.model_name = "gemini-3.8-flash"
    assert instance._detect_native_engine() is False
    with pytest.raises(ValueError, match="disabled"):
        instance._ensure_genai_client()


def test_video_cannot_reuse_google_client(ctx):
    from artemis.agents.video_analyzer.video_analyzer import VideoAnalyzer

    instance = object.__new__(VideoAnalyzer)
    instance.ctx = ctx
    ctx._genai_client = Mock()
    instance._resolve_video_processing = Mock()
    instance._init_engine()
    assert instance.client is None
    assert instance.use_native_gemini is False


@pytest.mark.asyncio
async def test_cloud_ocr_denied_even_with_explicit_client(monkeypatch):
    from artemis.utils import ocr_api

    monkeypatch.setenv("OCR_API_KEY", "public-test-placeholder")
    assert ocr_api.is_ocr_configured() is False
    client = Mock()
    with pytest.raises(ValueError, match="disabled"):
        await ocr_api.perform_ocr("public-test-image", client=client)
    client.post.assert_not_called()


def test_missing_chunking_options_preserve_local_model(ctx):
    from artemis.memory.chunking import HistoryChunkManager

    manager = HistoryChunkManager(ctx=ctx)
    assert manager._model_name == LOCAL_MODEL
