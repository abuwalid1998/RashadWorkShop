'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const VENDOR = {
  // Preact + htm in one ES module; shipped inside node_modules, served as-is.
  '/vendor/preact-htm.js': path.join(__dirname, '..', '..', 'node_modules', 'htm', 'preact', 'standalone.module.js'),
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const APP_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const DOCUMENT_TTL_MS = 10 * 60 * 1000;
const documents = new Map();

/** Park generated HTML and get a same-origin URL for previewing/printing it. */
function publishDocument(html) {
  const now = Date.now();
  for (const [token, entry] of documents) if (now - entry.at > DOCUMENT_TTL_MS) documents.delete(token);
  const token = crypto.randomBytes(16).toString('hex');
  documents.set(token, { html, at: now });
  return `app://app/__doc/${token}`;
}

/**
 * Serve the UI from a private `app://` scheme instead of file://, so the page
 * gets a real origin, a strict CSP, and no access to the rest of the disk.
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  if (url.host !== 'app') return new Response('Not found', { status: 404 });
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/__doc/')) {
    const entry = documents.get(pathname.slice('/__doc/'.length));
    if (!entry) return new Response('Document expired', { status: 404 });
    return new Response(entry.html, { headers: { 'content-type': TYPES['.html'], 'cache-control': 'no-store' } });
  }

  let file = VENDOR[pathname];
  if (!file) {
    file = path.normalize(path.join(RENDERER_ROOT, pathname === '/' ? 'index.html' : pathname));
    if (file !== RENDERER_ROOT && !file.startsWith(RENDERER_ROOT + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  try {
    const body = await fs.promises.readFile(file);
    const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
    if (path.extname(file) === '.html') headers['content-security-policy'] = APP_CSP;
    return new Response(body, { headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

const SCHEME = {
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
};

module.exports = { handleRequest, publishDocument, SCHEME, APP_URL: 'app://app/index.html' };
