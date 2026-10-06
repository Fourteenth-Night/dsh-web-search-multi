#!/usr/bin/env node
// Standalone self-test for dsh-web-search-multi. No harness required.
// Reads engine keys from the environment (EXA_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY).
// Usage: node test/self-test.mjs   (set the keys first; missing keys are skipped with a warning)
import { apply } from "../lib/index.js";

const keys = {
  exa: process.env.EXA_API_KEY,
  tavily: process.env.TAVILY_API_KEY,
  firecrawl: process.env.FIRECRAWL_API_KEY
};
const cfg = Object.fromEntries(Object.entries(keys).filter(([, v]) => v).map(([id, apiKey]) => [id, { apiKey }]));
const providers = [];
const tools = [];
const ctx = { get: () => undefined, web: { registerSearchProvider(p) { providers.push(p); } }, tools: { register(d) { tools.push(d); } } };
apply(ctx, cfg);

const fail = (msg) => { console.error("FAIL:", msg); process.exitCode = 1; };
const ok = (msg) => console.log("ok:", msg);

ok("providers: " + providers.map(p => p.id + ":" + p.available()).join(" | "));
ok("tools: " + tools.map(t => t.name).join(" | "));
if (tools.length !== 3) fail("expected 3 tools, got " + tools.length);
for (const t of tools) {
  if (!t.name.startsWith("web_search_")) fail("bad tool name " + t.name);
  if (!t.execute) fail("tool " + t.name + " missing execute");
  if (!t.output || !t.output.render || !t.output.schema) fail("tool " + t.name + " missing output contract");
}

// Live E2E (only for engines with a key set)
for (const t of tools) {
  const id = t.name.replace("web_search_", "");
  if (!keys[id]) { console.log("skip live:", t.name, "(no " + id.toUpperCase() + "_API_KEY)"); continue; }
  try {
    const v = await t.execute({ queries: ["DeepSeek Harness"] }, { signal: undefined });
    if (!Array.isArray(v.sources) || v.sources.length === 0) fail(t.name + " returned no sources");
    const keysOf = Object.keys(v).sort().join(",");
    if (keysOf !== "sources,truncated") fail(t.name + " value shape " + keysOf);
    const s0 = v.sources[0];
    if (!s0.url || !s0.title) fail(t.name + " first source missing url/title");
    const rendered = t.output.render({}, v);
    if (!rendered.length || !String(rendered[0].text).startsWith("External web content follows.")) fail(t.name + " render output unexpected");
    ok(t.name + " => " + v.sources.length + " sources, first=" + s0.title.slice(0, 40));
  } catch (e) {
    fail(t.name + " threw: " + (e.message || e).slice(0, 120));
  }
}

// No-key availability must be false
const p2 = [];
apply({ get: () => undefined, web: { registerSearchProvider(p) { p2.push(p); } }, tools: { register() {} } }, {});
ok("no-key availability: " + p2.map(p => p.id + ":" + p.available()).join(" | "));
if (p2.some(p => p.available())) fail("a provider is available without a key");

console.log(process.exitCode ? "SELF-TEST FAILED" : "SELF-TEST PASSED");