// Minimal schemastery-compatible z stub for standalone self-tests.
// The real harness validates config with the real @deepseek-ai/schemastery.
const numberChain = { step() { return numberChain; }, min() { return numberChain; }, max() { return numberChain; } };
const z = {
  string: () => "string",
  number: () => numberChain,
  union: (values) => values,
  array: () => "array",
  dict: () => "dict",
  object: (shape) => (input) => input ?? {}
};
export default z;
