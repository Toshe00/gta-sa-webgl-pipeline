import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './verify-publication.mjs';

// A local audit only. This command never uploads, copies, stages, commits or pushes a game build.
export function checkWebglRelease({ buildRoot, receiptPath, rightsPath }) {
  if (!rightsPath || !fs.existsSync(rightsPath)) throw new Error('BLOCKED: no reviewed redistribution authorization; zero game files may be transferred');
  const rights = JSON.parse(fs.readFileSync(rightsPath));
  if (rights.schema !== 1 || rights.authorized !== true || !rights.evidence || !Array.isArray(rights.files) || !rights.files.length)
    throw new Error('BLOCKED: incomplete rights manifest');
  const receipt = JSON.parse(fs.readFileSync(receiptPath));
  if (receipt.schema !== 1 || receipt.unityBuild !== 'Succeeded' || receipt.unityValidationPassed !== true || receipt.chromeValidationPassed !== true || receipt.validationScope !== 'full-game-build')
    throw new Error('BLOCKED: Unity and real Chrome validation receipts required');
  const root = fs.realpathSync(buildRoot);
  const files = [];
  const walk = dir => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name), stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error('BLOCKED: materialize junctions in a new reviewed local snapshot first');
      if (d.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  const permitted = new Map(rights.files.map(f => [f.path, f]));
  const validated = new Map(receipt.files.map(f => [f.path, f.sha256]));
  if (permitted.size !== files.length || validated.size !== files.length) throw new Error('BLOCKED: complete file-bound rights and validation manifests required');
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/'), grant = permitted.get(rel);
    if (!grant || !grant.license || !grant.provenance || !grant.redistributionAllowed || /\.(exe|dll|asi|rar|zip|7z|sav)$/i.test(rel)) throw new Error(`BLOCKED: unapproved resource ${rel}`);
    const digest = sha256(fs.readFileSync(f));
    if (grant.sha256 !== digest || validated.get(rel) !== digest) throw new Error(`BLOCKED: resource changed since rights/Chrome validation: ${rel}`);
  }
  return { passed: true, files: files.length, mode: 'local-audit-only', publicationEnabled: false,
    next: 'Independent release-policy review and licensed artifact transport required; current repository remains infrastructure-only' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(checkWebglRelease({ buildRoot: process.argv[2], receiptPath: process.argv[3], rightsPath: process.argv[4] }), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
