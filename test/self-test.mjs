#!/usr/bin/env node
// Standalone self-test for dsh-web-search-unified. No harness required.
// Reads engine keys from the environment (EXA_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY).
// Usage: node test/self-test.mjs   (set the keys first; missing keys are skipped with a warning)
import { apply } from "../lib/index.js";
import { KeyPool } from "../lib/engines.js";

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
if (p2.some(p => p.available() && p.id !== "tavily")) fail("exa/firecrawl must not be available without a key");
const keylessTv = p2.find(p => p.id === "tavily");
if (!keylessTv || !keylessTv.available()) fail("tavily must be available keyless");

// Keyless live E2E: the no-key Tavily provider must still search (official keyless mode)
if (keylessTv) {
  try {
    const r = await keylessTv.search({ query: "DeepSeek Harness", maxResults: 3 }, undefined);
    ok("keyless tavily live => " + r.sources.length + " sources, first=" + (r.sources[0]?.title ?? "").slice(0, 40));
    if (!Array.isArray(r.sources) || r.sources.length === 0) fail("keyless tavily returned no sources");
  } catch (e) {
    fail("keyless tavily threw: " + (e.message || e).slice(0, 120));
  }
}

// ---- KeyPool unit tests (no network) ----
const rr = new KeyPool(["a", "b", "c"], "round-robin", 60000);
const order = [];
for (let i = 0; i < 4; i++) { const s = rr.acquire(); order.push(s.key); s.release(true); }
ok("keypool round-robin order: " + order.join(","));
if (order.join(",") !== "a,b,c,a") fail("round-robin rotation order wrong");

const cool = new KeyPool(["x", "y"], "round-robin", 60000);
const sx = cool.acquire(); sx.release(false);
const sy = cool.acquire();
if (sy === null || sy.key !== "y") fail("cooled slot must be skipped");
sy.release(false);
if (cool.acquire() !== null) fail("all-cooled pool must refuse acquire");

const ll = new KeyPool(["p", "q"], "least-loaded", 60000);
const lp1 = ll.acquire();
const lp2 = ll.acquire();
if (lp1.key === lp2.key) fail("least-loaded must pick the idle slot while one is in-flight");
lp1.release(true); lp2.release(true);
ok("keypool least-loaded + cooldown ok");

console.log(process.exitCode ? "SELF-TEST FAILED" : "SELF-TEST PASSED");