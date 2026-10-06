# dsh-web-search-unified

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-web-search-unified"><img src="https://img.shields.io/npm/v/dsh-web-search-unified" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-web-search-unified"><img src="https://img.shields.io/npm/dm/dsh-web-search-unified" alt="npm downloads"></a>
  <a href="https://github.com/Fourteenth-Night/dsh-web-search-multi"><img src="https://img.shields.io/github/stars/Fourteenth-Night/dsh-web-search-multi" alt="GitHub stars"></a>
  <a href="https://github.com/Fourteenth-Night/dsh-web-search-multi/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Fourteenth-Night/dsh-web-search-multi" alt="License"></a>
</p>

**A unified, multi-engine web-search provider plugin for DeepSeek Harness.** One plugin integrates three independent search services — Exa, Tavily, and Firecrawl — and exposes each as a model-facing tool, enabling the language model to select an engine per query.

**中文版见 [README.zh.md](README.zh.md).**

---

## Abstract

`dsh-web-search-unified` extends the DeepSeek Harness web capability seam (`ctx.web`) with three search providers — Exa, Tavily, and Firecrawl — and registers three corresponding model-facing tools (`web_search_exa`, `web_search_tavily`, `web_search_firecrawl`) through the harness tool runtime (`ctx.tools`). Each tool routes directly to its dedicated engine instance, bypassing the seam's deployment-level provider selection, so the model may choose the engine best suited to the query (e.g., semantic research queries to Exa, news-oriented queries to Tavily, full-content retrieval to Firecrawl). The standard `web_search` tool remains available as a fallback; the harness selects its backend from the `web` plugin's `searchProvider` configuration (see [Quick Start](#quick-start)).

Authentication credentials resolve per operation through the harness credentials seam (`ctx.credentials`, e.g. `$DSH_HOME/.credentials.yaml`) with an environment-variable fallback (`EXA_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`); the plugin itself never stores or embeds secrets. Tavily additionally supports official **keyless mode**, so it works with no credential at all.

## Scope and Compatibility

- **Tested runtime**: DeepSeek Harness 0.1.2-alpha.1 line (cordis 4.0.1, `@deepseek-ai/dsh-web` 0.1.2-alpha.1).
- **Peer dependencies**: `@deepseek-ai/cordis` ^4.0.1, `@deepseek-ai/dsh-web` ^0.1.2-alpha.1, `@deepseek-ai/dsh-launch-environment` ^0.1.2-alpha.1, `@deepseek-ai/dsh-tools` ^0.1.2-alpha.1, `@deepseek-ai/schemastery` ^3.18.1.
- **Caveat**: peer ranges target the 0.1.2-alpha.1 line; other runtime lines (e.g., 0.1.5, 0.2.x) require re-validation of the peer versions before installation.

## Model-Facing Tooling

| Tool | Backend | Notes |
|---|---|---|
| `web_search_exa` | Exa | Neural/semantic retrieval; strong for research-, company-, academic-, and people-oriented queries. |
| `web_search_tavily` | Tavily | Latency-optimized, LLM-agent-friendly; supports topic filters (`general`, `news`, `finance`). |
| `web_search_firecrawl` | Firecrawl | Search with optional full-page content retrieval in a single call. |
| `web_search` (standard) | Deployment-selected | Fallback path; the `web` plugin's `searchProvider` config decides (default `deepseek-official`). Point it at `exa` / `tavily` / `firecrawl` to route through this plugin. |

All tools mirror the argument contract of the official `web_search` tool: a `queries` array of 1–4 non-empty strings, deduplicated; results are merged in rank-polling order, capped at `toolMaxResults`; output follows the canonical `{ sources, truncated }` shape with an `External web content follows...` untrusted-data notice.

## Architecture

1. **Provider registration**: each engine is registered via `ctx.web.registerSearchProvider`, which keeps the standard `web_search` tool operational under the deployment-chosen provider.
2. **Tool registration**: each engine tool is registered via `ctx.tools.register(defineTool({...}))`, executing directly against its own provider instance — independent of the seam's provider-selection logic.
3. **Selection semantics**: if the standard `web_search` is invoked while multiple providers are `available()` and none is explicitly selected, the seam raises `WEB_PROVIDER_AMBIGUOUS`. The `web` plugin's `searchProvider` config (`config.searchProvider ?? $DSH_WEB_SEARCH_PROVIDER`) resolves this; the desktop bundle sets `searchProvider: deepseek-official` by default, so the environment variable only takes effect when no config value is present.
4. **Credentials**: each provider re-resolves its key per operation through `ctx.credentials` (credentials document → environment). The synchronous `available()` gate reflects the launch-environment snapshot, so a credential stored only in `.credentials.yaml` may report `available() === false` while searches still succeed. Tavily is available **keyless** regardless of credentials.

## Installation

### Prerequisites

- A DeepSeek Harness profile (harness runtime 0.1.2-alpha.1 line).
- API keys for the engines you intend to use (see [Free Tiers](#free-tiers-verified-october-2026)).

### Steps

1. Place this package in your profile's `local-plugins` directory and link it into the profile workspace:

```powershell
cd <DSH_HOME>\profiles\web
pnpm add "link:./local-plugins/dsh-web-search-multi"
```

> **Alternative (npm distribution)**: once published, install directly from the registry — `pnpm add dsh-web-search-unified` — and skip the `local-plugins` step. Use `name: "dsh-web-search-unified"` in the patch below.

   (Desktop builds bundle a pnpm shim at `<harness>\.desktop-bin\pnpm.cmd`, which handles Windows locked-rename recovery.)

2. Register the plugin in `cordis.patch.yml`. **Note**: new plugins must be wrapped in an `insert:` list — a bare `- id:/name:` entry denotes an override of an already-loaded plugin and causes a `patch: entry "..." not found` failure at boot.

```yaml
- insert:
    - id: web-search-multi
      name: "dsh-web-search-unified"
      config:
        toolMaxResults: 8
        toolMaxQueries: 4
        toolTimeoutMs: 30000
        exa:
          searchType: auto
          numResults: 8
        tavily:
          searchDepth: basic
          topic: general
          maxResults: 8
        firecrawl:
          baseURL: "https://api.firecrawl.dev/v1"
          limit: 8
```

3. Configure credentials — user-level environment variables, or the harness credentials document (`<DSH_HOME>/.credentials.yaml`). Tavily works **keyless** without any credential:

```powershell
# user-level environment variables
[Environment]::SetEnvironmentVariable("EXA_API_KEY", "<key>", "User")
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "<key>", "User")
[Environment]::SetEnvironmentVariable("FIRECRAWL_API_KEY", "<key>", "User")
```

```yaml
# ...or the credentials document at <DSH_HOME>/.credentials.yaml
EXA_API_KEY: exa-...
TAVILY_API_KEY: tvly-...
FIRECRAWL_API_KEY: fc-...
```

4. Restart DSH Desktop. In a new session, the three engine tools become available to the model.

## Quick Start

1. **Install & register** — [Installation](#installation) above adds the `insert:` entry to your profile's `cordis.patch.yml`.
2. **Provide keys (optional for Tavily)** — set `EXA_API_KEY` / `TAVILY_API_KEY` / `FIRECRAWL_API_KEY` as environment variables, or store them in `<DSH_HOME>/.credentials.yaml`.
3. **Restart & test** — restart the harness, open a new session, and let the model call `web_search_exa` / `web_search_tavily` / `web_search_firecrawl`; the engine is chosen per query.
4. **Route the standard `web_search` through this plugin (optional)** — append to `cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: exa     # or tavily | firecrawl
```

   A bare `- id:` entry *overrides an already-loaded plugin* — exactly the semantics this needs (the `web` service ships with the desktop bundle).
5. **Verify** — a query returning sourced links confirms the provider is live; the harness log should stay free of `WEB_PROVIDER_UNAVAILABLE` / `WEB_PROVIDER_CONFIGURED_MISSING`.

## Configuration Reference

| Key | Default | Description |
|---|---|---|
| `toolMaxResults` | 8 | Maximum number of sources returned per tool call. |
| `toolMaxQueries` | 4 | Maximum number of queries accepted per call (1–4, mirroring the official `web_search`). |
| `toolTimeoutMs` | 30000 | Cooperative tool-call budget (ms), enforced by the harness timeout policy. |
| `exa.searchType` | `auto` | `auto` \| `keyword` \| `neural`. |
| `exa.numResults` | 8 | Results per query. |
| `tavily.searchDepth` | `basic` | `basic` (1 credit) \| `advanced` (2 credits). |
| `tavily.topic` | `general` | `general` \| `news` \| `finance`. |
| `tavily.maxResults` | 8 | Results per query. |
| `firecrawl.baseURL` | `https://api.firecrawl.dev/v1` | v2 is supported via explicit override; the response mapper handles both shapes (`data` array vs `data.matches`). |
| `firecrawl.limit` | 8 | Results per query. |
| `<engine>.keys` | — | Array of API keys forming a credential pool; overrides `apiKey`. |
| `<engine>.strategy` | `round-robin` | `round-robin` \| `least-loaded`. |
| `<engine>.cooldownMs` | `60000` | Cool-down after a failed attempt (`429`/`5xx`/`401`/`403`) before the slot rejoins rotation. |

## Multi-Account Credential Pools

Each engine accepts a `keys` array to pool several API keys behind one provider. Requests rotate across healthy keys; a key that fails with `429`, `5xx`, `401`, or `403` is cooled down for `cooldownMs` and skipped, and the next healthy key is tried automatically. Non-retryable `4xx` errors fail immediately. When every key is cooling down, the search reports `WEB_PROVIDER_ERROR` with per-key diagnostics (keys are shown truncated, never in full).

```yaml
tavily:
  keys: ["tvly-main-...", "tvly-backup-..."]
  strategy: round-robin      # or least-loaded
  cooldownMs: 60000
```

`least-loaded` prefers the key with the fewest in-flight requests and consecutive-failure weight. Tavily additionally falls back to its official **keyless** mode when the pool is empty.

## FAQ and Troubleshooting

| Symptom / error | Meaning | Resolution |
|---|---|---|
| `web_search_*` tools absent | Plugin not loaded in the running runtime | Confirm the `insert:` entry, set keys, and **restart** the harness (the process environment is snapshotted at start) |
| `WEB_PROVIDER_CONFIGURED_MISSING` | `searchProvider` names a provider that is not registered | Check the plugin's `insert:` entry and restart |
| `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` | Named provider registered but `available() === false` | Set the engine key (env or `.credentials.yaml`); Exa/Firecrawl always require keys — Tavily does not |
| `WEB_PROVIDER_AMBIGUOUS` | No provider selected while several are available | Set `web.searchProvider` explicitly in `cordis.patch.yml` |
| `WEB_PROVIDER_UNAVAILABLE` | No usable search provider | Configure a key or install/register a provider |
| `WEB_ABORTED` | Search cancelled by the request | No action needed; the model retried or moved on |
| Keyless Tavily returns no results | Rate-limit or transient failure of the public keyless endpoint | Retry, or set `TAVILY_API_KEY` for the metered tier |

## Verification Methodology

The plugin was validated through three complementary approaches:

1. **Live API execution**: each engine tool was executed against its live production API with real credentials, verifying end-to-end source retrieval and output-contract compliance.
2. **Loader config composition**: the profile's composed configuration tree was validated with the harness CLI (`dsh --profile web --dump-config`), confirming error-free resolution of the plugin entry and its configuration.
3. **Standalone self-test**: `npm test` runs `test/self-test.mjs`, which drives `apply()` with a stub context and — when credentials are present — executes each tool against the live APIs. Peer dependencies are substituted with minimal stubs via a Node loader hook, so the test suite runs without a harness installation.

## Known Limitations

- **Single-engine-per-call**: each engine tool consumes exactly one engine per invocation; no multi-engine merge strategy is currently provided.
- **Quota consumption**: live invocations draw from each service's metered quota (see free tiers below).
- **Version coupling**: peer ranges are pinned to the 0.1.2-alpha.1 runtime line; wider runtime coverage is pending validation.
- **Duplicate results across engines**: URL-level deduplication is applied within a single tool call; semantic duplicates across different engines are not filtered.

## Security Considerations

- Credentials resolve through the harness credentials seam with an environment fallback (`ctx.credentials` → environment); no secret is embedded in configuration or source.
- If a key has been exposed (e.g., shared in chat or logs), rotate it at the respective dashboard and update the environment variable.

## Free Tiers (verified October 2026)

| Engine | Free tier | Billing model |
|---|---|---|
| Exa | USD 10/month ≈ 2,500 Instant searches; resets monthly; no payment method required ([pricing](https://exa.ai/docs/admin/pricing)). | Pay-as-you-go beyond the free balance. |
| Tavily | 1,000 credits/month; no payment method required ([credits & pricing](https://docs.tavily.com/documentation/api-credits)); **keyless mode** available without a key. | `basic` search = 1 credit; `advanced` = 2 credits. |
| Firecrawl | 1,000 credits/month ≈ 500 searches or 1,000 pages scraped; no payment method required ([pricing](https://www.firecrawl.dev/pricing)). | Pay-as-you-go beyond the free balance. |

## Acknowledgments

The authors wish to thank:

- The **DeepSeek Harness (DSH) community** for the web capability seam (`ctx.web.registerSearchProvider`) and the model-facing tool contract (`ctx.tools.register`), whose stable public interfaces made a third-party, runtime-composable search provider feasible without forking the harness.
- **Exa, Tavily, and Firecrawl** for their generously provisioned free tiers, which enabled live end-to-end validation of all three adapters at zero cost and remain the recommended on-ramp for evaluation.
- The maintainers of [`@deepseek-ai/dsh-web-search-exa`](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/web/web-search-exa), whose MIT-licensed reference implementation informed the design and output mapping of the Exa adapter.
- Early adopters and reviewers whose feedback on configuration ergonomics and documentation directly shaped the current release.

See [License and Attribution](#license-and-attribution) for provenance details.

## License and Attribution

MIT License. The Exa adapter is ported from [`@deepseek-ai/dsh-web-search-exa`](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/web/web-search-exa) (MIT); the Tavily and Firecrawl adapters are original contributions of this project. API keys remain the property of their respective platform accounts; this project holds no credentials.
