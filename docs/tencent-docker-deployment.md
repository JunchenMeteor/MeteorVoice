# Tencent Docker Deployment

This runbook defines the target Docker deployment for the MeteorVoice Web/API on the existing Tencent server. It covers the server component only; the iOS app, hosted Supabase project, and host Nginx remain outside Docker.

> Status: target design. The active Tencent deployment still uses PM2 until the migration acceptance checklist in this document is complete.

## Environment mapping

| Branch | Environment | Domain | Host port | Compose project | Runtime env |
| --- | --- | --- | ---: | --- | --- |
| `main` | Preview | `mv-pre.jcmeteor.com` / `mv-pre-cn.jcmeteor.com` | `3101` | `meteorvoice-preview` | `/etc/meteorvoice/meteorvoice.env` |
| `release` | Production | `meteorvoice.jcmeteor.com` / `mv-cn.jcmeteor.com` | `3100` | `meteorvoice-production` | `/etc/meteorvoice/meteorvoice.env` |

Nginx MUST continue binding public ports 80/443. Containers MUST publish only to `127.0.0.1`.

## Target delivery flow

1. A GitHub-hosted runner checks out the requested commit.
2. CI runs lint, tests, mobile typecheck, and the Web production build.
3. CI exports the multi-stage Next.js standalone image as a compressed GitHub Actions artifact.
4. The image is tagged with an immutable commit SHA. Branch and release tags MAY be added as aliases, but deployments MUST resolve to the SHA tag.
5. The repository-specific Tencent runner downloads the artifact, loads the immutable image into Docker, and updates only the matching Compose project.
6. The runner waits for the container health check and verifies the public domain.
7. A failed health check MUST restore the previous image SHA.

The server MUST NOT run `git fetch`, `npm ci`, or `next build` after migration.

## Image contract

- Image tag: `meteorvoice-web:<commit-sha>`.
- Build context: repository root, because the Web app consumes npm workspaces under `packages/*`.
- Next.js MUST use `output: 'standalone'`.
- The runtime stage MUST contain only the standalone server, static assets, and required public files.
- The runtime process MUST run as a non-root user.
- Secrets MUST NOT be copied or passed as Docker build arguments.
- `.dockerignore` MUST exclude `.git`, `.env*`, local build output, logs, and mobile/native build artifacts.

## Configuration and secrets

Real provider credentials remain in `/etc/meteorvoice/meteorvoice.env`, owned by root and readable only by the deployment/runtime account as required. Compose injects the file at container startup.

GitHub Actions stores the compressed image for seven days and transfers it through the workflow artifact service. No container-registry password is required. Xunfei, DeepSeek, Supabase service-role, and other application secrets are not included in the image artifact.

## Compose requirements

Preview and production MUST use separate Compose project names, containers, and networks. Each service MUST define:

- `restart: unless-stopped`;
- a health check for the Web/API process;
- JSON log rotation (`max-size: 10m`, `max-file: 3`);
- a memory limit appropriate for the 3.6 GiB host;
- an immutable image SHA;
- `127.0.0.1:3101` or `127.0.0.1:3100` host binding.

Deployment metadata MAY live under `/srv/containers/meteorvoice/{preview,production}`. Application secrets MUST stay under `/etc/meteorvoice`.

## First migration from PM2

Migrate one environment at a time, preview before production.

1. Record the current Git commit, PM2 process, Nginx configuration, and public health result.
2. Build and push the candidate image without changing the server runtime.
3. Start a shadow container on an unused localhost port and verify Web pages plus `/api/scenarios`, `/api/chat` request validation, and TTS request validation.
4. Switch only the relevant Nginx upstream to the shadow container and run public-domain checks.
5. Stop only the matching PM2 process.
6. Start the final Compose project on the existing `3101` or `3100` port and return Nginx to that port.
7. Observe logs and health before migrating the next environment.

Do not run `pm2 kill`. Keep the PM2 definitions and source checkout until both environments have passed the observation window.

## Routine deployment

Routine deployment updates only one branch environment:

1. resolve the new immutable image SHA;
2. record the currently running SHA;
3. download and load the image artifact;
4. update the matching Compose project from the local immutable image;
5. wait for container health;
6. verify the localhost port and public domain;
7. retain the previous SHA for rollback.

## Rollback

For a normal Docker rollback, set the deployment metadata to the previous image SHA and run Compose pull/up again. Verify localhost and public health before closing the incident.

During the first migration, if Docker cannot serve the environment:

1. stop the failed Compose project;
2. restore the previous Nginx upstream if it changed;
3. restart only `meteorvoice` or `meteorvoice-release` in PM2;
4. verify the original port and public domain.

## Acceptance checklist

- CI builds the same commit that is tagged and deployed.
- No application secret exists in image history, build logs, or artifact metadata.
- Preview and production can deploy and roll back independently.
- Containers bind only to localhost.
- Nginx configuration passes `nginx -t` before reload.
- PM2 rollback is tested before its definitions are removed.
- Preview and production domains return HTTP 200.
- Auth, scenario loading, chat, Xunfei ASR/TTS, and mobile API compatibility are checked.
- Docker logs rotate and old images have a documented retention policy.

## Related documentation

- `docs/deployment-runbook.md`: branch and release responsibilities.
- `docs/release-manager.md`: release automation.
- `docs/tts-integration.md`: speech-provider runtime secrets.
- `docs/mobile-local-build-runbook.md`: iOS build and API endpoint behavior.
