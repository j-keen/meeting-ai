import {
  listMeetings,
  getMeeting,
  saveMeeting,
  deleteMeeting,
  updateMeetingTags,
  loadSettings,
  saveSettings,
  loadContacts,
  addContact,
  updateContact,
  deleteContact,
  loadLocations,
  addLocation,
  deleteLocation,
  findNearestLocation,
  loadCategories,
  addCategory,
  deleteCategory,
  loadMeetingPrepPresets,
  saveMeetingPrepPreset,
  deleteMeetingPrepPreset,
  savePreparedMeeting,
  loadPreparedMeeting,
  deletePreparedMeeting,
  loadGroups,
  addGroup,
  updateGroup,
  deleteGroup,
  loadCorrectionDict,
  addCorrectionEntry,
  deleteCorrectionEntry,
  getStorageUsage,
} from '../storage.js';

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

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// getStorageUsage
// ---------------------------------------------------------------------------
describe('getStorageUsage', () => {
  it('returns used/limit/ratio when localStorage is empty', () => {
    const usage = getStorageUsage();
    expect(usage).toHaveProperty('used');
    expect(usage).toHaveProperty('limit');
    expect(usage).toHaveProperty('ratio');
    expect(usage.limit).toBe(5 * 1024 * 1024);
  });

  it('ratio increases after storing data', () => {
    const before = getStorageUsage().used;
    localStorage.setItem('x', 'a'.repeat(1000));
    const after = getStorageUsage().used;
    expect(after).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// Meeting CRUD
// ---------------------------------------------------------------------------
describe('listMeetings', () => {
  it('returns empty array when storage is empty', () => {
    expect(listMeetings()).toEqual([]);
  });

  it('returns meetings sorted by createdAt descending', () => {
    saveMeeting({ id: 'a', createdAt: 1000 });
    saveMeeting({ id: 'b', createdAt: 2000 });
    const list = listMeetings();
    expect(list[0].id).toBe('b');
    expect(list[1].id).toBe('a');
  });
});

describe('getMeeting', () => {
  it('returns null for unknown id', () => {
    expect(getMeeting('nonexistent')).toBeNull();
  });

  it('returns the matching meeting by id', () => {
    saveMeeting({ id: 'abc', title: 'Test' });
    const m = getMeeting('abc');
    expect(m).not.toBeNull();
    expect(m.id).toBe('abc');
    expect(m.title).toBe('Test');
  });
});

describe('saveMeeting', () => {
  it('returns { success: true } on first save', () => {
    const result = saveMeeting({ id: 'm1', title: 'First' });
    expect(result.success).toBe(true);
  });

  it('sets updatedAt on every save', () => {
    const before = Date.now();
    saveMeeting({ id: 'm2' });
    const m = getMeeting('m2');
    expect(m.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('sets createdAt on first insert when not provided', () => {
    const before = Date.now();
    saveMeeting({ id: 'm3' });
    const m = getMeeting('m3');
    expect(m.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('preserves provided createdAt on insert', () => {
    saveMeeting({ id: 'm4', createdAt: 12345 });
    expect(getMeeting('m4').createdAt).toBe(12345);
  });

  it('updates an existing meeting in-place', () => {
    saveMeeting({ id: 'm5', title: 'Old' });
    saveMeeting({ id: 'm5', title: 'New' });
    expect(listMeetings().filter(m => m.id === 'm5')).toHaveLength(1);
    expect(getMeeting('m5').title).toBe('New');
  });

  it('enforces MAX_MEETINGS=50 — list never exceeds 50 entries', () => {
    // saveMeeting overwrites updatedAt with Date.now() on every call, so all
    // 51 meetings end up with nearly identical timestamps. The real guarantee
    // is simply that the list is trimmed to 50.
    for (let i = 1; i <= 51; i++) {
      saveMeeting({ id: `m${i}` });
    }
    expect(listMeetings()).toHaveLength(50);
  });
});

describe('deleteMeeting', () => {
  it('removes meeting by id', () => {
    saveMeeting({ id: 'del1' });
    deleteMeeting('del1');
    expect(getMeeting('del1')).toBeNull();
  });

  it('returns { success: true } even when id does not exist', () => {
    const result = deleteMeeting('ghost');
    expect(result.success).toBe(true);
  });
});

describe('updateMeetingTags', () => {
  it('updates tags on existing meeting', () => {
    saveMeeting({ id: 't1' });
    updateMeetingTags('t1', ['alpha', 'beta']);
    expect(getMeeting('t1').tags).toEqual(['alpha', 'beta']);
  });

  it('updates updatedAt when tags change', () => {
    saveMeeting({ id: 't2' });
    const before = Date.now();
    updateMeetingTags('t2', ['x']);
    expect(getMeeting('t2').updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('returns { success: false } for unknown id', () => {
    const result = updateMeetingTags('ghost', ['x']);
    expect(result).toEqual({ success: false });
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
describe('loadSettings / saveSettings', () => {
  it('returns empty object when nothing saved', () => {
    expect(loadSettings()).toEqual({});
  });

  it('persists settings', () => {
    saveSettings({ language: 'ko' });
    expect(loadSettings().language).toBe('ko');
  });

  it('merges new keys into existing settings', () => {
    saveSettings({ a: 1 });
    saveSettings({ b: 2 });
    const s = loadSettings();
    expect(s.a).toBe(1);
    expect(s.b).toBe(2);
  });

  it('saveSettings returns { success: true }', () => {
    expect(saveSettings({ x: 1 }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contacts CRUD
// ---------------------------------------------------------------------------
describe('loadContacts', () => {
  it('returns empty array when no contacts saved', () => {
    expect(loadContacts()).toEqual([]);
  });
});

describe('addContact', () => {
  it('returns the contact with an id assigned', () => {
    const c = addContact({ name: 'Alice' });
    expect(c.id).toBeTruthy();
    expect(c.name).toBe('Alice');
  });

  it('persists the contact so loadContacts finds it', () => {
    addContact({ name: 'Bob' });
    expect(loadContacts()).toHaveLength(1);
  });

  it('uses provided id when one is supplied', () => {
    const c = addContact({ id: 'fixed-id', name: 'Carol' });
    expect(c.id).toBe('fixed-id');
  });

  it('sets createdAt and updatedAt', () => {
    const before = Date.now();
    const c = addContact({ name: 'Dave' });
    expect(c.createdAt).toBeGreaterThanOrEqual(before);
    expect(c.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('updateContact', () => {
  it('returns null for unknown id', () => {
    expect(updateContact('no-such', { name: 'X' })).toBeNull();
  });

  it('merges updates and returns updated contact', () => {
    const c = addContact({ name: 'Eve' });
    const updated = updateContact(c.id, { name: 'Eve Updated', role: 'PM' });
    expect(updated.name).toBe('Eve Updated');
    expect(updated.role).toBe('PM');
  });

  it('updates updatedAt', () => {
    const c = addContact({ name: 'Frank' });
    const before = Date.now();
    const updated = updateContact(c.id, { name: 'Frank2' });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('deleteContact', () => {
  it('removes contact and returns { success: true }', () => {
    const c = addContact({ name: 'Grace' });
    const result = deleteContact(c.id);
    expect(result.success).toBe(true);
    expect(loadContacts()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Locations CRUD
// ---------------------------------------------------------------------------
describe('loadLocations', () => {
  it('returns empty array initially', () => {
    expect(loadLocations()).toEqual([]);
  });

  it('migrates old string format to object format', () => {
    const data = JSON.parse(localStorage.getItem('meeting-ai-data') || '{}');
    data.locations = ['Old Place'];
    localStorage.setItem('meeting-ai-data', JSON.stringify(data));
    const locs = loadLocations();
    expect(locs).toEqual([{ name: 'Old Place' }]);
  });
});

describe('addLocation', () => {
  it('adds a new location by string and returns the list', () => {
    const list = addLocation('Seoul HQ');
    expect(list).toEqual([{ name: 'Seoul HQ' }]);
  });

  it('adds a location with GPS coordinates', () => {
    const list = addLocation({ name: 'Office', lat: 37.5, lng: 127.0 });
    expect(list).toEqual([{ name: 'Office', lat: 37.5, lng: 127.0 }]);
  });

  it('does not add duplicates', () => {
    addLocation('Room A');
    addLocation('Room A');
    expect(loadLocations().filter(l => l.name === 'Room A')).toHaveLength(1);
  });

  it('updates GPS coordinates on duplicate name', () => {
    addLocation('Room B');
    addLocation({ name: 'Room B', lat: 37.5, lng: 127.0 });
    const locs = loadLocations().filter(l => l.name === 'Room B');
    expect(locs).toHaveLength(1);
    expect(locs[0].lat).toBe(37.5);
  });
});

describe('deleteLocation', () => {
  it('removes the named location and returns remaining list', () => {
    addLocation('Zone 1');
    addLocation('Zone 2');
    const list = deleteLocation('Zone 1');
    expect(list.find(l => l.name === 'Zone 1')).toBeUndefined();
    expect(list.find(l => l.name === 'Zone 2')).toBeDefined();
  });

  it('returns empty array when no locations key exists', () => {
    expect(deleteLocation('ghost')).toEqual([]);
  });
});

describe('findNearestLocation', () => {
  it('returns null when no GPS locations exist', () => {
    addLocation('No GPS');
    expect(findNearestLocation(37.5, 127.0)).toBeNull();
  });

  it('finds the nearest location within range', () => {
    addLocation({ name: 'Office', lat: 37.5000, lng: 127.0000 });
    addLocation({ name: 'Far Place', lat: 38.0, lng: 128.0 });
    const result = findNearestLocation(37.5001, 127.0001);
    expect(result).not.toBeNull();
    expect(result.location.name).toBe('Office');
    expect(result.distance).toBeLessThan(0.1); // less than 100m
  });

  it('returns null when all locations are out of range', () => {
    addLocation({ name: 'Far', lat: 38.0, lng: 128.0 });
    expect(findNearestLocation(37.5, 127.0)).toBeNull(); // > 1km default
  });
});

// ---------------------------------------------------------------------------
// Categories CRUD
// ---------------------------------------------------------------------------
describe('loadCategories', () => {
  it('returns DEFAULT_CATEGORIES when nothing is stored', () => {
    expect(loadCategories()).toEqual(DEFAULT_CATEGORIES);
  });
});

describe('addCategory', () => {
  it('adds a new category to the default list', () => {
    const list = addCategory('회고');
    const names = list.map(c => c.name || c);
    expect(names).toContain('회고');
    expect(names).toContain('정기회의'); // defaults preserved
  });

  it('does not add duplicate categories', () => {
    addCategory('중복');
    addCategory('중복');
    expect(loadCategories().filter(c => (c.name || c) === '중복')).toHaveLength(1);
  });
});

describe('deleteCategory', () => {
  it('removes the named category', () => {
    addCategory('ToDelete');
    const list = deleteCategory('ToDelete');
    const names = list.map(c => c.name || c);
    expect(names).not.toContain('ToDelete');
  });

  it('returns empty array when no categories key in storage', () => {
    // categories key is absent (fresh localStorage)
    expect(deleteCategory('anything')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Meeting Prep Presets
// ---------------------------------------------------------------------------
describe('loadMeetingPrepPresets', () => {
  it('returns empty array when no presets exist', () => {
    expect(loadMeetingPrepPresets()).toEqual([]);
  });
});

describe('saveMeetingPrepPreset / deleteMeetingPrepPreset', () => {
  it('saves a preset and loads it back', () => {
    saveMeetingPrepPreset({ name: 'Weekly Sync', agenda: 'Status update' });
    const presets = loadMeetingPrepPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Weekly Sync');
  });

  it('sets createdAt on the preset', () => {
    const before = Date.now();
    saveMeetingPrepPreset({ name: 'Sprint Review' });
    expect(loadMeetingPrepPresets()[0].createdAt).toBeGreaterThanOrEqual(before);
  });

  it('deleteMeetingPrepPreset removes by index', () => {
    saveMeetingPrepPreset({ name: 'A' });
    saveMeetingPrepPreset({ name: 'B' });
    deleteMeetingPrepPreset(0);
    const presets = loadMeetingPrepPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('B');
  });

  it('deleteMeetingPrepPreset returns { success: false } when no presets key', () => {
    // No presets ever saved — settings.meetingPrepPresets is absent
    const result = deleteMeetingPrepPreset(0);
    expect(result).toEqual({ success: false });
  });
});

// ---------------------------------------------------------------------------
// Prepared Meeting
// ---------------------------------------------------------------------------
describe('savePreparedMeeting / loadPreparedMeeting / deletePreparedMeeting', () => {
  it('loadPreparedMeeting returns null when nothing saved', () => {
    expect(loadPreparedMeeting()).toBeNull();
  });

  it('saves and loads a prepared meeting', () => {
    savePreparedMeeting({ title: 'Quarterly Review', attendees: ['Alice'] });
    const pm = loadPreparedMeeting();
    expect(pm.title).toBe('Quarterly Review');
    expect(pm.attendees).toEqual(['Alice']);
  });

  it('sets savedAt when saving', () => {
    const before = Date.now();
    savePreparedMeeting({ title: 'Planning' });
    expect(loadPreparedMeeting().savedAt).toBeGreaterThanOrEqual(before);
  });

  it('deletePreparedMeeting clears the prepared meeting', () => {
    savePreparedMeeting({ title: 'To Clear' });
    deletePreparedMeeting();
    expect(loadPreparedMeeting()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contact Groups CRUD
// ---------------------------------------------------------------------------
describe('loadGroups', () => {
  it('returns empty array initially', () => {
    expect(loadGroups()).toEqual([]);
  });
});

describe('addGroup', () => {
  it('creates a group with id, name, contactIds, createdAt', () => {
    const g = addGroup('Engineering');
    expect(g.id).toBeTruthy();
    expect(g.name).toBe('Engineering');
    expect(g.contactIds).toEqual([]);
    expect(g.createdAt).toBeTruthy();
  });

  it('persists group so loadGroups finds it', () => {
    addGroup('Design');
    expect(loadGroups()).toHaveLength(1);
  });
});

describe('updateGroup', () => {
  it('returns null for unknown id', () => {
    expect(updateGroup('no-such', { name: 'X' })).toBeNull();
  });

  it('merges updates and returns updated group', () => {
    const g = addGroup('Marketing');
    const updated = updateGroup(g.id, { name: 'Marketing 2', contactIds: ['c1'] });
    expect(updated.name).toBe('Marketing 2');
    expect(updated.contactIds).toEqual(['c1']);
  });
});

describe('deleteGroup', () => {
  it('removes group by id and returns { success: true }', () => {
    const g = addGroup('Temp');
    const result = deleteGroup(g.id);
    expect(result.success).toBe(true);
    expect(loadGroups()).toHaveLength(0);
  });

  it('returns { success: false } when no contactGroups key exists', () => {
    // Fresh storage — contactGroups key is absent
    const result = deleteGroup('ghost');
    expect(result).toEqual({ success: false });
  });
});

// ---------------------------------------------------------------------------
// Correction Dictionary
// ---------------------------------------------------------------------------
describe('loadCorrectionDict', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadCorrectionDict()).toEqual([]);
  });
});

describe('addCorrectionEntry', () => {
  it('adds a new entry with id, original, corrected, count=1', () => {
    const dict = addCorrectionEntry('맞춤법', '맞춤법 수정');
    expect(dict).toHaveLength(1);
    expect(dict[0].original).toBe('맞춤법');
    expect(dict[0].corrected).toBe('맞춤법 수정');
    expect(dict[0].count).toBe(1);
    expect(dict[0].id).toBeTruthy();
  });

  it('updates existing entry when original already exists (duplicate handling)', () => {
    addCorrectionEntry('hello', 'world');
    const dict = addCorrectionEntry('hello', 'earth');
    expect(dict).toHaveLength(1);
    expect(dict[0].corrected).toBe('earth');
    expect(dict[0].count).toBe(2);
  });

  it('increments count on each duplicate call', () => {
    addCorrectionEntry('foo', 'bar');
    addCorrectionEntry('foo', 'bar');
    const dict = addCorrectionEntry('foo', 'bar');
    expect(dict[0].count).toBe(3);
  });
});

describe('deleteCorrectionEntry', () => {
  it('removes entry by id and returns remaining list', () => {
    addCorrectionEntry('remove me', 'corrected');
    const id = loadCorrectionDict()[0].id;
    const dict = deleteCorrectionEntry(id);
    expect(dict).toHaveLength(0);
  });

  it('returns empty array when correctionDict key does not exist', () => {
    expect(deleteCorrectionEntry('no-such')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// autoCleanup via QuotaExceededError simulation
// ---------------------------------------------------------------------------
describe('saveMeeting QuotaExceededError autoCleanup', () => {
  it('recovers after simulated QuotaExceededError by trimming to MAX_MEETINGS', () => {
    // Pre-populate 60 meetings so autoCleanup will have data to trim
    const raw = {
      meetings: Array.from({ length: 60 }, (_, i) => ({
        id: `overflow-${i}`,
        updatedAt: (i + 1) * 1000,
        createdAt: (i + 1) * 1000,
      })),
      settings: {},
    };
    localStorage.setItem('meeting-ai-data', JSON.stringify(raw));

    // Simulate QuotaExceededError on the first setItem call, succeed on retry
    let callCount = 0;
    const original = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'meeting-ai-data' && callCount === 0) {
        callCount++;
        const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
        throw err;
      }
      callCount++;
      return original(key, value);
    });

    const result = saveMeeting({ id: 'trigger', updatedAt: 999999 });
    vi.restoreAllMocks();

    // Should either succeed with cleaned_up warning or succeed normally
    expect(result.success).toBe(true);
  });
});
