import { slugify } from './survey.js';

const COLLECTIONS = ['contexts', 'capabilities', 'subjects', 'actors', 'events', 'rules', 'glossary', 'adrs'];

// Dependency edges that still need grooming: missing a reason, or missing any justifying
// features. Used by the dependency back-fill (/karto-groom dependencies) to target work.
export function unannotatedDependencies(map) {
  return (map.dependencies || []).filter((d) => !d.reason || !(d.features && d.features.length));
}

function titleCase(slug) {
  return String(slug).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function nextAdrNumber(adrs) {
  let max = 0;
  for (const id of Object.keys(adrs || {})) {
    const m = /^(\d{4})-/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return String(max + 1).padStart(4, '0');
}

// Pure: fold a validated discovery document into the map. Idempotent.
export function applyDiscovery(map, discovery) {
  const next = structuredClone(map);
  for (const c of COLLECTIONS) next[c] ||= {};
  next.dependencies ||= [];
  const f = discovery.findings;
  const hasGlossary = new Set(f.glossaryAdditions.map((g) => g.slug));

  for (const c of f.capabilityCandidates) {
    if (!next.contexts[c.context]) {
      next.contexts[c.context] = { name: titleCase(c.context), definition: `Area: ${titleCase(c.context)}.` };
    }
    if (!next.capabilities[c.slug]) {
      next.capabilities[c.slug] = {
        name: c.name, context: c.context, definition: c.definition,
        declaredStage: 'vision', derived: { maturity: 'vision', featureCount: 0, scenarioCount: 0 },
      };
    }
  }
  for (const s of f.subjects) {
    if (!next.subjects[s.slug]) {
      next.subjects[s.slug] = hasGlossary.has(s.slug) ? { name: s.name, glossaryRef: s.slug } : { name: s.name };
    }
  }
  for (const group of ['actors', 'events']) {
    for (const n of f[group]) {
      if (!next[group][n.slug]) next[group][n.slug] = hasGlossary.has(n.slug) ? { name: n.name, glossaryRef: n.slug } : { name: n.name };
    }
  }
  for (const g of f.glossaryAdditions) {
    if (!next.glossary[g.slug]) {
      next.glossary[g.slug] = { term: g.term, definition: g.definition, type: g.type };
      if (g.aliasesToAvoid) next.glossary[g.slug].aliasesToAvoid = g.aliasesToAvoid;
    }
  }
  for (const r of f.rules) {
    const slug = r.slug || slugify(r.name);
    if (slug && !next.rules[slug]) {
      const rule = { name: r.name, statement: r.statement };
      if (r.subject && next.subjects[r.subject]) rule.subject = r.subject;
      next.rules[slug] = rule;
    }
  }
  for (const dep of f.dependencies || []) {
    let edge = next.dependencies.find((e) => e.from === dep.from && e.to === dep.to);
    if (!edge) {
      edge = { from: dep.from, to: dep.to };
      next.dependencies.push(edge);
    }
    if (dep.reason) edge.reason = dep.reason;
    for (const file of dep.features || []) {
      edge.features ||= [];
      if (!edge.features.includes(file)) edge.features.push(file);
    }
  }
  const norm = (s) => String(s).trim().toLowerCase();
  for (const a of f.adrCandidates) {
    const exists = Object.values(next.adrs).some((x) => norm(x.title) === norm(a.title));
    if (!exists) {
      const id = `${nextAdrNumber(next.adrs)}-${slugify(a.title)}`;
      next.adrs[id] = {
        id, title: a.title, status: 'proposed', date: discovery.date,
        contexts: a.contexts || [], capabilities: a.capabilities || [], supersedes: null,
      };
    }
  }
  return next;
}
