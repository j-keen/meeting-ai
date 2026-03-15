// preset-save.js - Reusable inline form for saving current prompt as a preset

import { addCustomType } from './storage.js';
import { emit } from './event-bus.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';

/**
 * Create an inline preset save form inside the given container.
 * @param {HTMLElement} container - Where to render the form
 * @param {string} promptText - The prompt text to save
 * @param {{ onSaved?: (preset: object) => void, onCancel?: () => void }} callbacks
 */
export function createPresetSaveForm(container, promptText, { onSaved, onCancel } = {}) {
  // Remove existing form if any
  const existing = container.querySelector('.preset-save-form');
  if (existing) existing.remove();

  const form = document.createElement('div');
  form.className = 'preset-save-form';
  form.innerHTML = `
    <input type="text" class="preset-save-name" placeholder="${t('preset_save.name_placeholder')}" maxlength="50">
    <input type="text" class="preset-save-desc" placeholder="${t('preset_save.desc_placeholder')}" maxlength="120">
    <div class="preset-save-form-buttons">
      <button class="btn btn-sm btn-outline preset-save-cancel">${t('preset_save.cancel')}</button>
      <button class="btn btn-sm btn-primary preset-save-submit">${t('preset_save.save')}</button>
    </div>
  `;

  const nameInput = form.querySelector('.preset-save-name');
  const descInput = form.querySelector('.preset-save-desc');

  form.querySelector('.preset-save-submit').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.classList.add('error');
      showToast(t('preset_save.name_required'), 'error');
      nameInput.focus();
      setTimeout(() => nameInput.classList.remove('error'), 600);
      return;
    }

    const newPreset = addCustomType({
      name,
      description: descInput.value.trim(),
      prompt: promptText,
    });

    emit('customTypes:change');
    showToast(t('preset_save.success'), 'success');
    form.remove();
    if (onSaved) onSaved(newPreset);
  });

  form.querySelector('.preset-save-cancel').addEventListener('click', () => {
    form.remove();
    if (onCancel) onCancel();
  });

  container.appendChild(form);
  nameInput.focus();
}
