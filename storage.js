// storage.js - localStorage CRUD for meetings, settings, speaker presets

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

// Contacts CRUD
export function loadContacts() {
  const data = loadAll();
  return data.contacts || [];
}

export function addContact(contact) {
  const data = loadAll();
  if (!data.contacts) data.contacts = [];
  contact.id = contact.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  contact.starred = contact.starred || false;
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

// Locations CRUD — each location is { name, lat?, lng? }
// Backward compat: migrate old string[] format on load
function migrateLocations(arr) {
  if (!arr) return [];
  return arr.map(l => typeof l === 'string' ? { name: l } : l);
}

export function loadLocations() {
  const data = loadAll();
  return migrateLocations(data.locations);
}

export function addLocation(nameOrObj) {
  const data = loadAll();
  data.locations = migrateLocations(data.locations);
  const loc = typeof nameOrObj === 'string' ? { name: nameOrObj } : nameOrObj;
  if (!loc.name) return data.locations;
  const existing = data.locations.find(l => l.name === loc.name);
  if (existing) {
    // Update coordinates if provided
    if (loc.lat != null && loc.lng != null) {
      existing.lat = loc.lat;
      existing.lng = loc.lng;
    }
  } else {
    data.locations.push(loc);
  }
  saveAll(data);
  return data.locations;
}

export function deleteLocation(name) {
  const data = loadAll();
  if (!data.locations) return [];
  data.locations = migrateLocations(data.locations);
  data.locations = data.locations.filter(l => l.name !== name);
  saveAll(data);
  return data.locations;
}

export function updateLocation(name, updates) {
  const data = loadAll();
  data.locations = migrateLocations(data.locations);
  const loc = data.locations.find(l => l.name === name);
  if (!loc) return null;
  Object.assign(loc, updates);
  saveAll(data);
  return loc;
}

export function getLocationFrequency() {
  const meetings = listMeetings();
  const freq = {};
  for (const m of meetings) {
    if (m.location) {
      freq[m.location] = (freq[m.location] || 0) + 1;
    }
  }
  return freq;
}

// Location Groups CRUD
export function loadLocationGroups() {
  const data = loadAll();
  return data.locationGroups || [];
}

export function addLocationGroup(name) {
  const data = loadAll();
  if (!data.locationGroups) data.locationGroups = [];
  const group = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    createdAt: Date.now(),
  };
  data.locationGroups.push(group);
  saveAll(data);
  return group;
}

export function deleteLocationGroup(id) {
  const data = loadAll();
  if (!data.locationGroups) return { success: false };
  // Remove group assignment from locations
  data.locations = migrateLocations(data.locations);
  for (const loc of data.locations) {
    if (loc.group === id) delete loc.group;
  }
  data.locationGroups = data.locationGroups.filter(g => g.id !== id);
  saveAll(data);
  return { success: true };
}

// Find nearest saved location by GPS coordinates (returns { location, distance } or null)
export function findNearestLocation(lat, lng, maxDistanceKm = 1) {
  const locations = loadLocations().filter(l => l.lat != null && l.lng != null);
  if (locations.length === 0) return null;

  let nearest = null;
  let minDist = Infinity;
  for (const loc of locations) {
    const d = haversineKm(lat, lng, loc.lat, loc.lng);
    if (d < minDist) {
      minDist = d;
      nearest = loc;
    }
  }
  return minDist <= maxDistanceKm ? { location: nearest, distance: minDist } : null;
}

// Find locations within a radius (returns array of { location, distance })
export function findNearbyLocations(lat, lng, maxDistanceKm = 0.1) {
  const locations = loadLocations().filter(l => l.lat != null && l.lng != null);
  return locations
    .map(loc => ({ location: loc, distance: haversineKm(lat, lng, loc.lat, loc.lng) }))
    .filter(r => r.distance <= maxDistanceKm);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Categories CRUD
const DEFAULT_CATEGORIES = [
  { name: '정기회의', hint: '' },
  { name: '브레인스토밍', hint: '' },
  { name: '고객미팅', hint: '' },
  { name: '1:1', hint: '' },
  { name: '프로젝트', hint: '' },
  { name: '교육', hint: '' },
  { name: '리뷰', hint: '' },
  { name: '보고', hint: '' },
];

function migrateCategories(cats) {
  return cats.map(c => typeof c === 'string' ? { name: c, hint: '' } : c);
}

export function loadCategories() {
  const data = loadAll();
  if (!data.categories) return [...DEFAULT_CATEGORIES];
  return migrateCategories(data.categories);
}

export function addCategory(name, hint = '') {
  const data = loadAll();
  if (!data.categories) data.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  data.categories = migrateCategories(data.categories);
  if (!data.categories.some(c => c.name === name)) {
    data.categories.push({ name, hint });
    saveAll(data);
  }
  return data.categories;
}

export function deleteCategory(name) {
  const data = loadAll();
  if (!data.categories) return [];
  data.categories = migrateCategories(data.categories).filter(c => c.name !== name);
  saveAll(data);
  return data.categories;
}

export function updateCategoryHint(name, hint) {
  const data = loadAll();
  if (!data.categories) data.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  data.categories = migrateCategories(data.categories);
  const cat = data.categories.find(c => c.name === name);
  if (cat) {
    cat.hint = hint;
    saveAll(data);
  }
  return data.categories;
}

// Per-type custom prompts
export function loadTypePrompts() {
  const data = loadAll();
  return data.settings?.typePrompts || {};
}

export function saveTypePrompt(type, prompt) {
  const data = loadAll();
  if (!data.settings) data.settings = {};
  if (!data.settings.typePrompts) data.settings.typePrompts = {};
  data.settings.typePrompts[type] = prompt;
  return saveAll(data);
}

export function deleteTypePrompt(type) {
  const data = loadAll();
  if (data.settings?.typePrompts) {
    delete data.settings.typePrompts[type];
    return saveAll(data);
  }
  return { success: true };
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

// Prepared Meeting (save for later)
export function savePreparedMeeting(config) {
  const data = loadAll();
  data.preparedMeeting = { ...config, savedAt: Date.now() };
  return saveAll(data);
}

export function loadPreparedMeeting() {
  const data = loadAll();
  return data.preparedMeeting || null;
}

export function deletePreparedMeeting() {
  const data = loadAll();
  data.preparedMeeting = null;
  return saveAll(data);
}

// Contact Groups CRUD
export function loadGroups() {
  const data = loadAll();
  return data.contactGroups || [];
}

export function addGroup(name) {
  const data = loadAll();
  if (!data.contactGroups) data.contactGroups = [];
  const group = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    contactIds: [],
    createdAt: Date.now(),
  };
  data.contactGroups.push(group);
  saveAll(data);
  return group;
}

export function updateGroup(id, updates) {
  const data = loadAll();
  if (!data.contactGroups) return null;
  const idx = data.contactGroups.findIndex(g => g.id === id);
  if (idx < 0) return null;
  data.contactGroups[idx] = { ...data.contactGroups[idx], ...updates };
  saveAll(data);
  return data.contactGroups[idx];
}

export function deleteGroup(id) {
  const data = loadAll();
  if (!data.contactGroups) return { success: false };
  data.contactGroups = data.contactGroups.filter(g => g.id !== id);
  return saveAll(data);
}

// Correction Dictionary (global, cross-meeting)
export function loadCorrectionDict() {
  const data = loadAll();
  return data.correctionDict || [];
}

export function addCorrectionEntry(original, corrected) {
  const data = loadAll();
  if (!data.correctionDict) data.correctionDict = [];
  // Check for duplicate original
  const existing = data.correctionDict.find(e => e.original === original);
  if (existing) {
    existing.corrected = corrected;
    existing.count = (existing.count || 1) + 1;
    existing.updatedAt = Date.now();
  } else {
    data.correctionDict.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      original,
      corrected,
      count: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  saveAll(data);
  return data.correctionDict;
}

export function deleteCorrectionEntry(id) {
  const data = loadAll();
  if (!data.correctionDict) return [];
  data.correctionDict = data.correctionDict.filter(e => e.id !== id);
  saveAll(data);
  return data.correctionDict;
}

// Pro usage tracking (monthly reset)
const PRO_USAGE_KEY = 'meeting_pro_usage';

export function getProUsageCount() {
  try {
    const raw = localStorage.getItem(PRO_USAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    if (data.month !== currentMonth) return 0;
    return data.count || 0;
  } catch {
    return 0;
  }
}

export function incrementProUsage() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  let count = 0;
  try {
    const raw = localStorage.getItem(PRO_USAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.month === currentMonth) count = data.count || 0;
    }
  } catch { /* reset */ }
  count++;
  localStorage.setItem(PRO_USAGE_KEY, JSON.stringify({ count, month: currentMonth }));
  return count;
}

// Custom Meeting Types CRUD
export function loadCustomTypes() {
  const data = loadAll();
  return data.customTypes || [];
}

export function addCustomType(type) {
  const data = loadAll();
  if (!data.customTypes) data.customTypes = [];
  type.id = type.id || 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  type.createdAt = Date.now();
  data.customTypes.push(type);
  saveAll(data);
  return type;
}

export function deleteCustomType(id) {
  const data = loadAll();
  if (!data.customTypes) return [];
  data.customTypes = data.customTypes.filter(t => t.id !== id);
  saveAll(data);
  return data.customTypes;
}

export { getStorageUsage };
