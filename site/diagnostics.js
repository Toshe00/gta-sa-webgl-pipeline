const results = [];
const check = (name, passed, detail = '') => results.push({ name, passed, detail });
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r;
}
async function continuity() {
  // A distinct database, never the Unity IDBFS database or F6 save slots.
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('webgl-infrastructure-diagnostics-v1', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('checks');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const previous = await new Promise((resolve, reject) => {
    const tx = db.transaction('checks', 'readwrite');
    const store = tx.objectStore('checks');
    const read = store.get('continuity');
    let value;
    read.onsuccess = () => {
      value = read.result;
      if (!value) store.put({ createdAt: new Date().toISOString(), nonce: crypto.randomUUID() }, 'continuity');
    };
    tx.oncomplete = () => resolve(value || null);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  return previous;
}
try {
  const release = await (await get('/release.json')).json();
  document.querySelector('#release').replaceChildren(...Object.entries({
    Version: release.version, Commit: release.commit, Branche: release.branch, Portée: release.scope,
  }).flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  check('Ressources propriétaires absentes', release.gameAssetsPublished === false);
  const wasm = await get(release.probes.wasm);
  check('MIME WASM', wasm.headers.get('content-type')?.startsWith('application/wasm') === true);
  await WebAssembly.instantiateStreaming(Promise.resolve(wasm));
  check('Compilation streaming WASM technique', true);
  const wasmBr = await get(release.probes.wasmBr);
  await WebAssembly.instantiateStreaming(Promise.resolve(wasmBr));
  check('WASM Brotli, décodage HTTP', true, wasmBr.headers.get('content-encoding') || 'encodage non exposé');
  const payload = await (await get(release.probes.payload)).text();
  const compressedResponse = await get(release.probes.payloadBr);
  const decoded = await compressedResponse.text();
  check('Brotli : octets décodés identiques', decoded === payload);
  check('Cache des sondes versionnées', compressedResponse.headers.get('cache-control')?.includes('immutable') === true);
  check('Isolation COOP/COEP', crossOriginIsolated === true);
  const prior = await continuity();
  document.querySelector('#continuity').textContent = prior
    ? `Persistance technique conservée depuis ${prior.createdAt}.`
    : 'Persistance technique initialisée ; elle sera relue après mise à jour du même domaine.';
  check('IndexedDB technique, base distincte de F6', true, prior ? 'existing' : 'initialized');
  window.deploymentDiagnostics = { release, results, continuity: prior, passed: results.every(x => x.passed) };
} catch (e) {
  check('Diagnostic interrompu', false, String(e));
  window.deploymentDiagnostics = { results, passed: false, error: String(e) };
  console.error('Infrastructure diagnostic failed', e);
}
document.querySelector('#checks').replaceChildren(...results.map(r => {
  const li = document.createElement('li');
  li.textContent = `${r.passed ? 'OK' : 'ÉCHEC'} — ${r.name}${r.detail ? ` : ${r.detail}` : ''}`;
  return li;
}));
document.querySelector('#summary').textContent = window.deploymentDiagnostics.passed
  ? 'Contrôles techniques réussis. Le jeu GTA reste local et non publié.'
  : 'Un contrôle technique a échoué. Consulter les résultats.';
