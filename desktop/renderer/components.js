// Shared DOM builders for the design system. Pure: take data + callbacks, return
// DOM nodes; no view-state knowledge. Reused by tracking/map/sidebar.
import { STATES, STATE_LABELS } from '../../workflows/lib/tracking.js';

const PATHS = ['happy', 'edge', 'error'];
const GLYPH = { open: '○', developed: '◐', accepted: '✓' };

// Dimension 1 — three path pips (happy·edge·error), filled when >=1 scenario of
// that class exists; hollow (dashed) otherwise. Shape is the non-colour cue.
export function maturityPips(scenarios, { compact = false } = {}) {
  const has = (c) => (scenarios || []).some((s) => (s.class || s.cls) === c);
  const wrap = document.createElement('span');
  wrap.className = 'mat-pips';
  wrap.title = PATHS.map((p) => `${p}: ${has(p) ? 'specified ✓' : 'not yet —'}`).join(' · ');
  wrap.setAttribute('aria-label', wrap.title);
  for (const p of PATHS) {
    const pip = document.createElement('span');
    pip.className = `pip pip-${p}` + (has(p) ? ' on' : '') + (compact ? ' compact' : '');
    wrap.appendChild(pip);
  }
  return wrap;
}

// Dimension 2 — Open/Developed/Accepted segmented control. onSet(state) on click.
export function segmentedControl(current, onSet) {
  const seg = document.createElement('span');
  seg.className = 'seg';
  for (const state of STATES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn' + (current === state ? ' active' : '');
    b.dataset.state = state;
    b.textContent = `${GLYPH[state]} ${STATE_LABELS[state]}`;
    b.onclick = () => onSet(state);
    seg.appendChild(b);
  }
  return seg;
}

export function statusDot(status, { halo = false } = {}) {
  const el = document.createElement('span');
  el.className = `sdot ${status || 'untouched'}` + (halo ? ' halo' : '');
  return el;
}

export function rollupCount(accepted, total, { pill = false } = {}) {
  const el = document.createElement('span');
  el.className = 'rcount' + (pill ? ' pill' : '');
  el.textContent = `${accepted}/${total}`;
  return el;
}

export function pathTag(cls) {
  const el = document.createElement('span');
  el.className = `ptag ${cls}`;
  el.textContent = '@' + cls;
  return el;
}
