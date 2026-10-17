# Lumi PC engineering: local Ollama E4B routing

User decision 2026-10-17: local Ollama `gemma4:e4b`; no Gemini, paid API or cloud fallback. This integration candidate is not deployed to the running MCP server and does not enable Android actions.

## Contract

Use a fresh reviewed process with `ARTEMIS_LOCAL_ONLY=1` and the model profile in `config/examples/lumi-local-e4b.json`, preserving existing non-model settings. The flag is a startup policy, not authorization or an OS network sandbox. Never publish actual configuration, credentials or traces.

Factory policy checks run before imports, fake-model creation and client-cache lookup. Only `ollama`, `gemma4:e4b`, exact `http://127.0.0.1:11434/v1` (or its fixed default) and no grounding are permitted. Invalid flag values fail closed. Ollama uses a dummy credential, ignores cloud URL/key environment variables and disables SDK retries. HTTP clients ignore environment proxies and refuse redirects. Existing Artemis finite retry budgets remain.

Visual/chunk summaries retain the configured provider. Local optional judges inherit local configuration. Flash configuration errors propagate without Google recovery. Local-only mode disables native Google Explorer/video initialization and cached native client reuse there, startup warmup and cloud OCR. Upstream cloud support outside this explicit profile is preserved. No new package dependency or unreviewed plugin is adopted.

## Verification and limits

Offline tests cover roles/fallbacks, cache/fake bypass, model/address/grounding refusal, credential isolation, summaries, native client reuse, startup warmup and OCR. Related memory/gateway/config tests use public fixtures and mocked model construction. No model/API/device requests.

Initial related run: 35 failures, 92 passes; old mocks lacked valid role providers and one fallback fixture lacked its primary provider. Later run: 198 passes, 7 configuration builder failures due missing Google credentials. Configuration-only tests now isolate credential validation; runtime validation remains. An editing error briefly prevented test collection and was corrected before rerunning. These are source-test outcomes, not device/model acceptance.

E4B responses, image/tool-call accuracy, effective context, cancellation, unload/GPU idle, temperature protection and Fold7 OFF/ON acceptance remain NOT_VERIFIED. Closing an OpenAI-compatible client does not unload an Ollama model. Model ownership, keep-alive and resource admission require separate implementation/evidence. No automatic local warmup or inference is introduced.

The installed Artemis checkout differs from Lumi's previously pinned source. Do not overwrite/reset it or silently deploy this candidate. Review source pin and installation identity first. Preserve user data/configuration, reload MCP only after reviewed deployment and resource safety verification, then verify effective routing before any task. Existing server state is unchanged by this PR.

No driver installation, system policy change, Android permission/DB/UI change, helper activation, ADB bypass or paid/cloud request. Apache-2.0 and third-party notices remain intact.

Local Windows result: 206 scoped tests PASS; ruff lint and formatting PASS. No inference, model load/unload, mobile task or installation performed. CI result is recorded on the PR independently.

Additional native/universal Explorer/video and OCR regression: initially12 failures/43 passes because native SDK mocks were not selected without credential metadata. Native-only fixtures now use public placeholder metadata with external socket connections denied (loopback remains available for the Windows asyncio event loop); no real credential or cloud request. An initial overbroad socket stub broke23 asyncio setups and was corrected. Final55 targeted checks PASS with13 pre-existing mock ThinkingLevel warnings. Combined affected scope:261 tests. Full E2E never run. Initial local pyright invocation lacked worktree venv discovery; explicit existing Python path yielded0 errors without installing/upgrading anything.
