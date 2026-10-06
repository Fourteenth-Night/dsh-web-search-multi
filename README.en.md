# dsh-web-search-multi

A DeepSeek Harness search provider plugin: **one plugin, three engines (Exa / Tavily / Firecrawl), three model-facing tools**.

## What it does

| Tool the model sees | Backend | Strength |
|---|---|---|
| `web_search_exa` | Exa | neural/semantic search; research, company, academic queries |
| `web_search_tavily` | Tavily | fast, LLM-agent-friendly; topic filters (general/news/finance) |
| `web_search_firecrawl` | Firecrawl | search + full-page content in one call |
| `web_search` (standard) | config-picked (fallback) | chosen by `DSH_WEB_SEARCH_PROVIDER`, default exa |

- All three engines register as `ctx.web` providers so the standard `web_search` keeps working.
- Three engine tools are registered via `ctx.tools.register` so **the model can pick per query** (AI-driven division of labor).
- Keys live in environment variables only: `EXA_API_KEY` / `TAVILY_API_KEY` / `FIRECRAWL_API_KEY`.

## Install (in your DSH profile)

> Requires the 0.1.2-alpha.1 harness line (`@deepseek-ai/dsh-web` ^0.1.2-alpha.1, cordis ^4.0.1). Check peer versions for other runtimes.

```powershell
# 1) put this package into your profile local-plugins dir, then link it:
cd <DSH_HOME>\profiles\web
<desktop>\resources\app\node_modules\pnpm\bin\pnpm.cjs add "link:./local-plugins/dsh-web-search-multi"
```

> Desktop bundles a pnpm shim at `<harness>\.desktop-bin\pnpm.cmd` (handles Windows locked renames).

```yaml
# 2) register in cordis.patch.yml — NOTE: new plugins MUST be wrapped in an insert: list.
# A bare "- id:/name:" entry means "override an already-loaded plugin" and fails with
# "patch: entry not found".
- insert:
    - id: web-search-multi
      name: "dsh-web-search-multi"
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

```powershell
# 3) set keys (set whichever you use):
[Environment]::SetEnvironmentVariable("EXA_API_KEY", "exa-...", "User")
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "tvly-...", "User")
[Environment]::SetEnvironmentVariable("FIRECRAWL_API_KEY", "fc-...", "User")
[Environment]::SetEnvironmentVariable("DSH_WEB_SEARCH_PROVIDER", "exa", "User")  # fallback engine for the standard web_search
```

Restart DSH Desktop. Verify: in a new session, ask the model to search and watch for `web_search_exa / web_search_tavily / web_search_firecrawl`.

## Configuration (all optional)

| Key | Default | Notes |
|---|---|---|
| `toolMaxResults` | 8 | max sources per tool call |
| `toolMaxQueries` | 4 | max queries per call (1-4, mirrors official web_search) |
| `toolTimeoutMs` | 30000 | cooperative tool-call budget (enforced by the timeout policy) |
| `exa.searchType` | auto | auto | keyword | neural |
| `exa.numResults` | 8 | Exa results per query |
| `tavily.searchDepth` | basic | basic (1 credit) | advanced (2 credits) |
| `tavily.topic` | general | general | news | finance |
| `tavily.maxResults` | 8 | Tavily results per query |
| `firecrawl.baseURL` | https://api.firecrawl.dev/v1 | v2 supported too (response shapes differ; mapper handles both) |
| `firecrawl.limit` | 8 | Firecrawl results per query |

## Test

```bash
# any of the three env keys is enough (missing ones are skipped)
EXA_API_KEY=... TAVILY_API_KEY=... FIRECRAWL_API_KEY=... node test/self-test.mjs
```

No harness needed: the script drives `apply()` with a fake ctx and executes the three tools against the real APIs.

## Free tiers (verified 2026-10)

| Engine | Free tier | Billing |
|---|---|---|
| Exa | $10/month = 2,500 Instant searches, resets monthly, no card | pay-as-you-go beyond |
| Tavily | 1,000 credits/month, no card | basic=1 credit, advanced=2 |
| Firecrawl | 1,000 credits/month = 500 searches or 1,000 pages scraped, no card | pay-as-you-go beyond |

## License & credits

MIT. The Exa adapter is ported from [@deepseek-ai/dsh-web-search-exa](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/web/web-search-exa) (MIT); Tavily/Firecrawl adapters are original. Keys belong to their platform accounts; this project never holds keys.

## 中文

See [README.md](README.md) for the Chinese version.