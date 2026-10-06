import { pathToFileURL } from "node:url";

const map = new Map([
  ["@deepseek-ai/dsh-launch-environment", "./stubs/dsh-launch-environment/index.mjs"],
  ["@deepseek-ai/dsh-web", "./stubs/dsh-web/index.mjs"],
  ["@deepseek-ai/dsh-tools", "./stubs/dsh-tools/index.mjs"],
  ["@deepseek-ai/schemastery", "./stubs/schemastery/index.mjs"]
]);

export async function resolve(specifier, context, nextResolve) {
  if (map.has(specifier)) {
    return { url: new URL(map.get(specifier), import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
