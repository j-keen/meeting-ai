// storage.js - localStorage CRUD for meetings, settings, typo dictionary, speaker presets

const STORAGE_KEY = 'meeting-ai-data';
const MAX_MEETINGS = 50;
const WARN_THRESHOLD = 0.8;

function getStorageUsage() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    total += localStorage.getItem(key).length * 2;
  }
  return { used: total, limit: 5 * 1024 * 1024, ratio: total / (5 * 1024 * 1024) };
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { meetings: [], settings: {} };
  } catch {
    return { meetings: [], settings: {} };
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const usage = getStorageUsage();
    if (usage.ratio > WARN_THRESHOLD) {
      console.warn(`Storage usage: ${(usage.ratio * 100).toFixed(1)}%`);
      return { success: true, warning: 'storage_high' };
    }
    return { success: true };
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      autoCleanup();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return { success: true, warning: 'cleaned_up' };
      } catch {
        return { success: false, error: 'quota_exceeded' };
      }
    }
    return { success: false, error: e.message };
  }
}

function autoCleanup() {
  const data = loadAll();
  if (data.meetings.length > MAX_MEETINGS) {
    data.meetings.sort((a, b) => b.updatedAt - a.updatedAt);
    data.meetings = data.meetings.slice(0, MAX_MEETINGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

// Meeting CRUD
export function listMeetings() {
  const data = loadAll();
  return data.meetings.sort((a, b) => b.createdAt - a.createdAt);
}

export function getMeeting(id) {
  const data = loadAll();
  return data.meetings.find(m => m.id === id) || null;
}

export function saveMeeting(meeting) {
  const data = loadAll();
  const idx = data.meetings.findIndex(m => m.id === meeting.id);
  meeting.updatedAt = Date.now();
  if (idx >= 0) {
    data.meetings[idx] = meeting;
  } else {
    meeting.createdAt = meeting.createdAt || Date.now();
    data.meetings.push(meeting);
  }
  if (data.meetings.length > MAX_MEETINGS) {
    data.meetings.sort((a, b) => b.updatedAt - a.updatedAt);
    data.meetings = data.meetings.slice(0, MAX_MEETINGS);
  }
  return saveAll(data);
}

export function deleteMeeting(id) {
  const data = loadAll();
  data.meetings = data.meetings.filter(m => m.id !== id);
  return saveAll(data);
}

export function updateMeetingTags(id, tags) {
  const data = loadAll();
  const meeting = data.meetings.find(m => m.id === id);
  if (meeting) {
    meeting.tags = tags;
    meeting.updatedAt = Date.now();
    return saveAll(data);
  }
  return { success: false };
}

// Settings
export function loadSettings() {
  const data = loadAll();
  return data.settings || {};
}

export function saveSettings(settings) {
  const data = loadAll();
  data.settings = { ...data.settings, ...settings };
  return saveAll(data);
}

// API key helpers
export function saveApiKey(name, value) {
  const data = loadAll();
  if (!data.settings.keys) data.settings.keys = {};
  data.settings.keys[name] = btoa(value);
  return saveAll(data);
}

export function getApiKey(name) {
  const data = loadAll();
  const encoded = data.settings.keys?.[name];
  if (!encoded) return '';
  try { return atob(encoded); } catch { return ''; }
}

// Typo Dictionary
export function loadTypoDict() {
  const data = loadAll();
  return data.settings.typoDict || {};
}

export function saveTypoDict(dict) {
  const data = loadAll();
  data.settings.typoDict = dict;
  return saveAll(data);
}

export function addTypoCorrection(before, after) {
  if (!before || !after || before === after || before.length <= 1) return;
  const dict = loadTypoDict();
  dict[before] = after;
  return saveTypoDict(dict);
}

export function resetTypoDict() {
  return saveTypoDict({});
}

// Contacts CRUD
export function loadContacts() {
  const data = loadAll();
  return data.contacts || [];
}

export function saveContacts(contacts) {
  const data = loadAll();
  data.contacts = contacts;
  return saveAll(data);
}

export function addContact(contact) {
  const data = loadAll();
  if (!data.contacts) data.contacts = [];
  contact.id = contact.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  contact.createdAt = Date.now();
  contact.updatedAt = Date.now();
  data.contacts.push(contact);
  saveAll(data);
  return contact;
}

export function updateContact(id, updates) {
  const data = loadAll();
  if (!data.contacts) return null;
  const idx = data.contacts.findIndex(c => c.id === id);
  if (idx < 0) return null;
  data.contacts[idx] = { ...data.contacts[idx], ...updates, updatedAt: Date.now() };
  saveAll(data);
  return data.contacts[idx];
}

export function deleteContact(id) {
  const data = loadAll();
  if (!data.contacts) return { success: false };
  data.contacts = data.contacts.filter(c => c.id !== id);
  return saveAll(data);
}

// Locations CRUD
export function loadLocations() {
  const data = loadAll();
  return data.locations || [];
}

export function saveLocations(locations) {
  const data = loadAll();
  data.locations = locations;
  return saveAll(data);
}

export function addLocation(name) {
  const data = loadAll();
  if (!data.locations) data.locations = [];
  if (!data.locations.includes(name)) {
    data.locations.push(name);
    saveAll(data);
  }
  return data.locations;
}

export function deleteLocation(name) {
  const data = loadAll();
  if (!data.locations) return [];
  data.locations = data.locations.filter(l => l !== name);
  saveAll(data);
  return data.locations;
}

// Categories CRUD
const DEFAULT_CATEGORIES = ['정기회의', '브레인스토밍', '고객미팅', '1:1', '프로젝트', '교육'];

export function loadCategories() {
  const data = loadAll();
  return data.categories || [...DEFAULT_CATEGORIES];
}

export function saveCategories(categories) {
  const data = loadAll();
  data.categories = categories;
  return saveAll(data);
}

export function addCategory(name) {
  const data = loadAll();
  if (!data.categories) data.categories = [...DEFAULT_CATEGORIES];
  if (!data.categories.includes(name)) {
    data.categories.push(name);
    saveAll(data);
  }
  return data.categories;
}

export function deleteCategory(name) {
  const data = loadAll();
  if (!data.categories) return [];
  data.categories = data.categories.filter(c => c !== name);
  saveAll(data);
  return data.categories;
}

// Meeting Prep Presets
export function loadMeetingPrepPresets() {
  const data = loadAll();
  return data.settings.meetingPrepPresets || [];
}

export function saveMeetingPrepPreset(preset) {
  const data = loadAll();
  if (!data.settings.meetingPrepPresets) data.settings.meetingPrepPresets = [];
  preset.createdAt = Date.now();
  data.settings.meetingPrepPresets.push(preset);
  return saveAll(data);
}

export function deleteMeetingPrepPreset(index) {
  const data = loadAll();
  if (!data.settings.meetingPrepPresets) return { success: false };
  data.settings.meetingPrepPresets.splice(index, 1);
  return saveAll(data);
}

export { getStorageUsage };
