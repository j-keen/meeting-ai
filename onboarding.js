// onboarding.js - Toss-style first-visit profile onboarding

import { state } from './app.js';
import { saveSettings } from './storage.js';
import { t } from './i18n.js';
import { buildUserProfileString } from './settings.js';

const $ = (sel) => document.querySelector(sel);

const STEPS = [
  { key: 'name', field: 'name', type: 'text' },
  { key: 'title', field: 'title', type: 'text' },
  { key: 'team', field: 'team', type: 'text' },
  { key: 'role', field: 'role', type: 'role' },
  { key: 'interests', field: 'interests', type: 'text' },
];

const ROLES = ['attendee', 'facilitator', 'presenter', 'observer'];

export function showOnboarding() {
  return new Promise((resolve) => {
    const modal = $('#onboardingModal');
    const container = $('#onboardingCards');
    const dotsContainer = $('#onboardingDots');
    const skipAllBtn = $('#onboardingSkipAll');

    let currentStep = 0;
    const values = {};

    modal.hidden = false;

    function renderDots() {
      dotsContainer.innerHTML = '';
      for (let i = 0; i <= STEPS.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'onboarding-dot' + (i === currentStep ? ' active' : '') + (i < currentStep ? ' done' : '');
        dotsContainer.appendChild(dot);
      }
    }

    function buildCard(stepIndex, direction) {
      container.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'onboarding-card';
      if (direction) card.classList.add('slide-in-' + direction);

      if (stepIndex < STEPS.length) {
        // Input steps
        const step = STEPS[stepIndex];
        const q = document.createElement('div');
        q.className = 'onboarding-question';
        q.textContent = t(`onboarding.q_${step.key}`);
        card.appendChild(q);

        if (stepIndex === 0) {
          const benefit = document.createElement('div');
          benefit.className = 'onboarding-benefit';
          benefit.textContent = t('onboarding.benefit');
          card.appendChild(benefit);
        }

        if (step.type === 'text') {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'onboarding-input';
          input.placeholder = t(`onboarding.ph_${step.key}`);
          input.value = values[step.field] || '';
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              values[step.field] = input.value.trim();
              goNext();
            }
          });
          card.appendChild(input);

          const actions = document.createElement('div');
          actions.className = 'onboarding-actions';

          const nextBtn = document.createElement('button');
          nextBtn.className = 'btn btn-primary onboarding-next';
          nextBtn.textContent = t('onboarding.next');
          nextBtn.addEventListener('click', () => {
            values[step.field] = input.value.trim();
            goNext();
          });
          actions.appendChild(nextBtn);

          const skipLink = document.createElement('button');
          skipLink.className = 'onboarding-skip';
          skipLink.textContent = t('onboarding.skip');
          skipLink.addEventListener('click', () => goNext());
          actions.appendChild(skipLink);

          card.appendChild(actions);

          // Auto focus after animation
          requestAnimationFrame(() => requestAnimationFrame(() => input.focus()));
        } else if (step.type === 'role') {
          const grid = document.createElement('div');
          grid.className = 'onboarding-role-grid';
          ROLES.forEach((role) => {
            const btn = document.createElement('button');
            btn.className = 'onboarding-role-btn';
            if (values.role === role) btn.classList.add('selected');
            btn.textContent = t(`onboarding.role_${role}`);
            btn.addEventListener('click', () => {
              values.role = role;
              goNext();
            });
            grid.appendChild(btn);
          });
          card.appendChild(grid);

          const actions = document.createElement('div');
          actions.className = 'onboarding-actions';
          const skipLink = document.createElement('button');
          skipLink.className = 'onboarding-skip';
          skipLink.textContent = t('onboarding.skip');
          skipLink.addEventListener('click', () => goNext());
          actions.appendChild(skipLink);
          card.appendChild(actions);
        }
      } else {
        // Completion card
        card.classList.add('onboarding-complete');

        const icon = document.createElement('div');
        icon.className = 'onboarding-complete-icon';
        icon.textContent = '\u2728';
        card.appendChild(icon);

        const title = document.createElement('div');
        title.className = 'onboarding-question';
        title.textContent = t('onboarding.complete_title');
        card.appendChild(title);

        const desc = document.createElement('div');
        desc.className = 'onboarding-complete-desc';
        desc.innerHTML = t('onboarding.complete_desc');
        card.appendChild(desc);

        const privacy = document.createElement('div');
        privacy.className = 'onboarding-privacy';
        privacy.innerHTML = t('onboarding.privacy');
        card.appendChild(privacy);

        const startBtn = document.createElement('button');
        startBtn.className = 'btn btn-primary onboarding-start';
        startBtn.textContent = t('onboarding.start');
        startBtn.addEventListener('click', () => finish());
        card.appendChild(startBtn);
      }

      container.appendChild(card);
    }

    function goNext() {
      currentStep++;
      renderDots();
      buildCard(currentStep, 'right');
    }

    function finish() {
      // Save profile fields
      if (!state.settings.profileFields) state.settings.profileFields = {};
      const pf = state.settings.profileFields;
      if (values.name) pf.name = values.name;
      if (values.title) pf.title = values.title;
      if (values.team) pf.team = values.team;
      if (values.role) pf.role = values.role;
      if (values.interests) pf.interests = values.interests;

      state.settings.userProfile = buildUserProfileString(pf);
      state.settings.profileComplete = true;
      saveSettings(state.settings);

      modal.hidden = true;
      resolve();
    }

    function skipAll() {
      state.settings.profileComplete = true;
      saveSettings(state.settings);
      modal.hidden = true;
      resolve();
    }

    skipAllBtn.addEventListener('click', skipAll);

    renderDots();
    buildCard(0, null);
  });
}
