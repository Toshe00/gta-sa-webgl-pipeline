# WebGL publication pipeline

Publication infrastructure only. This repository contains original tooling, a text diagnostic page, an empty WebAssembly code module generated during build, and technical compression probes. It contains no GTA game resources, Unity Player, artwork, substitute assets, screenshots, archive or save files.

The original game remains local. A private repository would not authorize redistribution or make a Vercel production deployment private.

## Reproducible checks

Node.js 24, no npm dependencies or Docker:

```sh
npm run check
npm test
npm run build
```

The build verifies exact reviewed SHA-256 values and runs the safety tests before creating ten authored technical output files. A failed gate prevents the Vercel build from succeeding. The public source repository uses standard Linux GitHub Actions runners without paid runners, artifact uploads or dependency caches; Vercel uses the Hobby plan.

The intended Git integration uses `main` for production and other branches for previews. Its account prerequisite is not yet satisfied: the Vercel GitHub App must be installed and allowed to access this repository. Until that connection is verified, a plain push runs GitHub checks but does not deploy to Vercel. Explicit CLI deployments can test the same reviewed site in the already-created project. Neither route launches Unity or compiles a game.

See [DEPLOYMENT.md](DEPLOYMENT.md) for release gates, provenance, hosting headers, stable saves and rollback. Do not add original game data or change the disabled game-release policy without independent rights and release review.
