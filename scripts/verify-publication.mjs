import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const sortedJson = value => Array.isArray(value) ? value.map(sortedJson)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sortedJson(value[k])])) : value;
// Vercel may reserialize its config in the remote build container. Compare every
// JSON property and ordered array while ignoring whitespace/property order only.
export const reviewDigest = (name, data) => sha256(name === 'vercel.json'
  ? JSON.stringify(sortedJson(JSON.parse(data.toString('utf8')))) : data);
const denied = /\.(exe|dll|asi|rar|zip|7z|img|dff|txd|col|ifp|ipl|ide|scm|gxt|gtex|gtmd|asset|prefab|unity|sav|save|png|jpg|wav|mp3|ogg|fbx|glb|bin|wasm|data|br|gz)$/i;
const ignored = new Set(['.git', '.vercel', 'public', 'node_modules']);
const token = /(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{35,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

function filesUnder(root, relative = '') {
  const out = [];
  for (const d of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (!relative && ignored.has(d.name)) continue;
    const name = relative ? `${relative}/${d.name}` : d.name;
    const stat = fs.lstatSync(path.join(root, name));
    if (stat.isSymbolicLink()) throw new Error(`Links are forbidden: ${name}`);
    if (stat.isDirectory()) out.push(...filesUnder(root, name));
    else if (stat.isFile()) out.push(name);
    else throw new Error(`Non-regular path: ${name}`);
  }
  return out;
}

export function verifyPublication(root = repositoryRoot, { gitMode } = {}) {
  const read = gitMode
    ? name => execFileSync('git', ['show', `${gitMode === 'index' ? ':' : 'HEAD:'}${name}`], { cwd: root, maxBuffer: 2_000_000 })
    : name => fs.readFileSync(path.join(root, name));
  const names = gitMode
    ? execFileSync('git', gitMode === 'index' ? ['ls-files', '-z'] : ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], { cwd: root }).toString().split('\0').filter(Boolean)
    : filesUnder(root);
  const policy = JSON.parse(read('publication-policy.json'));
  const reviewed = JSON.parse(read('reviewed-files.json'));
  if (policy.mode !== 'infrastructure-only' || policy.gameReleaseEnabled !== false || policy.redistributionAuthorization !== null)
    throw new Error('Game publication is disabled; an independently reviewed rights/release policy is required');
  if (reviewed.scope !== 'Original publication code and technical probes only; no game data') throw new Error('Review scope mismatch');
  const allowed = new Set(policy.approvedFiles);
  if (names.length > policy.maxSourceFiles) throw new Error('Source file budget exceeded');
  if (allowed.size !== names.length || names.some(n => !allowed.has(n))) throw new Error('Unapproved or missing publication file');
  const expectedHashes = new Map(reviewed.files.map(f => [f.path, f.sha256]));
  if (expectedHashes.size !== allowed.size - 1 || [...expectedHashes.keys()].some(n => !allowed.has(n) || n === 'reviewed-files.json'))
    throw new Error('Incomplete or unexpected review manifest');
  let bytes = 0;
  for (const name of names) {
    if (denied.test(name) || /(?:^|\/)(?:\.env[^/]*|hoodlum[^/]*)$/i.test(name) || name.includes('..') || name.includes('\\'))
      throw new Error(`Forbidden publication path: ${name}`);
    const data = read(name);
    bytes += data.length;
    if (data.length > policy.maxFileBytes) throw new Error(`File budget exceeded: ${name}`);
    if (data[0] === 0x4d && data[1] === 0x5a) throw new Error(`PE executable signature: ${name}`);
    if (data.includes(0) || token.test(data.toString('utf8'))) throw new Error(`Binary or credential candidate: ${name}`);
    if (name !== 'reviewed-files.json' && expectedHashes.get(name) !== reviewDigest(name, data)) throw new Error(`File changed since review: ${name}`);
  }
  if (bytes > policy.maxSourceBytes) throw new Error('Total source budget exceeded');
  return { passed: true, scope: policy.mode, sourceFiles: names.length, sourceBytes: bytes, gameAssetsPublished: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const gitMode = process.argv.includes('--git-index') ? 'index' : process.argv.includes('--git-head') ? 'head' : undefined;
    console.log(JSON.stringify(verifyPublication(repositoryRoot, { gitMode }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
