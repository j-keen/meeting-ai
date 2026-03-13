// compare.js - Compare Prompts feature

import { state } from './event-bus.js';
import { t, getPromptPresets } from './i18n.js';
import { analyzeTranscript, getDefaultPrompt } from './ai.js';
import { isProxyAvailable } from './gemini-api.js';
import { saveSettings } from './storage.js';
import { showToast, renderAnalysisInto } from './ui.js';

const $ = (sel) => document.querySelector(sel);

function getElapsedTimeStr() {
  if (!state.meetingStartTime) return 'unknown';
  const diff = Date.now() - state.meetingStartTime;
  const mins = Math.floor(diff / 60000);
  return t('minutes', { n: mins });
}

function buildFullProfile() {
  return state.settings.userProfile || '';
}

// ===== Compare Prompts =====
export function openCompareModal() {
  const modal = $('#compareModal');
  modal.hidden = false;

  // Populate select options with built-in + custom presets
  const builtIn = getPromptPresets();
  const custom = state.settings.customPromptPresets || {};

  [['compareSelectA', 'compareTextA'], ['compareSelectB', 'compareTextB']].forEach(([selId, textId], idx) => {
    const sel = $(`#${selId}`);
    sel.innerHTML = '';
    // Current prompt option
    const currentOpt = document.createElement('option');
    currentOpt.value = '__current__';
    currentOpt.textContent = t('compare.current_prompt');
    sel.appendChild(currentOpt);
    // Built-in presets
    Object.entries(builtIn).forEach(([key, { name }]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    // Custom presets
    Object.keys(custom).forEach(name => {
      const opt = document.createElement('option');
      opt.value = '__custom__' + name;
      opt.textContent = '\u2605 ' + name;
      sel.appendChild(opt);
    });

    // Default: A = current, B = first non-default preset
    if (idx === 0) {
      sel.value = '__current__';
    } else {
      const keys = Object.keys(builtIn);
      sel.value = keys.length > 1 ? keys[1] : '__current__';
    }

    // Set textarea from selection
    const updateText = () => {
      const ta = $(`#${textId}`);
      const val = sel.value;
      if (val === '__current__') {
        ta.value = state.settings.customPrompt || getDefaultPrompt();
      } else if (val.startsWith('__custom__')) {
        ta.value = custom[val.slice('__custom__'.length)] || '';
      } else {
        const preset = builtIn[val];
        ta.value = (preset && preset.prompt) || getDefaultPrompt();
      }
    };
    updateText();
    sel.onchange = updateText;
  });

  // Clear previous results
  $('#compareResultA').innerHTML = '';
  $('#compareResultB').innerHTML = '';
}

export async function runCompareAnalysis() {
  if (state.transcript.length === 0) {
    showToast(t('toast.no_transcript'), 'warning');
    return;
  }
  if (!isProxyAvailable()) {
    showToast(t('toast.no_api_key'), 'warning');
    return;
  }

  const btn = $('#btnRunCompare');
  const origText = btn.textContent;
  btn.textContent = t('compare.running');
  btn.disabled = true;

  const promptA = $('#compareTextA').value;
  const promptB = $('#compareTextB').value;

  const resultA = $('#compareResultA');
  const resultB = $('#compareResultB');
  resultA.innerHTML = '<div class="skeleton-section"></div>';
  resultB.innerHTML = '<div class="skeleton-section"></div>';

  const lastAnalysis = state.analysisHistory.length > 0
    ? state.analysisHistory[state.analysisHistory.length - 1]
    : null;
  const previousSummary = lastAnalysis
    ? (lastAnalysis.markdown || lastAnalysis.summary || '')
    : null;

  const baseOpts = {
    transcript: state.transcript,
    meetingContext: state.settings.meetingContext,
    meetingPreset: state.settings.meetingPreset,
    elapsedTime: getElapsedTimeStr(),
    strategy: 'full',
    recentMinutes: 5,
    previousSummary,
    userInsights: state.userInsights,
    memos: state.memos,
    userProfile: buildFullProfile(),
    model: state.settings.geminiModel || 'gemini-2.5-flash',
  };

  const progress = $('#compareProgress');
  const btnDefaultA = $('#btnSetDefaultA');
  const btnDefaultB = $('#btnSetDefaultB');
  btnDefaultA.style.display = 'none';
  btnDefaultB.style.display = 'none';
  progress.textContent = t('compare.running');

  const taskA = analyzeTranscript({ ...baseOpts, prompt: promptA });
  const taskB = analyzeTranscript({ ...baseOpts, prompt: promptB });

  // Track individual completion for progress
  let aDone = false, bDone = false;
  taskA.then(r => { aDone = true; if (!bDone) progress.textContent = t('compare.progress_a_done'); return r; });
  taskB.then(r => { bDone = true; if (!aDone) progress.textContent = t('compare.progress_b_done'); return r; });

  const results = await Promise.allSettled([taskA, taskB]);

  if (results[0].status === 'fulfilled') {
    renderAnalysisInto(resultA, results[0].value);
    btnDefaultA.style.display = '';
  } else {
    resultA.innerHTML = `<p class="text-muted">${t('compare.error')}: ${results[0].reason?.message || ''}</p>`;
  }

  if (results[1].status === 'fulfilled') {
    renderAnalysisInto(resultB, results[1].value);
    btnDefaultB.style.display = '';
  } else {
    resultB.innerHTML = `<p class="text-muted">${t('compare.error')}: ${results[1].reason?.message || ''}</p>`;
  }

  progress.textContent = '';
  btn.textContent = origText;
  btn.disabled = false;
}

export function applyComparePromptAsDefault(promptText) {
  state.settings.customPrompt = promptText;
  saveSettings(state.settings);
  const textPrompt = $('#textPrompt');
  if (textPrompt) textPrompt.value = promptText;
  showToast(t('compare.set_default_success'), 'success');
}
