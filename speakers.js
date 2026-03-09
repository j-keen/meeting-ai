// speakers.js - Speaker management with presets

import { t } from './i18n.js';

const COLORS = [
  '#4f6ef7', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
];

let speakers = [];
let activeSpeakerId = null;

export function getDefaultSpeakers() {
  return [
    { id: 's1', name: t('speaker.me'), color: COLORS[0] },
    { id: 's2', name: t('speaker.participant', { n: 1 }), color: COLORS[1] },
    { id: 's3', name: t('speaker.participant', { n: 2 }), color: COLORS[2] },
  ];
}

export function initSpeakers(saved) {
  speakers = saved && saved.length > 0 ? saved : getDefaultSpeakers();
  if (!activeSpeakerId || !speakers.find(s => s.id === activeSpeakerId)) {
    activeSpeakerId = speakers[0]?.id || null;
  }
  return speakers;
}

export function getSpeakers() {
  return [...speakers];
}

export function getSpeaker(id) {
  return speakers.find(s => s.id === id) || null;
}

export function getActiveSpeaker() {
  return getSpeaker(activeSpeakerId) || speakers[0] || null;
}

export function setActiveSpeaker(id) {
  if (speakers.find(s => s.id === id)) {
    activeSpeakerId = id;
    return true;
  }
  return false;
}

export function setActiveSpeakerByIndex(index) {
  if (index >= 0 && index < speakers.length) {
    activeSpeakerId = speakers[index].id;
    return speakers[index];
  }
  return null;
}

export function addSpeaker(name) {
  const usedColors = new Set(speakers.map(s => s.color));
  const color = COLORS.find(c => !usedColors.has(c)) || COLORS[speakers.length % COLORS.length];
  const speaker = {
    id: 's' + Date.now(),
    name: name || t('speaker.participant', { n: speakers.length }),
    color,
  };
  speakers.push(speaker);
  return speaker;
}

export function updateSpeaker(id, updates) {
  const s = speakers.find(s => s.id === id);
  if (s) {
    if (updates.name !== undefined) s.name = updates.name;
    if (updates.color !== undefined) s.color = updates.color;
    return true;
  }
  return false;
}

export function removeSpeaker(id) {
  if (speakers.length <= 1) return false;
  speakers = speakers.filter(s => s.id !== id);
  if (activeSpeakerId === id) {
    activeSpeakerId = speakers[0]?.id || null;
  }
  return true;
}

export function getColors() {
  return [...COLORS];
}

// Load speakers from a preset (array of {name, color})
export function loadFromPreset(presetSpeakers) {
  speakers = presetSpeakers.map((s, i) => ({
    id: 's' + Date.now() + i,
    name: s.name,
    color: s.color || COLORS[i % COLORS.length],
  }));
  activeSpeakerId = speakers[0]?.id || null;
  return speakers;
}
