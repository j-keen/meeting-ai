// history.js - History filter and grid refresh helpers

import { listMeetings } from './storage.js';
import { renderHistoryGrid } from './ui.js';

const $ = (sel) => document.querySelector(sel);

// ===== History filter helper =====
export function getHistoryFilters() {
  return {
    searchTerm: $('#historySearch')?.value || '',
    filterType: $('#historyFilterType')?.value || '',
    filterTag: $('#historyFilterTag')?.value || '',
    filterRating: $('#historyFilterRating')?.value || '',
    dateFrom: $('#historyFilterDateFrom')?.value || '',
    dateTo: $('#historyFilterDateTo')?.value || '',
  };
}

let historySearchTimer = null;
export function refreshHistoryGrid() {
  renderHistoryGrid(listMeetings(), getHistoryFilters());
}
export function refreshHistoryGridDebounced() {
  clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(refreshHistoryGrid, 250);
}
