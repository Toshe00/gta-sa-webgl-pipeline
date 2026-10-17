import fs from 'node:fs';
import path from 'node:path';
import { repositoryRoot, reviewDigest } from './verify-publication.mjs';
// Manual preparation after reading every changed file. Never run this from CI.
const policy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'publication-policy.json')));
const files = policy.approvedFiles.filter(n => n !== 'reviewed-files.json').map(name => {
  const f = path.join(repositoryRoot, name);
  if (!fs.lstatSync(f).isFile() || fs.lstatSync(f).isSymbolicLink()) throw new Error(`Invalid reviewed source: ${name}`);
  return { path: name, sha256: reviewDigest(name, fs.readFileSync(f)),
    digestMode: name === 'vercel.json' ? 'canonical-json-all-properties' : 'exact-bytes',
    provenance: 'Authored publication infrastructure code; no GTA resource content' };
});
fs.writeFileSync(path.join(repositoryRoot, 'reviewed-files.json'), JSON.stringify({
  schema: 1, scope: 'Original publication code and technical probes only; no game data', files,
}, null, 2) + '\n');
console.log(`Recorded ${files.length} file hashes. Run check and tests before staging these exact files.`);
