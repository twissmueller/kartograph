// Minimal reader/writer for the Open Knowledge Format (OKF) v0.2 — a concept is a
// UTF-8 markdown file with a YAML frontmatter block and a free-form markdown body.
// Kartograph stores its glossary as one OKF bundle at `knowledge/`; this module is the
// only place that knows the file syntax. No dependencies: the YAML handled here is the
// small subset OKF actually uses (scalars, flow/block sequences, flow/block mappings),
// parsed the same hand-rolled way `gherkin.js` parses Gherkin.
//
// Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

export const OKF_VERSION = '0.2';

// §3.1 — these filenames have defined meaning and are never concept documents.
export const RESERVED_FILENAMES = ['index.md', 'log.md'];

// ---------------------------------------------------------------------------
// YAML subset — scalars
// ---------------------------------------------------------------------------

// Strip a trailing `# comment`, respecting quotes so a `#` inside a string survives.
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function unquote(s) {
  const q = s[0];
  const body = s.slice(1, -1);
  return q === '"' ? body.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\') : body.replace(/''/g, "'");
}

// A scalar that is known NOT to be a flow collection — avoids recursing back into parseFlow.
function parsePlainScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return s === '' ? '' : null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d*\.\d+$/.test(s)) return Number(s);
  return s;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s.startsWith('[') || s.startsWith('{')) return parseFlow(s);
  if (s.length > 1 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) return unquote(s);
  return parsePlainScalar(s);
}

// ---------------------------------------------------------------------------
// YAML subset — flow collections: [a, b] and { k: v, k2: v2 }
// ---------------------------------------------------------------------------

function parseFlow(text) {
  let i = 0;
  const s = text;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };

  function quoted() {
    const q = s[i++];
    const start = i;
    while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; }
    const body = s.slice(start, i);
    i++; // closing quote
    return q === '"' ? body.replace(/\\"/g, '"').replace(/\\n/g, '\n') : body;
  }

  function value() {
    ws();
    if (s[i] === '[') return seq();
    if (s[i] === '{') return map();
    if (s[i] === '"' || s[i] === "'") return quoted();
    const start = i;
    while (i < s.length && !',]}'.includes(s[i])) i++;
    return parsePlainScalar(s.slice(start, i));
  }

  function seq() {
    const out = [];
    i++; // [
    ws();
    if (s[i] === ']') { i++; return out; }
    for (;;) {
      out.push(value());
      ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ']') { i++; break; }
      break;
    }
    return out;
  }

  function map() {
    const out = {};
    i++; // {
    ws();
    if (s[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      let key;
      if (s[i] === '"' || s[i] === "'") key = quoted();
      else { const start = i; while (i < s.length && s[i] !== ':' && !',}'.includes(s[i])) i++; key = s.slice(start, i).trim(); }
      ws();
      if (s[i] === ':') i++;
      out[key] = value();
      ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === '}') { i++; break; }
      break;
    }
    return out;
  }

  return value();
}

// ---------------------------------------------------------------------------
// YAML subset — block structure
// ---------------------------------------------------------------------------

const indentOf = (line) => line.length - line.replace(/^ +/, '').length;

// Parse the block starting at `lines[start]`, requiring its entries to be indented at least
// `minIndent`. The block's own indent is taken from its first line rather than assumed, so a
// nested sequence may sit at any depth past its parent key. Returns
// [value, indexOfFirstLineAfterTheBlock].
function parseBlock(lines, start, minIndent) {
  let i = start;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || indentOf(lines[i]) < minIndent) return [null, i];
  const indent = indentOf(lines[i]);
  return lines[i].trim().startsWith('-')
    ? parseSeq(lines, i, indent)
    : parseMap(lines, i, indent);
}

function parseSeq(lines, start, indent) {
  const out = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (indentOf(line) !== indent || !line.trim().startsWith('-')) break;
    const rest = line.trim().replace(/^-\s*/, '');
    if (rest === '') {
      const [val, next] = parseBlock(lines, i + 1, indent + 2);
      out.push(val);
      i = next;
    } else if (/^[A-Za-z_][\w .-]*:(\s|$)/.test(rest) && !rest.startsWith('{')) {
      // `- key: value` — an inline mapping item. Its sibling keys sit one dash-and-space in
      // from the dash, so re-indent the first key to that column and parse the run as a map.
      const itemIndent = indentOf(line) + 2;
      const sub = [' '.repeat(itemIndent) + rest, ...lines.slice(i + 1)];
      const [val, consumed] = parseMap(sub, 0, itemIndent);
      out.push(val);
      i = i + consumed;
    } else {
      out.push(parseScalar(rest));
      i++;
    }
  }
  return [out, i];
}

function parseMap(lines, start, indent) {
  const out = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (indentOf(line) < indent) break;
    if (indentOf(line) > indent) { i++; continue; }
    const m = /^([^:]+):(.*)$/.exec(line.trim());
    if (!m) { i++; continue; }
    const key = m[1].trim().replace(/^["']|["']$/g, '');
    const rest = stripComment(m[2]).trim();
    if (rest === '') {
      const [val, next] = parseBlock(lines, i + 1, indent + 1);
      out[key] = val === null ? '' : val;
      i = next;
    } else {
      out[key] = parseScalar(rest);
      i++;
    }
  }
  return [out, i];
}

export function parseFrontmatter(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map((l) => stripComment(l).replace(/\s+$/, ''));
  const [value] = parseMap(lines, 0, 0);
  return value;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const NEEDS_QUOTE = /^(?:$|[-?:,[\]{}#&*!|>'"%@`])|: |\s#|^(?:true|false|null|~)$|^-?\d+(?:\.\d+)?$/;

function scalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (NEEDS_QUOTE.test(s) || s !== s.trim()) return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  return s;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A mapping small enough to read on one line — OKF writes `generated`, `verified` and
// `usage_window` this way in every spec example.
function flowMap(obj) {
  return '{ ' + Object.entries(obj).map(([k, v]) => `${k}: ${scalar(v)}`).join(', ') + ' }';
}

const isFlat = (obj) => Object.values(obj).every((v) => v === null || typeof v !== 'object');

function emit(key, value, indent, out) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) { out.push(`${pad}${key}: []`); return; }
    if (value.every((v) => v === null || typeof v !== 'object')) {
      out.push(`${pad}${key}: [${value.map(scalar).join(', ')}]`);
      return;
    }
    out.push(`${pad}${key}:`);
    for (const item of value) {
      if (isPlainObject(item)) {
        const entries = Object.entries(item);
        out.push(`${pad}  - ${entries[0][0]}: ${scalar(entries[0][1])}`);
        for (const [k, v] of entries.slice(1)) emit(k, v, indent + 4, out);
      } else {
        out.push(`${pad}  - ${scalar(item)}`);
      }
    }
    return;
  }
  if (isPlainObject(value)) {
    if (isFlat(value)) { out.push(`${pad}${key}: ${flowMap(value)}`); return; }
    out.push(`${pad}${key}:`);
    for (const [k, v] of Object.entries(value)) emit(k, v, indent + 2, out);
    return;
  }
  out.push(`${pad}${key}: ${scalar(value)}`);
}

// Frontmatter keys emitted in this order; anything else follows, alphabetically, so two
// runs over the same concept produce byte-identical files (the writes must be diffable).
const KEY_ORDER = [
  'type', 'title', 'description', 'resource', 'tags', 'status',
  'aliases_to_avoid', 'stale_after', 'generated', 'verified', 'sources', 'usage_window',
];

export function serializeFrontmatter(fm) {
  const out = [];
  const seen = new Set();
  for (const key of KEY_ORDER) {
    if (fm[key] === undefined) continue;
    emit(key, fm[key], 0, out);
    seen.add(key);
  }
  for (const key of Object.keys(fm).sort()) {
    if (seen.has(key) || fm[key] === undefined) continue;
    emit(key, fm[key], 0, out);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Concept documents (§4)
// ---------------------------------------------------------------------------

// Split a concept file into its frontmatter object and its markdown body. A file with no
// frontmatter block yields `frontmatter: null` — §11 conformance rejects that, but parsing
// must still succeed so the validator can report it as a finding rather than throw.
export function parseConcept(text) {
  const src = String(text).replace(/^﻿/, '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { frontmatter: null, body: src.trim() };
  return { frontmatter: parseFrontmatter(m[1]), body: src.slice(m[0].length).replace(/^\s*\n/, '').trimEnd() };
}

export function serializeConcept({ frontmatter, body }) {
  return `---\n${serializeFrontmatter(frontmatter)}\n---\n\n${String(body || '').trim()}\n`;
}

// §2 — a concept's ID is its path within the bundle with `.md` removed.
export function conceptId(relPath) {
  return String(relPath).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.md$/, '');
}

export const conceptPath = (id) => `${conceptId(id)}.md`;

// A bundle-relative link target (§6.1, the recommended absolute form).
export const conceptLink = (id) => `/${conceptPath(id)}`;

// ---------------------------------------------------------------------------
// Trust and lifecycle (§5)
// ---------------------------------------------------------------------------

// §5.2 — consumers MUST treat a bare `verified` mapping as a one-element list.
export function verifications(fm) {
  const v = (fm || {}).verified;
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// §5.3 — derived, never stored.
export function trustTier(fm) {
  const list = verifications(fm);
  if (list.length === 0) return 'unverified';
  return list.some((v) => String(v.by || '').startsWith('human:')) ? 'human-reviewed' : 'machine-confirmed';
}

// §5.4 — absent `status` means `stable`.
export const conceptStatus = (fm) => ((fm || {}).status || 'stable');

// §5.5 — stale when now >= stale_after. Unset means never stale.
export function isStale(fm, now = new Date()) {
  const at = (fm || {}).stale_after;
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && now.getTime() >= t;
}

// §7 — actor convention: `<producer>/<version>`, `human:<id>`, `process:<id>`.
export const isHumanActor = (actor) => String(actor || '').startsWith('human:');
