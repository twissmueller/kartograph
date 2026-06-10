import http from 'node:http';
import { createReadStream, watch } from 'node:fs';
import { stat, readFile, writeFile, readdir } from 'node:fs/promises';
import { parseFeature, scenarioClass, scenarioProgress, setScenarioProgress } from '../workflows/lib/gherkin.js';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.feature': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

async function tryServeFile(res, baseDir, urlPath) {
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(baseDir, safe);
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

export function createServer({ projectRoot, viewerDir }) {
  const sseClients = new Set();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';

    if (path === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (path === '/layout' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const json = JSON.parse(body || '{}');
        await writeFile(join(projectRoot, 'kartograph.layout.json'), JSON.stringify(json, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400);
        res.end(String(e.message));
      }
      return;
    }

    // POST /board { context, capability, feature, scenario, progress } — set one scenario's
    // progress tag in its .feature file. Mirrors POST /layout's write pattern.
    if (url.pathname === '/board' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let p;
      try { p = JSON.parse(body || '{}'); }
      catch { res.writeHead(400); res.end('bad json'); return; }
      const isSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s);
      const isFeature = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*\.feature$/.test(s);
      const VALID = ['open', 'wip', 'test', 'done'];
      if (!isSlug(p.context) || !isSlug(p.capability) || !isFeature(p.feature) || typeof p.scenario !== 'string' || !p.scenario || !VALID.includes(p.progress)) {
        res.writeHead(400); res.end('bad request'); return;
      }
      const filePath = join(projectRoot, 'features', p.context, p.capability, p.feature);
      let src;
      try { src = await readFile(filePath, 'utf8'); }
      catch { res.writeHead(404); res.end('feature not found'); return; }
      let updated;
      try { updated = setScenarioProgress(src, p.scenario, p.progress); }
      catch (e) { res.writeHead(404); res.end(String(e.message)); return; }
      try {
        await writeFile(filePath, updated);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(500); res.end(String(e.message));
      }
      return;
    }

    // GET /board — every scenario across every capability, with its progress + class.
    if (url.pathname === '/board' && req.method === 'GET') {
      let map;
      try { map = JSON.parse(await readFile(join(projectRoot, 'kartograph.json'), 'utf8')); }
      catch { map = { capabilities: {} }; }
      // Every capability (even those with no scenarios) so the board can show and colour
      // a chip for each — a scenario-less capability shows up red.
      const capabilities = Object.entries(map.capabilities || {})
        .map(([slug, cap]) => ({ capability: slug, capabilityName: cap.name || slug }));
      const scenarios = [];
      for (const [slug, cap] of Object.entries(map.capabilities || {})) {
        const context = cap.context;
        if (!context) continue;
        const dir = join(projectRoot, 'features', context, slug);
        let names = [];
        try { names = (await readdir(dir)).filter((n) => n.endsWith('.feature')).sort(); }
        catch { continue; }
        for (const name of names) {
          let parsed;
          try { parsed = parseFeature(await readFile(join(dir, name), 'utf8')); }
          catch { continue; }
          for (const s of parsed.scenarios) {
            scenarios.push({
              capability: slug, capabilityName: cap.name || slug, context,
              feature: name, featureName: parsed.feature || name, name: s.name,
              class: scenarioClass(s.tags), progress: scenarioProgress(s.tags),
            });
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ scenarios, capabilities }));
      return;
    }

    // GET /features/<context>/<slug> — parse the capability's .feature files to JSON.
    // Match against the raw (percent-encoded) pathname so that encoded slashes in path
    // traversal attempts (e.g. ..%2F) are caught by the slug validator below.
    const fm = /^\/features\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
    if (fm && req.method === 'GET') {
      const [, context, slug] = fm;
      const isSlug = (s) => /^[a-z0-9][a-z0-9-]*$/.test(s);
      if (!isSlug(context) || !isSlug(slug)) {
        res.writeHead(400);
        res.end('bad request');
        return;
      }
      const dir = join(projectRoot, 'features', context, slug);
      let names = [];
      try { names = (await readdir(dir)).filter((n) => n.endsWith('.feature')).sort(); }
      catch { names = []; }
      const files = [];
      try {
        for (const name of names) {
          const parsed = parseFeature(await readFile(join(dir, name), 'utf8'));
          files.push({
            file: name,
            feature: parsed.feature,
            description: parsed.description,
            background: parsed.background,
            scenarios: parsed.scenarios.map((s) => ({
              name: s.name, tags: s.tags, class: scenarioClass(s.tags), steps: s.steps,
            })),
          });
        }
      } catch (e) {
        res.writeHead(500);
        res.end(String(e.message));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ files }));
      return;
    }

    // viewer assets first, then project files (kartograph.json, .feature, .md, layout)
    if (await tryServeFile(res, viewerDir, path)) return;
    if (await tryServeFile(res, projectRoot, path)) return;
    res.writeHead(404);
    res.end('not found');
  });

  // Watch the project for changes and notify SSE clients.
  const notify = (() => {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const c of sseClients) c.write('data: changed\n\n');
      }, 100);
    };
  })();

  const onChange = (_event, filename) => {
    // The viewer writes kartograph.layout.json itself; don't reload on our own writes.
    if (filename === 'kartograph.layout.json') return;
    if (!filename) return notify();
    if (/kartograph|\.feature$|decisions|\.json$/.test(filename)) notify();
  };

  let watcher = null;
  try {
    watcher = watch(projectRoot, { recursive: true }, onChange);
  } catch {
    // recursive watch unsupported on this platform; watch the root file only if present
    try {
      watcher = watch(join(projectRoot, 'kartograph.json'), notify);
    } catch {
      watcher = null;
    }
  }
  server.on('close', () => watcher?.close());

  return server;
}

export function start({ projectRoot, viewerDir, port = 4123 }) {
  const server = createServer({ projectRoot, viewerDir });
  server.listen(port, () => {
    console.log(`Kartograph viewer: http://127.0.0.1:${port}`);
  });
  return server;
}

// CLI: node server/serve.js [port]   (projectRoot = cwd, viewer = sibling ../viewer)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4123);
  const viewerDir = new URL('../viewer/', import.meta.url).pathname;
  start({ projectRoot: process.cwd(), viewerDir, port });
}
