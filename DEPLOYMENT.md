# Deployment operations

## Scope and target

This is a dedicated publication repository, not the Unity development project. Vercel framework: Other; Node 24; no dependencies; build `npm run build`; output `public`. The intended Git connection uses `main` for production and other branches for previews. Creation and local linking of the Vercel project succeeded; the server rejected the Git connection because its GitHub App is not installed. Until that prerequisite is completed, a plain push only runs GitHub checks; an explicit authenticated CLI deployment is required. The project and stable production domain are recorded in the local deployment report. Verify project/team/commit/environment before every mutation. Do not deploy from the Unity project or its parent folder.

Only the files listed in publication-policy.json and reviewed-files.json may enter Git. Build output is ignored by Git and generated again by Vercel. There is no remote game URL, asset proxy or link to a download distribution.

All source receipts use exact-byte SHA-256 except vercel.json, whose receipt uses canonical JSON (every property and ordered array included). This accommodates Vercel reserialization of that configuration in its build container; changing a header or any other value still fails the gate. Tests cover both harmless reserialization and a rejected header change.

## Code changes and automatic deployment

Read each changed source before refreshing the review receipt. Never regenerate that receipt inside CI.

```sh
node scripts/review-files.mjs
npm run check
npm test
npm run build
git diff
# Stage only the exact policy-approved files, never the development project.
node scripts/verify-publication.mjs --git-index
git commit -m "Describe the verified infrastructure change"
git push origin main
```

The local publish helper stages the explicit allowlist and repeats the gate. Git hooks check the index before commit and HEAD before push. CI is pinned to reviewed action commits, contents:read, standard ubuntu-latest and a three-minute timeout. No deployment token is stored in GitHub. Once authorized, Vercel's Git connection will deploy and rerun the source gate/tests in its own build. Explicit CLI deployments already run that same build. The Vercel gate does not depend on GitHub Actions finishing first. A changed receipt is a review record, not a cryptographic signature from an independent reviewer; review of pipeline-code changes remains necessary.

Account intervention to enable Git automation: open https://github.com/apps/vercel, install/configure the official app for the dedicated repository only, then run `vercel git connect https://github.com/Toshe00/gta-sa-webgl-pipeline.git --scope rpss-projects-8907c6b3 --non-interactive` from the explicitly linked publication repository. Verify the resulting connection and production branch before testing a push. No credential should be pasted into this repository or a chat.

Vercel never runs Unity. The game workflow is local: development -> existing Unity editor assertions/tests -> new, separate WebGL build -> real Chrome DevTools validation -> file-bound rights and validation audit -> new authorized artifact snapshot -> source review -> explicit commit/push -> Vercel build -> production HTTP/Chrome checks. The rights/artifact-transport steps for the game remain blocked and are not claimed operational.

## Game release is disabled

The existing game Player, .data/WASM, AssetBundles, converted textures/meshes/COL/IFP, map coordinates, navigation, mission/GXT data, graphics, audio, archives and screenshots are not approved for transfer. Changing an extension, using Git LFS or choosing a private repository does not change that policy. No game source, executable or licensing credential is present in this repository.

The local-only candidate checker requires a complete per-file rights manifest with provenance, permission and SHA-256, plus a complete Unity/Chrome receipt binding the same file hashes. Missing rights, failed tests, a changed file, an executable or an unresolved junction fails closed before upload. It does not itself determine whether legal authorization is valid. Independent review of the authorization and a new reviewed publication policy are indispensable before enabling game artifact transport.

```sh
node scripts/check-webgl-release.mjs <local-build-root> <local-validation-receipt.json> <local-rights-manifest.json>
```

Without a rights manifest the expected result is `BLOCKED`, exit 1, zero files transferred. The current diagnostic site must not be described as the deployed game.

## Static delivery

The site uses relative same-origin URLs and no SPA fallback. Missing assets return 404. Headers configure JavaScript, application/wasm, application/octet-stream, explicit Brotli probes, COOP/COEP, nosniff and a restrictive CSP. The empty WASM module and text probes are technical code/data only. Hashed immutable probes receive long browser caching; index, JS, CSS and release metadata revalidate. There is no Clear-Site-Data header, service worker or cache deletion.

Use the HTTP checker against the stable production origin:

```sh
node scripts/verify-http.mjs https://<project>.vercel.app <local-evidence.json>
```

It verifies MIME, raw/decoded SHA equality, WASM compilation, Content-Encoding, cache policy, repeat request headers, COOP/COEP and absence of game/private routes. Actual CDN compression and cache observations must be recorded after deployment, not inferred from configuration. Preview protection is retained; use authenticated Vercel access for protected previews rather than disabling it.

## Streaming and persistence

The local world's 4261 cells, original LOD/fog, near collisions and streaming implementation remain untouched. No scene or whole-world eager loader is added. A future authorized release must materialize and audit the shared WorldBundles junction; a Player-only copy is incomplete. The current repository has no game cells or streaming runtime to validate online.

Future game releases must retain the stable production origin and page-directory path. Unity Web persistentDataPath uses a directory-URL-derived IndexedDB path. Preview URLs and localhost ports are different origins: they do not share F6 saves automatically. Preserve schema/version/two slots and FS.syncfs acknowledgement; never clear IDBFS during updates. Export/import between origins requires the player's explicit local F6 operation. Do not upload saves to Git or the diagnostic site.

The diagnostic uses only its separate `webgl-infrastructure-diagnostics-v1` IndexedDB database. Its continuity check across two production pushes demonstrates origin persistence for that technical key, not F6 gameplay compatibility on Vercel. Local F6 validation remains in the development reports.

## Free-plan boundaries

Verified against official documentation during setup: Vercel Hobby is for personal, non-commercial use, with 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer and one million CDN requests in included usage. CLI source upload is limited to 100 MB and 15000 source files. These are not a 100 MB per-output-file limit or a guarantee that a game fits. The local disk inventory includes aliases/compression variants, not the initial network transfer. There is no documented fixed output-file count cap; very large output trees still incur build/deployment/storage constraints. No paid plan, paid runner, storage extension, domain purchase or spending increase is enabled.

## Rollback

First verify the explicitly linked project and team from this repository:

```sh
vercel project inspect --non-interactive
vercel rollback <previous-production-deployment-url> --scope <verified-team>
node scripts/verify-http.mjs https://<stable-project>.vercel.app <local-rollback-evidence.json>
```

Hobby supports the immediately previous production deployment. A rollback can pause automatic production-domain assignment; explicitly promote the desired tested production deployment to resume it:

```sh
vercel promote <tested-production-deployment-url> --scope <verified-team>
```

Source recovery without rewriting history: `git revert <bad-commit>` on main, run review/check/tests, then commit/push the reviewed result. Never reset or force-push. Keep exact commit/deployment IDs in the local report, respecting deployment retention. Rollback must not erase IndexedDB or require a save-schema downgrade without compatibility testing.

## Official references

- https://vercel.com/docs/limits
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/how-vercel-cdn-works/compression
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/instant-rollback
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/application/persistentdatapath
