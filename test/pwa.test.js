const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

test('the document exposes the iPhone PWA metadata', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style"/);
  assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
});

test('the web app manifest supports standalone installation', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8')
  );

  assert.equal(manifest.name, 'Laguna de Kaan Luum');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
});

test('the service worker caches the shell but never API traffic', () => {
  const worker = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
  const app = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');

  assert.match(worker, /requestUrl\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.match(worker, /\/offline\.html/);
  assert.match(app, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
});

test('required iPhone and installability icons exist', () => {
  for (const icon of [
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png'
  ]) {
    const stats = fs.statSync(path.join(publicDir, 'icons', icon));
    assert.ok(stats.size > 1000, `${icon} must contain a real PNG asset`);
  }
});
