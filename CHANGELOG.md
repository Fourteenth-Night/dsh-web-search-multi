# Changelog

## v0.2.0 (2026-10-07)

- **Multi-account credential pools**: each engine accepts a `keys` array (`KeyPool`); requests rotate across healthy keys with `round-robin` or `least-loaded` strategy.
- **Failover semantics**: `429`/`5xx`/`401`/`403` cool the failing key (`cooldownMs`, default 60 s) and switch to the next healthy key automatically; non-retryable `4xx` fail immediately; all-cooled pools report `WEB_PROVIDER_ERROR` with truncated per-key diagnostics.
- **Backward compatible**: single `apiKey` and the credentials-resolution chain (`.credentials.yaml` → environment) are unchanged; Tavily still falls back to official keyless mode on an empty pool.
- **Testing**: KeyPool unit tests (rotation, cooling, least-loaded) plus live pool-path E2E for all three engines.

## v0.1.1 (2026-10-06)

- **Tavily keyless mode**: the Tavily provider sends the official `X-Tavily-Access-Mode: keyless` header when no key is present, remaining fully usable without credentials (`available()` no longer requires a key for Tavily).
- **Credentials-aware key resolution**: engine keys re-resolve per operation through the harness credentials seam (`ctx.credentials`, e.g. `$DSH_HOME/.credentials.yaml`) with an environment-variable fallback; rotated or newly stored secrets take effect without a plugin restart.
- **README overhaul (EN + ZH)**: quick-start section, standard `web_search` routing guide (`- id: web / config: searchProvider: exa|tavily|firecrawl`), `WEB_PROVIDER_*` troubleshooting table, and npm/CI badges.
- **Self-test coverage**: keyless live E2E for Tavily; corrected no-key availability assertions (`exa:false | tavily:true | firecrawl:false`).
- Published to npm as `dsh-web-search-unified@0.1.1`.

## v0.1.0 (2026-10-06)

- Initial release: unified multi-engine search plugin for DeepSeek Harness.
- Engines: Exa, Tavily, Firecrawl (one plugin, three providers, three model tools).
- Model-facing tools: `web_search_exa`, `web_search_tavily`, `web_search_firecrawl` (AI picks per query).
- Standard `web_search` fallback via `DSH_WEB_SEARCH_PROVIDER`.
- Keys via environment variables only; no secrets in config or repo.
- Standalone self-test with peer stubs (`npm test`, no harness needed).
- Tested against harness runtime 0.1.2-alpha.1 (cordis 4.0.1, dsh-web 0.1.2-alpha.1).
