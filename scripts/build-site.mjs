import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPublication, repositoryRoot, sha256 } from './verify-publication.mjs';

export function buildSite(root = repositoryRoot) {
  const review = verifyPublication(root);
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]); // An empty WebAssembly code module, no graphics or game resources.
  const payload = Buffer.from(('WEBGL_DELIVERY_PROBE version=1 content=technical-text-only\n').repeat(2048));
  const data = Buffer.from(JSON.stringify({ probe: 'octet-stream', schema: 1 }) + '\n');
  const wasmName = `probes/empty.${sha256(wasm).slice(0, 20)}.wasm`;
  const textName = `probes/technical.${sha256(payload).slice(0, 20)}.txt`;
  const dataName = `probes/technical.${sha256(data).slice(0, 20)}.data`;
  let commit = process.env.VERCEL_GIT_COMMIT_SHA || 'local-reviewed';
  let branch = process.env.VERCEL_GIT_COMMIT_REF || 'local';
  try {
    if (commit === 'local-reviewed') commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (branch === 'local') branch = execFileSync('git', ['branch', '--show-current'], { cwd: root }).toString().trim();
  } catch { /* A clean local source tree can be tested before the first commit. */ }
  const probes = { wasm: '/' + wasmName, wasmBr: '/' + wasmName + '.br', payload: '/' + textName, payloadBr: '/' + textName + '.br', data: '/' + dataName };
  const release = { version: 'infrastructure-3', scope: 'infrastructure-only', commit, branch, gameAssetsPublished: false, probes };
  const files = new Map([
    ['index.html', fs.readFileSync(path.join(root, 'site/index.html'))],
    ['diagnostics.js', fs.readFileSync(path.join(root, 'site/diagnostics.js'))],
    ['style.css', fs.readFileSync(path.join(root, 'site/style.css'))],
    ['release.json', Buffer.from(JSON.stringify(release, null, 2) + '\n')],
    [wasmName, wasm], [wasmName + '.br', brotliCompressSync(wasm)],
    [textName, payload], [textName + '.br', brotliCompressSync(payload)], [dataName, data],
    ['404.html', Buffer.from('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Introuvable</title><p>Ressource absente. Aucun fichier de jeu n’est publié.</p></html>\n')],
  ]);
  const out = path.join(root, 'public');
  if (fs.existsSync(out)) {
    if (fs.lstatSync(out).isSymbolicLink()) throw new Error('Output directory cannot be a link');
    const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(d => {
      const p = path.join(folder, d.name);
      if (fs.lstatSync(p).isSymbolicLink()) throw new Error('Output contains a link');
      return d.isDirectory() ? walk(p) : [path.relative(out, p).split(path.sep).join('/')];
    });
    if (walk(out).some(n => !files.has(n))) throw new Error('Unexpected existing output file; preserve and audit it before building');
  }
  let bytes = 0;
  for (const [name, content] of files) {
    const dest = path.join(out, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    bytes += content.length;
  }
  if (bytes > 1_000_000) throw new Error('Infrastructure output exceeds budget');
  return { passed: true, review, commit, branch, outputFiles: files.size, outputBytes: bytes, gameAssetsPublished: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyPublication();
    execFileSync(process.execPath, ['--test', 'tests/publication.test.mjs'], { cwd: repositoryRoot, stdio: 'inherit' });
    console.log(JSON.stringify(buildSite(), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
