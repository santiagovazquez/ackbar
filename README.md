# SWU Marketplace

A community marketplace for buying, selling, and claiming Star Wars Unlimited singles.

## Architecture

- `apps/web`: Next.js web application.
- `apps/api`: Node.js/Express API. It uses local SQLite in development and Turso/libSQL in production.
- `packages/shared`: shared TypeScript contracts.

Google sign-in is initiated entirely in the browser. Protected API routes independently verify Google's ID token; trusting a browser-provided user ID would allow impersonation.

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and configure a Google OAuth Web client and S3 bucket credentials.
3. Also expose the relevant variables to each app (for example through `apps/api/.env` and `apps/web/.env.local`).
4. Run `pnpm db:migrate`.
5. Run `pnpm db:seed` to download and import the current SWU card catalog.
6. Run `pnpm dev`.

`db:seed` downloads the public bulk export from SWU API and upserts cards in batches. Set
`SWU_CARD_CATALOG_URL` to use a compatible mirror or fixture instead.

The web client runs on port 4000 and the API on port 4001 by default.

## Code quality

- `pnpm lint` checks ESLint rules for TypeScript, React, and React Hooks.
- `pnpm format` formats the workspace with Prettier.
- `pnpm check` runs linting, formatting checks, type checks, and tests.

## Production

Build the workspace with `pnpm build`, run the API with `pnpm --filter @swu/api start`, and run the web app with `pnpm --filter @swu/web start`. Set `NEXT_PUBLIC_API_URL` to the public API URL and `WEB_ORIGIN` to the public web URL. A process manager and reverse proxy can keep both services running behind HTTPS on a private server.

Photo uploads use presigned S3 POSTs and go directly from the browser to the bucket. Configure `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_PUBLIC_URL` in the web app environment. The bucket must allow public reads (or be fronted by the public CDN in `S3_PUBLIC_URL`) and its CORS policy must allow `POST` from the web origin. Each publication supports up to 24 images of 20 MB each.

The API can use a persistent local SQLite file on a private server. Set `DATABASE_URL` to an absolute file URL such as `file:/var/lib/swu/marketplace.db`, or configure a remote libSQL database with `DATABASE_AUTH_TOKEN`.

Publications expire seven days after creation. Soft deletion preserves claims and reputation history.

# swu-compraventa
