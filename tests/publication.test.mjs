import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { verifyPublication, repositoryRoot, sha256 } from '../scripts/verify-publication.mjs';
import { checkWebglRelease } from '../scripts/check-webgl-release.mjs';
import { buildSite } from '../scripts/build-site.mjs';

function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'webgl-publication-test-'));
  const policy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'publication-policy.json')));
  for (const f of policy.approvedFiles) {
    const dest = path.join(folder, f); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, f), dest);
  }
  return folder;
}
function checked(t) {
  const root = fixture();
  // This test owns the mkdtemp path; it cannot reference the development project.
  t.after(() => {
    const absolute = path.resolve(root), temp = path.resolve(os.tmpdir()) + path.sep;
    assert(absolute.startsWith(temp) && path.basename(absolute).startsWith('webgl-publication-test-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return root;
}
test('Reviewed infrastructure passes, without any game file', () => {
  const r = verifyPublication(); assert(r.passed && !r.gameAssetsPublished);
});
test('Unexpected archive fails even when gitignored', t => {
  const root = checked(t); fs.writeFileSync(path.join(root, 'game.rar'), 'not an archive');
  assert.throws(() => verifyPublication(root), /Unapproved/);
});
test('A changed approved source fails its review hash', t => {
  const root = checked(t); fs.appendFileSync(path.join(root, 'site/index.html'), '\nchanged');
  assert.throws(() => verifyPublication(root), /changed since review/);
});
test('Vercel config reserialization preserves every reviewed property', t => {
  const root = checked(t), f = path.join(root, 'vercel.json');
  const config = JSON.parse(fs.readFileSync(f));
  fs.writeFileSync(f, JSON.stringify(Object.fromEntries(Object.entries(config).reverse())));
  assert(verifyPublication(root).passed);
});
test('A changed Vercel header is still rejected after JSON normalization', t => {
  const root = checked(t), f = path.join(root, 'vercel.json');
  const config = JSON.parse(fs.readFileSync(f)); config.headers[0].headers[0].value = 'changed';
  fs.writeFileSync(f, JSON.stringify(config));
  assert.throws(() => verifyPublication(root), /changed since review/);
});
test('An executable renamed to an approved source still fails', t => {
  const root = checked(t); fs.writeFileSync(path.join(root, 'site/index.html'), Buffer.from([77, 90, 1, 2]));
  assert.throws(() => verifyPublication(root), /PE executable/);
});
test('A real-shaped credential candidate fails before hashing', t => {
  const root = checked(t); fs.writeFileSync(path.join(root, 'site/index.html'), 'gh' + 'p_' + 'A'.repeat(40));
  assert.throws(() => verifyPublication(root), /credential/);
});
test('Changing the game-release switch fails closed', t => {
  const root = checked(t), f = path.join(root, 'publication-policy.json');
  const p = JSON.parse(fs.readFileSync(f)); p.gameReleaseEnabled = true; fs.writeFileSync(f, JSON.stringify(p));
  assert.throws(() => verifyPublication(root), /disabled/);
});
test('A build is rejected before any transfer without rights evidence', () => {
  assert.throws(() => checkWebglRelease({ buildRoot: '/nonexistent', receiptPath: '/nonexistent' }), /no reviewed redistribution/);
});
test('Site output contains only ten authored technical files; Brotli roundtrips', t => {
  const root = checked(t), r = buildSite(root); assert.equal(r.outputFiles, 10);
  const release = JSON.parse(fs.readFileSync(path.join(root, 'public/release.json')));
  assert.equal(release.gameAssetsPublished, false);
  for (const [raw, compressed] of [[release.probes.wasm, release.probes.wasmBr], [release.probes.payload, release.probes.payloadBr]]) {
    const a = fs.readFileSync(path.join(root, 'public', raw));
    const b = brotliDecompressSync(fs.readFileSync(path.join(root, 'public', compressed)));
    assert.equal(sha256(a), sha256(b));
  }
});
test('Unexpected output is preserved and blocks a subsequent build', t => {
  const root = checked(t); buildSite(root);
  const file = path.join(root, 'public/unapproved.txt'); fs.writeFileSync(file, 'preserve this diagnostic');
  assert.throws(() => buildSite(root), /Unexpected existing output/);
  assert(fs.existsSync(file));
});
