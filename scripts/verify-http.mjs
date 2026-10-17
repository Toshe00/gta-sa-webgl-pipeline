import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { sha256 } from './verify-publication.mjs';

export function request(url, encoding = 'br, gzip') {
  return new Promise((resolve, reject) => {
    const client = new URL(url).protocol === 'https:' ? https : http;
    const req = client.get(url, { headers: { 'Accept-Encoding': encoding } }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const wire = Buffer.concat(chunks);
        try {
          const decoded = r.headers['content-encoding'] === 'br' ? brotliDecompressSync(wire)
            : r.headers['content-encoding'] === 'gzip' ? gunzipSync(wire) : wire;
          resolve({ status: r.statusCode, headers: r.headers, wireBytes: wire.length, decoded, sha256: sha256(decoded) });
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
  });
}

export async function verifyHttp(base) {
  const origin = new URL(base).origin;
  const rows = [];
  const record = async (name, route) => {
    const r = await request(new URL(route, origin));
    if (r.status !== 200) throw new Error(`${route}: HTTP ${r.status}`);
    rows.push({ name, route, status: r.status, headers: r.headers, wireBytes: r.wireBytes, decodedBytes: r.decoded.length, sha256: r.sha256 });
    return r;
  };
  const page = await record('html', '/');
  if (page.headers['cross-origin-opener-policy'] !== 'same-origin' || page.headers['cross-origin-embedder-policy'] !== 'require-corp') throw new Error('COOP/COEP missing');
  const release = JSON.parse((await record('release', '/release.json')).decoded);
  if (release.scope !== 'infrastructure-only' || release.gameAssetsPublished !== false) throw new Error('Scope mismatch');
  const wasm = await record('wasm', release.probes.wasm);
  const wasmBr = await record('wasm-br', release.probes.wasmBr);
  if (!String(wasm.headers['content-type']).startsWith('application/wasm') || !String(wasmBr.headers['content-type']).startsWith('application/wasm')) throw new Error('WASM MIME mismatch');
  await WebAssembly.compile(wasm.decoded); await WebAssembly.compile(wasmBr.decoded);
  if (wasm.sha256 !== wasmBr.sha256 || wasmBr.headers['content-encoding'] !== 'br') throw new Error('WASM Brotli mismatch');
  const plain = await record('text', release.probes.payload);
  const br = await record('text-br', release.probes.payloadBr);
  if (plain.sha256 !== br.sha256 || br.headers['content-encoding'] !== 'br') throw new Error('Text Brotli mismatch');
  if (!String(br.headers['cache-control']).includes('immutable')) throw new Error('Probe cache policy missing');
  const repeated = await record('cache-repeat', release.probes.payloadBr);
  const data = await record('data', release.probes.data);
  if (!String(data.headers['content-type']).startsWith('application/octet-stream')) throw new Error('Data MIME mismatch');
  const js = await record('javascript', '/diagnostics.js');
  if (!/javascript/.test(js.headers['content-type'])) throw new Error('JavaScript MIME mismatch');
  for (const route of ['/WorldBundles/catalog.json', '/MissionData/contact.json', '/Build/WebGL.data', '/.env', '/reviewed-files.json']) {
    const r = await request(new URL(route, origin));
    rows.push({ name: 'must-be-absent', route, status: r.status });
    if (r.status !== 404) throw new Error(`Forbidden route exposed: ${route}`);
  }
  return { passed: true, origin, commit: release.commit, branch: release.branch, scope: release.scope, rows, cacheObservation: repeated.headers['x-vercel-cache'] || 'not exposed', gameValidated: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyHttp(process.argv[2]);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, rows: result.rows.map(r => ({ name: r.name, status: r.status, encoding: r.headers?.['content-encoding'], wireBytes: r.wireBytes, cache: r.headers?.['x-vercel-cache'] })) }, null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
