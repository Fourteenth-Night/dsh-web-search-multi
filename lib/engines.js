import { WebError } from "@deepseek-ai/dsh-web";

// ---------- Credential pool ----------
/**
* A small credential pool with per-slot health tracking. Entries may be
* plain key strings or async resolvers (functions, evaluated at acquire
* time via `resolveSlotKey`). A failed slot is cooled down for `cooldownMs`
* and skipped by subsequent acquires; `least-loaded` prefers the slot with
* the smallest in-flight + consecutive-failure weight, `round-robin` rotates
* over healthy slots.
*/
export class KeyPool {
  constructor(entries, strategy = "round-robin", cooldownMs = 60000) {
    this.slots = entries.map(key => ({ key, coolingUntil: 0, inflight: 0, consecutiveFailures: 0 }));
    this.strategy = strategy;
    this.cooldownMs = cooldownMs;
    this.pointer = 0;
  }
  get keyCount() { return this.slots.length; }
  get healthyCount() { const now = Date.now(); return this.slots.filter(s => now >= s.coolingUntil).length; }
  acquire() {
    const now = Date.now();
    const healthy = this.slots.filter(s => now >= s.coolingUntil);
    if (healthy.length === 0) return null;
    let slot;
    if (this.strategy === "least-loaded") {
      slot = healthy.reduce((a, b) => (a.inflight + a.consecutiveFailures) <= (b.inflight + b.consecutiveFailures) ? a : b);
    } else {
      for (let i = 0; i < this.slots.length; i++) {
        const candidate = this.slots[(this.pointer + i) % this.slots.length];
        if (now >= candidate.coolingUntil) { slot = candidate; break; }
      }
      if (slot) this.pointer = (this.slots.indexOf(slot) + 1) % this.slots.length;
    }
    if (!slot) return null;
    slot.inflight++;
    return {
      key: slot.key,
      release: (ok) => {
        slot.inflight--;
        if (ok) { slot.consecutiveFailures = 0; }
        else { slot.consecutiveFailures++; slot.coolingUntil = Date.now() + this.cooldownMs; }
      }
    };
  }
}

/** Resolve a slot key: a static string, or an async resolver function. */
async function resolveSlotKey(slot) {
  return typeof slot.key === "function" ? await slot.key() : slot.key;
}

/** HTTP statuses that warrant failing over to another credential. */
function isRetryableStatus(status) {
  return status === 429 || status >= 500 || status === 401 || status === 403;
}

/** Short, non-secret label of a slot for failure diagnostics. */
function slotLabel(apiKey) {
  return apiKey.length > 0 ? apiKey.slice(0, 6) + "…" : "keyless";
}

/**
* Drive one search through a credential pool: acquire, attempt, classify.
* `attempt(slot)` returns `{ value }` on success or `{ retryable, message }`
* on a failover-class status; it may throw a `WebError` (non-retryable or
* abort, propagated immediately) or any other error (treated as network,
* cools the slot and retries with the next healthy credential).
*/
async function searchWithPool(pool, attempt, engineName) {
  const attempts = Math.max(1, pool.keyCount);
  const failures = [];
  for (let i = 0; i < attempts; i++) {
    const slot = pool.acquire();
    if (slot === null) break;
    try {
      const outcome = await attempt(slot);
      if (outcome.retryable) {
        slot.release(false);
        failures.push(outcome.message);
        continue;
      }
      slot.release(true);
      return outcome.value;
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof WebError) throw error;
      slot.release(false);
      failures.push(String(error.message ?? error));
    }
  }
  const detail = failures.length > 0 ? ": " + failures.join("; ") : " (no healthy credential)";
  throw new WebError(engineName + " search failed on all credentials" + detail, "WEB_PROVIDER_ERROR");
}

// ---------- Exa ----------
const EXA_DEFAULT_BASE_URL = "https://api.exa.ai";
const EXA_DEFAULT_SEARCH_TYPE = "auto";
const EXA_DEFAULT_HIGHLIGHTS_PER_RESULT = 1;
const USER_AGENT = "deepseek-harness/0.0.1";

function mapExaResult(result) {
  const snippet = result.highlights?.find((h) => h.trim().length > 0);
  if (snippet === void 0) return void 0;
  return { url: result.url, ...(result.title != null && result.title.length > 0 ? { title: result.title } : {}), snippet, ...(result.publishedDate != null && result.publishedDate.length > 0 ? { publishedAt: result.publishedDate } : {}) };
}
function mapExaResponse(response) {
  return { sources: (response.results ?? []).map(mapExaResult).filter((s) => s !== void 0), truncated: false };
}
export class ExaSearchProvider {
  options; id = "exa";
  constructor(options) { this.options = options; }
  hasCredential() {
    if ((this.options.apiKey?.length ?? 0) > 0) return true;
    const pool = this.options.keyPool;
    return !!pool && pool.slots.some(s => typeof s.key === "string" && s.key.length > 0);
  }
  available() { return this.hasCredential() && URL.canParse(this.options.baseURL) && (this.options.numResults === void 0 || isPositiveInteger(this.options.numResults)); }
  async search(request, signal) {
    const numResults = request.maxResults ?? this.options.numResults;
    const pool = this.options.keyPool;
    if (!pool || pool.keyCount === 0) throw new WebError("Exa search is not configured with a credential", "WEB_PROVIDER_ERROR");
    return searchWithPool(pool, async (slot) => {
      const apiKey = await resolveSlotKey(slot);
      let response;
      try {
        response = await fetch(this.options.baseURL + "/search", { method: "POST", redirect: "error",
          headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT },
          body: JSON.stringify({ query: request.query, type: this.options.searchType, contents: { highlights: { highlightsPerUrl: this.options.highlightsPerResult } }, ...(numResults !== void 0 ? { numResults } : {}) }),
          ...(signal !== void 0 ? { signal } : {}) });
      } catch (error) {
        if (isAbortError(error)) throw new WebError("Exa search aborted", "WEB_ABORTED", { cause: error });
        throw error;
      }
      if (!response.ok) {
        let message = "HTTP " + response.status;
        try { const parsed = await response.json(); const detail = parsed.error ?? parsed.message; if (detail !== void 0 && detail.length > 0) message = message + " " + detail; } catch (error) { if (isAbortError(error)) throw new WebError("Exa search aborted", "WEB_ABORTED", { cause: error }); }
        return { retryable: isRetryableStatus(response.status), message: message + " (" + slotLabel(apiKey) + ")" };
      }
      try { return { value: mapExaResponse(await response.json()) }; } catch (error) {
        if (isAbortError(error)) throw new WebError("Exa search aborted", "WEB_ABORTED", { cause: error });
        throw new WebError("Exa returned an unprocessable response body: " + String(error), "WEB_PROVIDER_ERROR", { cause: error });
      }
    }, "Exa");
  }
}

// ---------- Tavily ----------
const TAVILY_DEFAULT_BASE_URL = "https://api.tavily.com";
function mapTavilyResult(result) {
  const snippet = typeof result.content === "string" && result.content.trim().length > 0 ? result.content.trim() : void 0;
  if (snippet === void 0) return void 0;
  return { url: result.url, ...(result.title != null && result.title.length > 0 ? { title: result.title } : {}), snippet, ...(result.published_date != null && result.published_date.length > 0 ? { publishedAt: result.published_date } : {}) };
}
function mapTavilyResponse(response) {
  return { sources: (response.results ?? []).map(mapTavilyResult).filter((s) => s !== void 0), truncated: false };
}
export class TavilySearchProvider {
  options; id = "tavily";
  constructor(options) { this.options = options; }
  available() { return URL.canParse(this.options.baseURL) && (this.options.maxResults === void 0 || isPositiveInteger(this.options.maxResults)); }
  async search(request, signal) {
    const maxResults = request.maxResults ?? this.options.maxResults ?? 8;
    const pool = this.options.keyPool;
    if (!pool || pool.keyCount === 0) throw new WebError("Tavily search is not configured (no keyless slot)", "WEB_PROVIDER_ERROR");
    return searchWithPool(pool, async (slot) => {
      const apiKey = await resolveSlotKey(slot);
      const headers = apiKey.length > 0
        ? { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT }
        : { "X-Tavily-Access-Mode": "keyless", "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT };
      let response;
      try {
        response = await fetch(this.options.baseURL + "/search", { method: "POST", redirect: "error",
          headers,
          body: JSON.stringify({ query: request.query, max_results: maxResults, search_depth: this.options.searchDepth ?? "basic", topic: this.options.topic ?? "general" }),
          ...(signal !== void 0 ? { signal } : {}) });
      } catch (error) {
        if (isAbortError(error)) throw new WebError("Tavily search aborted", "WEB_ABORTED", { cause: error });
        throw error;
      }
      if (!response.ok) {
        let message = "HTTP " + response.status;
        try { const parsed = await response.json(); const detail = parsed.error ?? parsed.message ?? (typeof parsed.detail === "string" ? parsed.detail : void 0); if (detail !== void 0 && detail.length > 0) message = message + " " + detail; } catch (error) { if (isAbortError(error)) throw new WebError("Tavily search aborted", "WEB_ABORTED", { cause: error }); }
        return { retryable: isRetryableStatus(response.status), message: message + " (" + slotLabel(apiKey) + ")" };
      }
      try { return { value: mapTavilyResponse(await response.json()) }; } catch (error) {
        if (isAbortError(error)) throw new WebError("Tavily search aborted", "WEB_ABORTED", { cause: error });
        throw new WebError("Tavily returned an unprocessable response body: " + String(error), "WEB_PROVIDER_ERROR", { cause: error });
      }
    }, "Tavily");
  }
}

// ---------- Firecrawl ----------
const FIRECRAWL_DEFAULT_BASE_URL = "https://api.firecrawl.dev/v1";
function mapFirecrawlMatch(match) {
  const snippet = typeof match.description === "string" && match.description.trim().length > 0 ? match.description.trim() : void 0;
  if (snippet === void 0) return void 0;
  return { url: match.url, ...(match.title != null && match.title.length > 0 ? { title: match.title } : {}), snippet, ...(match.metadata?.publishedDate != null && match.metadata.publishedDate.length > 0 ? { publishedAt: match.metadata.publishedDate } : {}) };
}
function mapFirecrawlResponse(response) {
  const data = response?.data;
  const matches = Array.isArray(data) ? data : (Array.isArray(data?.matches) ? data.matches : []);
  return { sources: matches.map(mapFirecrawlMatch).filter((s) => s !== void 0), truncated: false };
}
export class FirecrawlSearchProvider {
  options; id = "firecrawl";
  constructor(options) { this.options = options; }
  hasCredential() {
    if ((this.options.apiKey?.length ?? 0) > 0) return true;
    const pool = this.options.keyPool;
    return !!pool && pool.slots.some(s => typeof s.key === "string" && s.key.length > 0);
  }
  available() { return this.hasCredential() && URL.canParse(this.options.baseURL) && (this.options.limit === void 0 || isPositiveInteger(this.options.limit)); }
  async search(request, signal) {
    const limit = request.maxResults ?? this.options.limit ?? 8;
    const pool = this.options.keyPool;
    if (!pool || pool.keyCount === 0) throw new WebError("Firecrawl search is not configured with a credential", "WEB_PROVIDER_ERROR");
    return searchWithPool(pool, async (slot) => {
      const apiKey = await resolveSlotKey(slot);
      let response;
      try {
        response = await fetch(this.options.baseURL + "/search", { method: "POST", redirect: "error",
          headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Accept": "application/json", "User-Agent": USER_AGENT },
          body: JSON.stringify({ query: request.query, limit }),
          ...(signal !== void 0 ? { signal } : {}) });
      } catch (error) {
        if (isAbortError(error)) throw new WebError("Firecrawl search aborted", "WEB_ABORTED", { cause: error });
        throw error;
      }
      if (!response.ok) {
        let message = "HTTP " + response.status;
        try { const parsed = await response.json(); const detail = parsed.error ?? parsed.message ?? (typeof parsed.detail === "string" ? parsed.detail : void 0); if (detail !== void 0 && detail.length > 0) message = message + " " + detail; } catch (error) { if (isAbortError(error)) throw new WebError("Firecrawl search aborted", "WEB_ABORTED", { cause: error }); }
        return { retryable: isRetryableStatus(response.status), message: message + " (" + slotLabel(apiKey) + ")" };
      }
      try { return { value: mapFirecrawlResponse(await response.json()) }; } catch (error) {
        if (isAbortError(error)) throw new WebError("Firecrawl search aborted", "WEB_ABORTED", { cause: error });
        throw new WebError("Firecrawl returned an unprocessable response body: " + String(error), "WEB_PROVIDER_ERROR", { cause: error });
      }
    }, "Firecrawl");
  }
}

function isPositiveInteger(value) { return Number.isInteger(value) && value > 0; }
function isAbortError(error) { return error instanceof DOMException && error.name === "AbortError"; }

export const ENGINE_DEFAULTS = {
  exa: { baseURL: EXA_DEFAULT_BASE_URL, searchType: EXA_DEFAULT_SEARCH_TYPE, highlightsPerResult: EXA_DEFAULT_HIGHLIGHTS_PER_RESULT },
  tavily: { baseURL: TAVILY_DEFAULT_BASE_URL, searchDepth: "basic", topic: "general" },
  firecrawl: { baseURL: FIRECRAWL_DEFAULT_BASE_URL }
};