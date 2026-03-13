// ui/toast.js - Toast notification system

const $ = (sel) => document.querySelector(sel);

export function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  const tmpl = $('#tmplToast');
  const el = tmpl.content.cloneNode(true).querySelector('.toast');
  el.classList.add(type);
  el.querySelector('.toast-message').textContent = message;
  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  container.appendChild(el);
  setTimeout(() => removeToast(el), 4000);
}

function removeToast(el) {
  if (el.classList.contains('toast-out')) return;
  el.classList.add('toast-out');
  setTimeout(() => el.remove(), 300);
}
