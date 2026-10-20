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


## Installed panel source alignment (2026-10-17)

The earlier258-file difference included upstream runtime refactoring and six local UI commits. Merging their effective changes into the reviewed local-only base produced exactly8 frontend source changes without conflicts. All8 canonical files match the installed da39e5b checkout byte-for-byte; backend source remains identical to b4e7c8e. Original six commits and the installed checkout/settings are untouched. Only feature changes are published as a new Korean-subject commit; original history is preserved locally. Evidence: docs/LUMI_INSTALLED_ALIGNMENT.json.

Preserved nested/session panes, per-pane logs, drag/drop, horizontal/vertical split, compact viewport behavior, minimum resize bounds and saved layout. Eight new offline panel/layout/log-isolation checks plus14 existing service checks PASS on Windows Chrome Headless; local-only33 tests PASS; Windows web production build PASS. Public fixtures and mocked storage/services only, no real session/user data, model, API or phone task. No full E2E, pixel/device acceptance or source/runtime promotion. Runtime/local-only backend behavior and dependency locks unchanged. Remaining gates: reviewed installed source transition, resource ownership/lifecycle/thermal admission, then deliberate MCP reload and physical acceptance.


## Local resource admission denial enforcement

The routing candidate could previously create a valid Ollama client even though the verified CPU/GPU sensor, owned process limits/watchdog, cancellation/resume invalidation and model ownership/release lifecycle were not connected. That is not permission to run. The local-only profile now fails closed before ModelFactory client creation/cache/fake selection, SDK Agent construction, MCP trace/device/daemon/process admission, and web task start/resume. Typed LocalResourceAdmissionError is terminal, non-retryable and forbids fallback; no synthesized provider response or fabricated sensor evidence is used.

This implements DENIAL ONLY. Resource lifecycle remains NOT_IMPLEMENTED, hardware remains NOT_VERIFIED, no runtime permit is minted. There is no resource-approval environment override or accepting a claimed metadata PASS. The existing ARTEMIS_LOCAL_ONLY startup profile switch still distinguishes Lumi from upstream non-Lumi configurations; it is not an OS sandbox and must not be disabled during a Lumi run. Existing installed/running processes are not modified or stopped by this source change. It does not revoke another process's previously granted execution or prove model unload/GPU idle.

The HTTP task start/resume entry returns409 with a local refusal; MCP reports blocked with task_started/device_touched/model_started=false and no trace. Read-only diagnostics/status/stop tools are not newly authorized or disabled. Startup remains without automatic model warmup. Later verified resource binding requires a separate source change/review, bounded ownership/cancel/deadline/resume/release evidence and physical acceptance before inference. No new packages, driver/system-policy/data/Android changes, cloud requests, model/API/phone calls or full E2E.

New offline15 tests cover terminal denial, cached/fake client refusal before SDK/HTTP construction, unrecognized approval flag refusal, one attempt/no fallback, MCP Pro/Flash daemon/standalone refusal before side effects, SDK initialization and actual web entry ASTs without database imports. Initial focused run58PASS/1failure came from a read-only builder property in the test harness; the fixture was corrected without relaxing runtime behavior. Final focused60 tests PASS; existing MCP10related cases PASS; lint/format/quality ratchet PASS. Broader CI evidence is recorded on the PR. Existing constructor keyword tests now explicitly use upstream non-Lumi mode, because constructing a client in local-only mode is intentionally denied.

Final Windows affected scope:276 scoped tests PASS with13 existing mock ThinkingLevel warnings, plus10selected MCP compatibility tests PASS. No actual sensor/ownership/release evidence was produced.
