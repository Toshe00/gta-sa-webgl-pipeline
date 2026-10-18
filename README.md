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

The existing Vercel project is connected to this GitHub repository, with `main` configured as its production branch (connection verified on 2026-10-18). Pushes run GitHub checks and trigger Vercel's own source build; other branches use previews. Vercel reruns the publication gate and tests before publishing. No manual deployment command, Unity invocation or game compilation is part of this Git workflow.

See [DEPLOYMENT.md](DEPLOYMENT.md) for release gates, provenance, hosting headers, stable saves and rollback. Do not add original game data or change the disabled game-release policy without independent rights and release review.
