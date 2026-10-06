# dsh-web-search-unified

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-web-search-unified"><img src="https://img.shields.io/npm/v/dsh-web-search-unified" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-web-search-unified"><img src="https://img.shields.io/npm/dm/dsh-web-search-unified" alt="npm downloads"></a>
  <a href="https://github.com/Fourteenth-Night/dsh-web-search-multi"><img src="https://img.shields.io/github/stars/Fourteenth-Night/dsh-web-search-multi" alt="GitHub stars"></a>
  <a href="https://github.com/Fourteenth-Night/dsh-web-search-multi/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Fourteenth-Night/dsh-web-search-multi" alt="License"></a>
</p>

**面向 DeepSeek Harness 的统一多引擎 Web 搜索提供方插件。** 单一插件集成三家独立的搜索服务——Exa、Tavily 与 Firecrawl——并将每一家暴露为面向模型的工具，使语言模型能够按查询性质自主选择引擎。

**English version: [README.md](README.md).**

---

## 摘要

`dsh-web-search-unified` 通过 DeepSeek Harness 的 Web 能力接缝（`ctx.web`）注册三家搜索提供方——Exa、Tavily 与 Firecrawl——并经由工具运行时（`ctx.tools`）注册三个对应的模型可见工具（`web_search_exa`、`web_search_tavily`、`web_search_firecrawl`）。每个工具直接路由至其专属引擎实例，绕过接缝的部署级提供方选择，从而允许模型按查询性质择取最合适的引擎（例如，语义研究类查询交由 Exa，新闻类查询交由 Tavily，全文检索交由 Firecrawl）。标准 `web_search` 工具仍作为兜底路径可用，其后端由 `web` 插件的 `searchProvider` 配置决定（见「快速开始」一节）。

凭据通过 harness 的凭据接缝（`ctx.credentials`，例如 `$DSH_HOME/.credentials.yaml`）按操作实时解析，并以环境变量（`EXA_API_KEY`、`TAVILY_API_KEY`、`FIRECRAWL_API_KEY`）为回退；插件本身不存储、不嵌入任何机密。Tavily 另支持官方 **keyless 模式**，无需任何凭据即可工作。

## 适用范围与兼容性

- **实测运行时**：DeepSeek Harness 0.1.2-alpha.1 线（cordis 4.0.1、`@deepseek-ai/dsh-web` 0.1.2-alpha.1）。
- **同级依赖（peerDependencies）**：`@deepseek-ai/cordis` ^4.0.1、`@deepseek-ai/dsh-web` ^0.1.2-alpha.1、`@deepseek-ai/dsh-launch-environment` ^0.1.2-alpha.1、`@deepseek-ai/dsh-tools` ^0.1.2-alpha.1、`@deepseek-ai/schemastery` ^3.18.1。
- **注意事项**：同级依赖范围针对 0.1.2-alpha.1 线设定；其他运行时线（如 0.1.5、0.2.x）在安装前需重新校验同级版本。

## 模型可见工具

| 工具 | 后端 | 说明 |
|---|---|---|
| `web_search_exa` | Exa | 神经/语义检索；对研究、公司、学术与人物类查询表现突出。 |
| `web_search_tavily` | Tavily | 面向 LLM agent 的低延迟优化检索；支持主题过滤（`general`、`news`、`finance`）。 |
| `web_search_firecrawl` | Firecrawl | 一次调用即可完成搜索并可选地获取整页内容。 |
| `web_search`（标准） | 部署指定 | 兜底路径；由 `web` 插件的 `searchProvider` 配置决定（默认 `deepseek-official`）。将其指向 `exa` / `tavily` / `firecrawl` 即可经由本插件路由。 |

全部工具与官方 `web_search` 保持一致的参数契约：`queries` 数组，接受 1–4 个非空字符串并去重；结果按排名轮询顺序合并，以 `toolMaxResults` 为上限；输出遵循规范的 `{ sources, truncated }` 结构，并附带 `External web content follows...` 的不可信数据声明。

## 架构

1. **提供方注册**：各引擎经 `ctx.web.registerSearchProvider` 注册，使标准 `web_search` 工具在部署所选提供方下保持可用。
2. **工具注册**：各引擎工具经 `ctx.tools.register(defineTool({...}))` 注册，直接调用其专属提供方实例——独立于接缝的提供方选择逻辑。
3. **选择语义**：若多个提供方均 `available()` 且未显式指定时调用标准 `web_search`，接缝将抛出 `WEB_PROVIDER_AMBIGUOUS`。`web` 插件的 `searchProvider` 配置（`config.searchProvider ?? $DSH_WEB_SEARCH_PROVIDER`）可消除该歧义；桌面 bundle 默认设置 `searchProvider: deepseek-official`，因此环境变量仅在未配置该值时生效。
4. **凭据解析**：各提供方按操作经 `ctx.credentials`（凭据文档 → 环境变量）重新解析密钥。同步的 `available()` 门槛反映启动环境快照，因此仅存于 `.credentials.yaml` 的凭据可能在 `available()` 中报 `false`，但搜索仍可成功。Tavily 无论凭据如何均以 **keyless** 模式可用。

## 安装

### 前置条件

- 一个 DeepSeek Harness profile（harness 运行时 0.1.2-alpha.1 线）。
- 拟使用引擎的 API 密钥（参见「免费额度」一节）。

### 步骤

1. 将本包置于 profile 的 `local-plugins` 目录，并链接进 profile 工作区：

```powershell
cd <DSH_HOME>\profiles\web
pnpm add "link:./local-plugins/dsh-web-search-multi"
```

> **备选（npm 分发）**：本包发布至 npm 后，可直接 `pnpm add dsh-web-search-unified` 从注册表安装，跳过 `local-plugins` 步骤；下方 patch 中 `name` 使用 `"dsh-web-search-unified"`。

   （桌面版内置 pnpm 入口：`<harness>\.desktop-bin\pnpm.cmd`，可处理 Windows 锁重命名恢复。）

2. 在 `cordis.patch.yml` 中注册插件。**注意**：新增插件必须包裹在 `insert:` 列表中——裸写的 `- id:/name:` 条目表示「覆盖已加载插件」，会导致启动时报 `patch: entry "..." not found`。

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

3. 配置凭据——用户级环境变量，或 harness 凭据文档（`<DSH_HOME>/.credentials.yaml`）。Tavily 无需任何凭据即可 **keyless** 使用：

```powershell
# 用户级环境变量
[Environment]::SetEnvironmentVariable("EXA_API_KEY", "<key>", "User")
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "<key>", "User")
[Environment]::SetEnvironmentVariable("FIRECRAWL_API_KEY", "<key>", "User")
```

```yaml
# ……或凭据文档 <DSH_HOME>/.credentials.yaml
EXA_API_KEY: exa-...
TAVILY_API_KEY: tvly-...
FIRECRAWL_API_KEY: fc-...
```

4. 重启 DSH Desktop。在新会话中，三个引擎工具即对模型可用。

## 快速开始

1. **安装与注册**——按上文「安装」在 profile 的 `cordis.patch.yml` 中写入 `insert:` 条目。
2. **提供密钥（Tavily 可选）**——将 `EXA_API_KEY` / `TAVILY_API_KEY` / `FIRECRAWL_API_KEY` 设为环境变量，或写入 `<DSH_HOME>/.credentials.yaml`。
3. **重启并测试**——重启 harness，新建会话，让模型调用 `web_search_exa` / `web_search_tavily` / `web_search_firecrawl`；引擎按查询性质由模型择取。
4. **将标准 `web_search` 路由至本插件（可选）**——在 `cordis.patch.yml` 末尾追加：

```yaml
- id: web
  config:
    searchProvider: exa     # 或 tavily | firecrawl
```

   裸写的 `- id:` 条目语义为「覆盖已加载插件」——此处正是所需（`web` 服务随桌面 bundle 内置）。
5. **验证**——返回带来源链接的结果即表明提供方已生效；harness 日志应保持无 `WEB_PROVIDER_UNAVAILABLE` / `WEB_PROVIDER_CONFIGURED_MISSING`。

## 配置参考

| 键 | 默认值 | 说明 |
|---|---|---|
| `toolMaxResults` | 8 | 每次工具调用返回的来源上限。 |
| `toolMaxQueries` | 4 | 每次调用接受的查询数上限（1–4，与官方 `web_search` 一致）。 |
| `toolTimeoutMs` | 30000 | 协作式工具调用预算（毫秒），由 harness 超时策略强制执行。 |
| `exa.searchType` | `auto` | `auto` \| `keyword` \| `neural`。 |
| `exa.numResults` | 8 | 每查询结果数。 |
| `tavily.searchDepth` | `basic` | `basic`（1 积分）\| `advanced`（2 积分）。 |
| `tavily.topic` | `general` | `general` \| `news` \| `finance`。 |
| `tavily.maxResults` | 8 | 每查询结果数。 |
| `firecrawl.baseURL` | `https://api.firecrawl.dev/v1` | 支持显式覆盖为 v2；响应映射同时兼容两种结构（`data` 数组与 `data.matches`）。 |
| `firecrawl.limit` | 8 | 每查询结果数。 |
| `<engine>.keys` | — | 组成凭据池的 API 密钥数组；覆盖 `apiKey`。 |
| `<engine>.strategy` | `round-robin` | `round-robin` \| `least-loaded`。 |
| `<engine>.cooldownMs` | `60000` | 某次尝试失败（`429`/`5xx`/`401`/`403`）后的冷却时长，期满后该槽位重新参与轮换。 |

## 多账号凭据池

各引擎接受 `keys` 数组，将多个 API 密钥聚为一个凭据池置于单个提供方之后。请求在健康密钥之间轮换；以 `429`、`5xx`、`401` 或 `403` 失败的密钥将冷却 `cooldownMs` 并被跳过，自动尝试下一个健康密钥。不可重试的 `4xx` 立即失败。当所有密钥均在冷却时，搜索返回 `WEB_PROVIDER_ERROR`，附逐密钥诊断信息（密钥仅以截断形式展示，绝不完整暴露）。

```yaml
tavily:
  keys: ["tvly-main-...", "tvly-backup-..."]
  strategy: round-robin      # 或 least-loaded
  cooldownMs: 60000
```

`least-loaded` 优先选择进行中请求数与连续失败权重之和最小的密钥。当池为空时，Tavily 额外回退至官方 **keyless** 模式。

## 常见问题与排查

| 症状 / 错误 | 含义 | 处理 |
|---|---|---|
| 缺少 `web_search_*` 工具 | 运行中的运行时未加载本插件 | 确认 `insert:` 条目、设置密钥，并**重启** harness（进程环境在启动时快照） |
| `WEB_PROVIDER_CONFIGURED_MISSING` | `searchProvider` 指向未注册的提供方 | 检查插件的 `insert:` 条目并重启 |
| `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` | 指定提供方已注册但 `available() === false` | 设置引擎密钥（环境变量或 `.credentials.yaml`）；Exa/Firecrawl 始终需要密钥——Tavily 不需要 |
| `WEB_PROVIDER_AMBIGUOUS` | 未显式选择且多个提供方可用 | 在 `cordis.patch.yml` 中显式设置 `web.searchProvider` |
| `WEB_PROVIDER_UNAVAILABLE` | 无可用搜索提供方 | 配置密钥，或安装/注册提供方 |
| `WEB_ABORTED` | 搜索被请求取消 | 无需处理；模型已重试或转向其他路径 |
| keyless Tavily 无结果 | 公共 keyless 端点限流或瞬时故障 | 重试，或设置 `TAVILY_API_KEY` 走计量档 |

## 验证方法

本插件经三种互补途径验证：

1. **真实 API 执行**：使用真实凭据对每个引擎工具执行其生产 API 调用，验证端到端的来源检索与输出契约符合性。
2. **加载器配置合成**：以 harness CLI（`dsh --profile web --dump-config`）校验 profile 的合成配置树，确认插件条目及其配置无错误解析。
3. **独立自测**：`npm test` 运行 `test/self-test.mjs`，以桩上下文驱动 `apply()`，并在存在凭据时对各工具执行真实 API 调用。同级依赖经 Node 加载器钩子替换为最小桩实现，因此测试套件无需安装 harness 即可运行。

## 已知限制

- **单引擎单次调用**：每个引擎工具单次调用仅消耗一个引擎；当前不提供多引擎合并策略。
- **额度消耗**：真实调用会消耗各服务商的计量额度（见下节免费额度）。
- **版本耦合**：同级依赖范围锁定在 0.1.2-alpha.1 运行时线；更广的运行时覆盖尚待验证。
- **跨引擎结果重复**：仅在同一工具调用内按 URL 去重；不同引擎之间的语义重复不予以过滤。

## 安全注意事项

- 凭据经 harness 凭据接缝解析，并以环境变量为回退（`ctx.credentials` → 环境变量）；配置与源码中不嵌入任何机密。
- 若密钥曾暴露（例如出现在聊天记录或日志中），请在对应后台轮换密钥并更新环境变量。

## 免费额度（2026 年 10 月核实）

| 引擎 | 免费档 | 计费模式 |
|---|---|---|
| Exa | 每月 10 美元 ≈ 2,500 次 Instant 搜索；每月重置；无需支付方式（[定价](https://exa.ai/docs/admin/pricing)）。 | 超出免费余额按量计费。 |
| Tavily | 每月 1,000 积分；无需支付方式（[积分与定价](https://docs.tavily.com/documentation/api-credits)）；**keyless 模式**无需密钥。 | `basic` 搜索 1 积分；`advanced` 2 积分。 |
| Firecrawl | 每月 1,000 积分 ≈ 500 次搜索或 1,000 页抓取；无需支付方式（[定价](https://www.firecrawl.dev/pricing)）。 | 超出免费余额按量计费。 |

## 致谢

作者谨此致谢：

- **DeepSeek Harness（DSH）社区**提供的 Web 能力接缝（`ctx.web.registerSearchProvider`）与面向模型工具契约（`ctx.tools.register`）：其稳定的公开接口使得在不分叉 harness 的前提下实现第三方、运行时可组合的搜索提供方成为可能。
- **Exa、Tavily 与 Firecrawl** 慷慨的免费额度档位，使三个适配器的端到端真实调用验证得以零成本完成，亦是后续评估阶段的首选入口。
- [`@deepseek-ai/dsh-web-search-exa`](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/web/web-search-exa) 的维护者，其 MIT 许可的参考实现对 Exa 适配器的设计与输出映射具有直接指导意义。
- 早期采用者与评审者，其对配置易用性与文档的反馈直接塑造了当前版本。

移植出处与许可证细节见「许可证与致谢」一节。

## 许可证与致谢

MIT 许可证。Exa 适配器移植自 [`@deepseek-ai/dsh-web-search-exa`](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/web/web-search-exa)（MIT）；Tavily 与 Firecrawl 适配器为本项目原创贡献。API 密钥归各平台账号所有；本项目不持有任何凭据。
