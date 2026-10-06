# dsh-web-search-multi

一个 DeepSeek Harness 搜索提供方插件：**一个插件、三个引擎（Exa / Tavily / Firecrawl）、三个模型工具**。

## 它能做什么

| 模型看到的工具 | 后端 | 特点 |
|---|---|---|
| `web_search_exa` | Exa | 神经/语义检索，研究、公司、学术类查询强 |
| `web_search_tavily` | Tavily | 快、LLM-agent 友好，支持 topic（general/news/finance） |
| `web_search_firecrawl` | Firecrawl | 搜索+全文抓取一体 |
| `web_search`（标准工具） | 配置指定（兜底） | 由 `DSH_WEB_SEARCH_PROVIDER` 决定，默认 exa |

- 三个引擎同时注册为 `ctx.web` provider（标准 `web_search` 仍可用）
- 三个引擎工具经 `ctx.tools.register` 注册，**模型可按查询性质自主选择**（AI 自主分工）
- 密钥全部走环境变量：`EXA_API_KEY` / `TAVILY_API_KEY` / `FIRECRAWL_API_KEY`（不进配置文件）

## 安装（在你的 DSH profile 中）

> 前提：harness 运行时 0.1.2-alpha.1 线（`@deepseek-ai/dsh-web` ^0.1.2-alpha.1、cordis ^4.0.1）。其他运行时请核对 peer 版本。

```powershell
# 1) 把本包放进 profile 的 local-plugins 目录，然后 link 进 workspace：
cd <DSH_HOME>\profiles\web
<desktop>\resources\app\node_modules\pnpm\bin\pnpm.cjs add "link:./local-plugins/dsh-web-search-multi"
```

> 桌面版自带 pnpm 入口：`<harness>\.desktop-bin\pnpm.cmd`（带 Windows 锁重命名恢复）。

```yaml
# 2) cordis.patch.yml 注册（注意：新增插件必须用 insert: 包装！裸 - id:/name: 是覆盖已加载插件，会报 patch: entry not found）
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
# 3) 设置密钥（用哪个设哪个）
[Environment]::SetEnvironmentVariable("EXA_API_KEY", "exa-...", "User")
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "tvly-...", "User")
[Environment]::SetEnvironmentVariable("FIRECRAWL_API_KEY", "fc-...", "User")
[Environment]::SetEnvironmentVariable("DSH_WEB_SEARCH_PROVIDER", "exa", "User")  # 标准 web_search 兜底引擎
```

重启 DSH Desktop 生效。验证：新会话让模型搜索，观察 `web_search_exa / web_search_tavily / web_search_firecrawl` 是否可用。

## 配置项（全部可选）

| 键 | 默认 | 说明 |
|---|---|---|
| `toolMaxResults` | 8 | 每次工具调用返回来源上限 |
| `toolMaxQueries` | 4 | 每次调用查询数上限（1–4，镜像官方 web_search） |
| `toolTimeoutMs` | 30000 | 协作式工具调用预算（由 timeout policy 强制执行） |
| `exa.searchType` | auto | auto | keyword | neural |
| `exa.numResults` | 8 | Exa 每查询结果数 |
| `tavily.searchDepth` | basic | basic（1 积分/次）| advanced（2 积分/次） |
| `tavily.topic` | general | general | news | finance |
| `tavily.maxResults` | 8 | Tavily 每查询结果数 |
| `firecrawl.baseURL` | https://api.firecrawl.dev/v1 | 可切 v2（v1/v2 响应结构不同，插件两者兼容） |
| `firecrawl.limit` | 8 | Firecrawl 每查询结果数 |

## 测试

```bash
# 需要三个环境变量之一（有哪个测哪个）
EXA_API_KEY=... TAVILY_API_KEY=... FIRECRAWL_API_KEY=... node test/self-test.mjs
```

无需运行 harness：脚本用假 ctx 调用 `apply()`，对真实 API 执行三个工具并校验输出契约。

## 免费额度参考（2026-10 核实）

| 引擎 | 免费档 | 计费 |
|---|---|---|
| Exa | $10/月 ≈ 2,500 次 Instant 搜索，每月重置，不绑卡 | 超出按量 |
| Tavily | 1,000 积分/月，不绑卡 | basic=1 积分、advanced=2 积分 |
| Firecrawl | 1,000 积分/月 ≈ 500 次搜索或 1,000 页抓取，不绑卡 | 超出按量 |

## 许可证与致谢

MIT。Exa 适配器移植自 [@deepseek-ai/dsh-web-search-exa](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/web/web-search-exa)（MIT），使用其 API 语义；Tavily/Firecrawl 适配器为本项目原创。密钥归属各平台账号，本项目不代持任何密钥。

## English

See [README.en.md](README.en.md) for the English version.