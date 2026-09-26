// @ts-check
// models.js - The one place model ids and task→tier routing live.
//
// Tiers: light (cheap, frequent), standard (rare interactive setup), heavy (once per meeting).
// The app runs on OpenAI only (server key). Gemini ids stay as the codebase's internal tier
// vocabulary: callers still say 'gemini-3.5-flash-lite' etc. and the request layer maps each
// one to the OpenAI model of the same tier via toProviderModel().
//
// OpenAI prices per 1M tokens in/out (verified 2026-09-26):
//   gpt-5.6-luna $0.20/$0.75  — light: efficient model for focused, high-volume tasks
//   gpt-5.4-nano $0.20/$1.25  — (previous light; kept as a legacy alias)
//   gpt-5.4-mini $0.75/$4.50  — standard
//   gpt-5.6-sol  $2.00/$10.00 — heavy
//   gpt-5.5      $5.00/$30.00 — (previous heavy; kept as a legacy alias)

export const PROVIDERS = /** @type {const} */ (['gemini', 'openai']);

export const GEMINI = Object.freeze({
  light: 'gemini-3.5-flash-lite',
  standard: 'gemini-3.5-flash',
  heavy: 'gemini-3.1-pro-preview',
});

export const OPENAI = Object.freeze({
  light: 'gpt-5.6-luna',
  standard: 'gpt-5.4-mini',
  heavy: 'gpt-5.6-sol',
});

/** Backward-compatible aliases (lite/flash/pro) used across the codebase. */
export const MODEL = Object.freeze({ lite: GEMINI.light, flash: GEMINI.standard, pro: GEMINI.heavy });

/** Ids that may still be stored in settings / sent by old clients. */
const LEGACY = Object.freeze({
  'gemini-2.5-flash-lite': GEMINI.light,
  'gemini-2.5-flash': GEMINI.standard,
  'gemini-2.5-pro': GEMINI.heavy,
  'gemini-2.0-flash-lite': GEMINI.light,
  'gemini-2.0-flash': GEMINI.standard,
  'gemini-1.5-flash': GEMINI.standard,
  'gemini-1.5-pro': GEMINI.heavy,
  'gpt-4o-mini': OPENAI.light,
  'gpt-4o': OPENAI.standard,
  'gpt-4.1-nano': OPENAI.light,
  'gpt-4.1-mini': OPENAI.standard,
  'gpt-4.1': OPENAI.standard,
  'gpt-5-nano': OPENAI.light,
  'gpt-5-mini': OPENAI.standard,
  'gpt-5': OPENAI.heavy,
  'gpt-5.4-nano': OPENAI.light,
  'gpt-5.5': OPENAI.heavy,
});

/** Every Gemini id the proxy accepts (current + legacy; legacy is rewritten before the upstream call). */
export const ALLOWED_MODELS = Object.freeze([
  ...Object.values(GEMINI),
  ...Object.keys(LEGACY).filter(k => k.startsWith('gemini')),
]);
export const OPENAI_ALLOWED_MODELS = Object.freeze([
  ...Object.values(OPENAI),
  ...Object.keys(LEGACY).filter(k => k.startsWith('gpt')),
]);

/**
 * Which tier each task runs on. Frequent/background work runs light — including live
 * analysis, which fires every ~1000 transcript chars (a 1-hour lecture ≈ $0.05 on luna).
 * Rare interactive setup runs standard. Only the once-per-meeting outputs (final minutes,
 * generated documents) run heavy. There is no user model choice.
 */
export const TASK_TIER = Object.freeze({
  correction: 'light',
  title: 'light',
  metadata: 'light',
  tags: 'light',
  ocr: 'light',
  refine: 'light',
  prep: 'light',
  prompt_adjuster: 'light',
  chat: 'light',
  analysis: 'light',
  compare: 'standard',
  prompt_builder: 'standard',
  deep_setup: 'standard',
  minutes: 'heavy',
  docs: 'heavy',
});

/** @param {string | undefined | null} name */
export function resolveModel(name) {
  if (!name) return GEMINI.standard;
  return LEGACY[name] || name;
}

/** @param {string | undefined | null} name */
export function providerOf(name) {
  const id = resolveModel(name);
  return id.startsWith('gpt-') || /^o[0-9]/.test(id) ? 'openai' : 'gemini';
}

/** @param {string | undefined | null} name → 'light' | 'standard' | 'heavy' */
export function tierOf(name) {
  const id = resolveModel(name);
  for (const table of [GEMINI, OPENAI]) {
    for (const [tier, tid] of Object.entries(table)) if (tid === id) return tier;
  }
  if (/lite|nano|mini/.test(id)) return 'light';
  if (/pro|5\.5|sol/.test(id)) return 'heavy';
  return 'standard';
}

/** @param {string | undefined | null} name */
export function isProModel(name) {
  return tierOf(name) === 'heavy';
}

/**
 * Same tier, other provider. Ids already on the requested provider pass through.
 * @param {string} name
 * @param {'gemini'|'openai'} provider
 */
export function toProviderModel(name, provider) {
  const id = resolveModel(name);
  if (providerOf(id) === provider) return id;
  return (provider === 'openai' ? OPENAI : GEMINI)[tierOf(id)];
}

/**
 * Model id for a task, on the given provider (defaults to Gemini ids; the request
 * layer converts to the active provider). `userModel` is accepted for old callers and ignored.
 * @param {keyof typeof TASK_TIER} task
 * @param {{ userModel?: string, provider?: 'gemini'|'openai' }} [opts]
 */
export function modelFor(task, opts = {}) {
  const provider = opts.provider || 'gemini';
  const table = provider === 'openai' ? OPENAI : GEMINI;
  const tier = TASK_TIER[task] || 'standard';
  return table[tier];
}
