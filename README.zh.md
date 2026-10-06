# dsh-web-search-multi

**面向 DeepSeek Harness 的统一多引擎 Web 搜索提供方插件。** 单一插件集成三家独立的搜索服务——Exa、Tavily 与 Firecrawl——并将每一家暴露为面向模型的工具，使语言模型能够按查询性质自主选择引擎。

**English version: [README.md](README.md).**

---

## 摘要

`dsh-web-search-multi` 通过 DeepSeek Harness 的 Web 能力接缝（`ctx.web`）注册三家搜索提供方——Exa、Tavily 与 Firecrawl——并经由工具运行时（`ctx.tools`）注册三个对应的模型可见工具（`web_search_exa`、`web_search_tavily`、`web_search_firecrawl`）。每个工具直接路由至其专属引擎实例，绕过接缝的部署级提供方选择，从而允许模型按查询性质择取最合适的引擎（例如，语义研究类查询交由 Exa，新闻类查询交由 Tavily，全文检索交由 Firecrawl）。标准 `web_search` 工具仍作为兜底路径可用，其引擎由部署配置（`DSH_WEB_SEARCH_PROVIDER`）决定。

凭据完全通过环境变量（`EXA_API_KEY`、`TAVILY_API_KEY`、`FIRECRAWL_API_KEY`）提供；插件本身不存储、不嵌入任何机密。

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
| `web_search`（标准） | 配置指定 | 兜底路径；由 `DSH_WEB_SEARCH_PROVIDER` 决定（默认 `exa`）。 |

全部工具与官方 `web_search` 保持一致的参数契约：`queries` 数组，接受 1–4 个非空字符串并去重；结果按排名轮询顺序合并，以 `toolMaxResults` 为上限；输出遵循规范的 `{ sources, truncated }` 结构，并附带 `External web content follows...` 的不可信数据声明。

## 架构

1. **提供方注册**：各引擎经 `ctx.web.registerSearchProvider` 注册，使标准 `web_search` 工具在部署所选提供方下保持可用。
2. **工具注册**：各引擎工具经 `ctx.tools.register(defineTool({...}))` 注册，直接调用其专属提供方实例——独立于接缝的提供方选择逻辑。
3. **选择语义**：若多个提供方均 `available()` 且未显式指定时调用标准 `web_search`，接缝将抛出 `WEB_PROVIDER_AMBIGUOUS`；显式设置 `DSH_WEB_SEARCH_PROVIDER` 可消除该歧义。
4. **凭据解析**：在 `apply()` 阶段自启动环境解析；缺失密钥将使对应提供方 `available() === false`（优雅降级，不导致启动失败）。

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

   （桌面版内置 pnpm 入口：`<harness>\.desktop-bin\pnpm.cmd`，可处理 Windows 锁重命名恢复。）

2. 在 `cordis.patch.yml` 中注册插件。**注意**：新增插件必须包裹在 `insert:` 列表中——裸写的 `- id:/name:` 条目表示「覆盖已加载插件」，会导致启动时报 `patch: entry "..." not found`。

```yaml
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

3. 配置凭据（用户级环境变量）：

```powershell
[Environment]::SetEnvironmentVariable("EXA_API_KEY", "<key>", "User")
[Environment]::SetEnvironmentVariable("TAVILY_API_KEY", "<key>", "User")
[Environment]::SetEnvironmentVariable("FIRECRAWL_API_KEY", "<key>", "User")
[Environment]::SetEnvironmentVariable("DSH_WEB_SEARCH_PROVIDER", "exa", "User")
```

4. 重启 DSH Desktop。在新会话中，三个引擎工具即对模型可用。

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

- 凭据仅自启动环境读取；配置与源码中不嵌入任何机密。
- 若密钥曾暴露（例如出现在聊天记录或日志中），请在对应后台轮换密钥并更新环境变量。

## 免费额度（2026 年 10 月核实）

| 引擎 | 免费档 | 计费模式 |
|---|---|---|
| Exa | 每月 10 美元 ≈ 2,500 次 Instant 搜索；每月重置；无需支付方式（[定价](https://exa.ai/docs/admin/pricing)）。 | 超出免费余额按量计费。 |
| Tavily | 每月 1,000 积分；无需支付方式（[积分与定价](https://docs.tavily.com/documentation/api-credits)）。 | `basic` 搜索 1 积分；`advanced` 2 积分。 |
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
