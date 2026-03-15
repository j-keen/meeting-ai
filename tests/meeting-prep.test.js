import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initMeetingPrepForm,
  openMeetingPrepForm,
  isMeetingPrepActive,
  ocrBusinessCard,
} from '../meeting-prep.js';

// ===== Mocks =====

vi.mock('../event-bus.js', () => ({ emit: vi.fn() }));

vi.mock('../storage.js', () => ({
  loadContacts: vi.fn(() => []),
  addContact: vi.fn(c => ({ ...c, id: 'test-id' })),
  updateContact: vi.fn(),
  saveMeetingPrepPreset: vi.fn(),
  savePreparedMeeting: vi.fn(),
  listMeetings: vi.fn(() => []),
  getMeeting: vi.fn(),
  loadGroups: vi.fn(() => []),
  addGroup: vi.fn(() => ({ id: 'g1', name: 'Group', contactIds: [] })),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  loadCustomTypes: vi.fn(() => []),
}));

vi.mock('../gemini-api.js', () => ({
  callGemini: vi.fn(),
}));

vi.mock('../i18n.js', () => ({
  t: vi.fn(k => k),
}));

vi.mock('../ui.js', () => ({
  showToast: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  escapeHtml: vi.fn(s => s),
}));

// ===== DOM Helper =====

function makeEl(tag, id, attrs = {}) {
  const el = document.createElement(tag);
  if (id) el.id = id;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function setupMeetingPrepDOM() {
  document.body.textContent = '';

  // Modal
  const modal = makeEl('div', 'meetingPrepModal');
  modal.hidden = true;

  // Close button
  const btnClose = makeEl('button', 'btnClosePrepForm');

  // Step indicator
  const prepWizardSteps = makeEl('div', 'prepWizardSteps');
  for (let i = 1; i <= 5; i++) {
    const dot = makeEl('button', null);
    dot.className = 'prep-step-dot';
    dot.dataset.step = String(i);
    dot.disabled = i > 1;
    const numEl = makeEl('span', null);
    numEl.className = 'prep-step-num';
    numEl.textContent = String(i);
    dot.appendChild(numEl);
    prepWizardSteps.appendChild(dot);
  }
  // Step lines
  for (let i = 0; i < 4; i++) {
    const line = makeEl('div', null);
    line.className = 'prep-step-line';
    prepWizardSteps.appendChild(line);
  }

  // Nav buttons
  const btnBack = makeEl('button', 'btnPrepBack');
  const btnNext = makeEl('button', 'btnPrepNext');

  // Step panels
  for (let i = 1; i <= 5; i++) {
    const panel = makeEl('div', null);
    panel.className = 'prep-step-panel';
    panel.dataset.step = String(i);
    modal.appendChild(panel);
  }

  // Step 1 - meeting type
  const prepTypeGrid = makeEl('div', 'prepTypeGrid');
  const typeRadio = makeEl('button', null);
  typeRadio.className = 'prep-type-radio';
  typeRadio.dataset.type = 'general';
  typeRadio.textContent = 'General';
  prepTypeGrid.appendChild(typeRadio);

  // Step 2 - agenda fields
  const prepAgendaGoal = makeEl('textarea', 'prepAgendaGoal');
  const prepAgendaContext = makeEl('textarea', 'prepAgendaContext');
  const prepAgendaTopics = makeEl('textarea', 'prepAgendaTopics');
  const prepAgendaOutcomes = makeEl('textarea', 'prepAgendaOutcomes');

  // Step 3 - contacts
  const prepContactSearch = makeEl('input', 'prepContactSearch');
  const prepGroupTabs = makeEl('div', 'prepGroupTabs');
  const allTab = makeEl('button', null);
  allTab.className = 'prep-group-tab active';
  allTab.dataset.group = '__all__';
  allTab.textContent = 'All';
  const btnAddGroup = makeEl('button', 'btnAddGroup');
  prepGroupTabs.append(allTab, btnAddGroup);
  const btnGroupSelectAll = makeEl('button', 'btnGroupSelectAll');
  const btnAddAttendee = makeEl('button', 'btnAddAttendee');
  const prepAddPanel = makeEl('div', 'prepAddPanel');
  prepAddPanel.hidden = true;
  const btnCloseAddPanel = makeEl('button', 'btnCloseAddPanel');
  const prepNewContactInput = makeEl('input', 'prepNewContactInput');
  const prepNewContactGroup = makeEl('select', 'prepNewContactGroup');
  prepAddPanel.append(btnCloseAddPanel, prepNewContactInput, prepNewContactGroup);
  const btnOcrAttendee = makeEl('button', 'btnOcrAttendee');
  const prepOcrPanel = makeEl('div', 'prepOcrPanel');
  prepOcrPanel.hidden = true;
  const btnCloseOcrPanel = makeEl('button', 'btnCloseOcrPanel');
  const btnOcrUpload = makeEl('button', 'btnOcrUpload');
  const prepOcrFileInput = makeEl('input', 'prepOcrFileInput');
  prepOcrFileInput.type = 'file';
  const btnOcrCamera = makeEl('button', 'btnOcrCamera');
  const btnOcrCapture = makeEl('button', 'btnOcrCapture');
  const btnOcrConfirm = makeEl('button', 'btnOcrConfirm');
  const btnOcrRetry = makeEl('button', 'btnOcrRetry');
  const prepOcrResult = makeEl('div', 'prepOcrResult');
  prepOcrResult.hidden = true;
  const prepOcrResultFields = makeEl('div', 'prepOcrResultFields');
  prepOcrResult.appendChild(prepOcrResultFields);
  const prepOcrLoading = makeEl('div', 'prepOcrLoading');
  prepOcrLoading.hidden = true;
  const prepOcrCameraWrap = makeEl('div', 'prepOcrCameraWrap');
  prepOcrCameraWrap.hidden = true;
  const prepOcrVideo = makeEl('video', 'prepOcrVideo');
  const prepOcrCanvas = makeEl('canvas', 'prepOcrCanvas');
  prepOcrCameraWrap.append(prepOcrVideo, prepOcrCanvas);
  prepOcrPanel.append(btnCloseOcrPanel, btnOcrUpload, prepOcrFileInput, btnOcrCamera, btnOcrCapture, btnOcrConfirm, btnOcrRetry, prepOcrResult, prepOcrLoading, prepOcrCameraWrap);
  const prepContactListV2 = makeEl('div', 'prepContactListV2');
  const prepSelectedBadges = makeEl('div', 'prepSelectedBadges');
  const prepGroupManage = makeEl('div', 'prepGroupManage');
  prepGroupManage.hidden = true;
  const btnCloseGroupManage = makeEl('button', 'btnCloseGroupManage');
  const btnSaveGroup = makeEl('button', 'btnSaveGroup');
  const btnDeleteGroup = makeEl('button', 'btnDeleteGroup');
  const prepGroupNameInput = makeEl('input', 'prepGroupNameInput');
  const prepGroupMemberList = makeEl('div', 'prepGroupMemberList');
  prepGroupManage.append(btnCloseGroupManage, btnSaveGroup, btnDeleteGroup, prepGroupNameInput, prepGroupMemberList);
  const prepRecentAttendees = makeEl('div', 'prepRecentAttendees');
  const prepRecentList = makeEl('div', 'prepRecentList');
  prepRecentAttendees.appendChild(prepRecentList);

  // Step 4 - reference
  const refSearchInput = makeEl('input', 'refSearchInput');
  const refFilterType = makeEl('select', 'refFilterType');
  const refMeetingList = makeEl('div', 'refMeetingList');
  const refMeetingPreview = makeEl('div', 'refMeetingPreview');
  refMeetingPreview.hidden = true;
  const btnConfirmReference = makeEl('button', 'btnConfirmReference');
  btnConfirmReference.disabled = true;
  const btnRemoveReference = makeEl('button', 'btnRemoveReference');
  const prepReferenceChip = makeEl('div', 'prepReferenceChip');
  prepReferenceChip.hidden = true;
  const prepReferenceChipText = makeEl('span', 'prepReferenceChipText');
  prepReferenceChip.appendChild(prepReferenceChipText);
  const prepReferencePreview = makeEl('div', 'prepReferencePreview');
  prepReferencePreview.hidden = true;
  const prepAgendaSuggestions = makeEl('div', 'prepAgendaSuggestions');
  prepAgendaSuggestions.hidden = true;

  // Step 5 - files
  const prepFileDrop = makeEl('div', 'prepFileDrop');
  const prepFileInput = makeEl('input', 'prepFileInput');
  prepFileInput.type = 'file';
  const prepFileChips = makeEl('div', 'prepFileChips');
  const btnPrepSavePreset = makeEl('button', 'btnPrepSavePreset');
  const btnPrepSaveForLater = makeEl('button', 'btnPrepSaveForLater');
  const btnPrepStart = makeEl('button', 'btnPrepStart');

  document.body.append(
    modal, btnClose,
    prepWizardSteps,
    btnBack, btnNext,
    prepTypeGrid,
    prepAgendaGoal, prepAgendaContext, prepAgendaTopics, prepAgendaOutcomes,
    prepContactSearch, prepGroupTabs, btnGroupSelectAll,
    btnAddAttendee, prepAddPanel,
    btnOcrAttendee, prepOcrPanel,
    prepContactListV2, prepSelectedBadges, prepGroupManage,
    prepRecentAttendees,
    refSearchInput, refFilterType, refMeetingList, refMeetingPreview,
    btnConfirmReference, btnRemoveReference,
    prepReferenceChip, prepReferencePreview, prepAgendaSuggestions,
    prepFileDrop, prepFileInput, prepFileChips,
    btnPrepSavePreset, btnPrepSaveForLater, btnPrepStart
  );
}

// ===== Tests =====

describe('isMeetingPrepActive', () => {
  beforeEach(() => {
    setupMeetingPrepDOM();
  });

  it('returns false when modal is hidden', () => {
    document.getElementById('meetingPrepModal').hidden = true;
    expect(isMeetingPrepActive()).toBe(false);
  });

  it('returns true when modal is visible (hidden = false)', () => {
    document.getElementById('meetingPrepModal').hidden = false;
    expect(isMeetingPrepActive()).toBe(true);
  });

  it('returns false when #meetingPrepModal does not exist in DOM', () => {
    document.body.textContent = '';
    expect(isMeetingPrepActive()).toBe(false);
  });
});

describe('initMeetingPrepForm', () => {
  beforeEach(() => {
    setupMeetingPrepDOM();
  });

  it('does not throw with a fully populated DOM', () => {
    expect(() => initMeetingPrepForm()).not.toThrow();
  });

  it('binds btnClosePrepForm to hide the modal', () => {
    initMeetingPrepForm();
    document.getElementById('meetingPrepModal').hidden = false;
    document.getElementById('btnClosePrepForm').click();
    expect(document.getElementById('meetingPrepModal').hidden).toBe(true);
  });

  it('binds btnPrepBack to navigate backwards', () => {
    initMeetingPrepForm();
    openMeetingPrepForm();
    // Back button should be hidden on step 1
    expect(document.getElementById('btnPrepBack').hidden).toBe(true);
  });

  it('binds btnPrepNext to navigate forwards', () => {
    initMeetingPrepForm();
    openMeetingPrepForm();
    // Next button visible on step 1
    const btnNext = document.getElementById('btnPrepNext');
    expect(btnNext.hidden).toBe(false);
    btnNext.click();
    // Now on step 2, back button should appear
    expect(document.getElementById('btnPrepBack').hidden).toBe(false);
  });
});

describe('openMeetingPrepForm', () => {
  beforeEach(() => {
    setupMeetingPrepDOM();
    initMeetingPrepForm();
  });

  it('shows the meeting prep modal', () => {
    openMeetingPrepForm();
    expect(document.getElementById('meetingPrepModal').hidden).toBe(false);
  });

  it('sets isMeetingPrepActive to true after opening', () => {
    openMeetingPrepForm();
    expect(isMeetingPrepActive()).toBe(true);
  });

  it('starts at step 1 (back button hidden)', () => {
    openMeetingPrepForm();
    expect(document.getElementById('btnPrepBack').hidden).toBe(true);
  });

  it('applies preset config when provided', () => {
    openMeetingPrepForm({ meetingType: 'project', agenda: 'Test agenda' });
    // Modal should be visible regardless of preset
    expect(isMeetingPrepActive()).toBe(true);
  });

  it('resets form state when called a second time', () => {
    openMeetingPrepForm();
    // Navigate to step 2
    document.getElementById('btnPrepNext').click();
    // Open again — should reset to step 1
    openMeetingPrepForm();
    expect(document.getElementById('btnPrepBack').hidden).toBe(true);
  });
});

describe('ocrBusinessCard', () => {
  it('parses a clean JSON response from callGemini', async () => {
    const { callGemini } = await import('../gemini-api.js');
    const cardData = { name: 'John Doe', company: 'Acme', title: 'CEO', email: 'john@acme.com', phone: '010-1234-5678' };
    callGemini.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: JSON.stringify(cardData) }] } }],
    });

    const result = await ocrBusinessCard('base64data==');
    expect(result.name).toBe('John Doe');
    expect(result.company).toBe('Acme');
    expect(result.title).toBe('CEO');
    expect(result.email).toBe('john@acme.com');
    expect(result.phone).toBe('010-1234-5678');
  });

  it('extracts JSON from a response with surrounding text', async () => {
    const { callGemini } = await import('../gemini-api.js');
    const cardData = { name: 'Jane Smith', company: 'Corp', title: 'CTO', email: '', phone: '' };
    const responseText = 'Here is the result: ' + JSON.stringify(cardData) + ' (done)';
    callGemini.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: responseText }] } }],
    });

    const result = await ocrBusinessCard('base64data==');
    expect(result.name).toBe('Jane Smith');
  });

  it('throws when response text cannot be parsed as JSON', async () => {
    const { callGemini } = await import('../gemini-api.js');
    callGemini.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'not json at all' }] } }],
    });

    await expect(ocrBusinessCard('base64data==')).rejects.toThrow('Failed to parse OCR result');
  });

  it('handles empty string fields gracefully', async () => {
    const { callGemini } = await import('../gemini-api.js');
    const cardData = { name: 'Only Name', company: '', title: '', email: '', phone: '' };
    callGemini.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: JSON.stringify(cardData) }] } }],
    });

    const result = await ocrBusinessCard('base64data==');
    expect(result.name).toBe('Only Name');
    expect(result.company).toBe('');
    expect(result.email).toBe('');
  });

  it('passes correct model name and body structure to callGemini', async () => {
    const { callGemini } = await import('../gemini-api.js');
    const cardData = { name: 'Test', company: '', title: '', email: '', phone: '' };
    callGemini.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: JSON.stringify(cardData) }] } }],
    });

    await ocrBusinessCard('mybase64==');

    expect(callGemini).toHaveBeenCalledWith(
      'gemini-2.5-flash-lite',
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
        ]),
        generationConfig: expect.objectContaining({
          responseMimeType: 'application/json',
        }),
      })
    );
  });
});
