# Changelog

## v0.1.0 (2026-10-06)

- Initial release: unified multi-engine search plugin for DeepSeek Harness.
- Engines: Exa, Tavily, Firecrawl (one plugin, three providers, three model tools).
- Model-facing tools: `web_search_exa`, `web_search_tavily`, `web_search_firecrawl` (AI picks per query).
- Standard `web_search` fallback via `DSH_WEB_SEARCH_PROVIDER`.
- Keys via environment variables only; no secrets in config or repo.
- Standalone self-test with peer stubs (`npm test`, no harness needed).
- Tested against harness runtime 0.1.2-alpha.1 (cordis 4.0.1, dsh-web 0.1.2-alpha.1).
