// @ts-check
// models.js - The one place Gemini model ids live.
// Verified 2026-09-20 against the Generative Language API: gemini-2.5-flash-lite and
// gemini-2.5-pro are "no longer available to new users"; the ids below respond.

export const MODEL = Object.freeze({
  lite: 'gemini-3.5-flash-lite',
  flash: 'gemini-3.5-flash',
  pro: 'gemini-3.1-pro-preview',
});

/** Ids that may still be stored in settings / sent by old clients. */
const LEGACY = Object.freeze({
  'gemini-2.5-flash-lite': MODEL.lite,
  'gemini-2.5-flash': MODEL.flash,
  'gemini-2.5-pro': MODEL.pro,
  'gemini-2.0-flash-lite': MODEL.lite,
  'gemini-2.0-flash': MODEL.flash,
  'gemini-1.5-flash': MODEL.flash,
  'gemini-1.5-pro': MODEL.pro,
});

/** Every id the proxy accepts (current + legacy, legacy is rewritten before the upstream call). */
export const ALLOWED_MODELS = Object.freeze([...Object.values(MODEL), ...Object.keys(LEGACY)]);

/** @param {string | undefined | null} name */
export function resolveModel(name) {
  if (!name) return MODEL.flash;
  return LEGACY[name] || name;
}

/** @param {string | undefined | null} name */
export function isProModel(name) {
  return resolveModel(name) === MODEL.pro;
}
