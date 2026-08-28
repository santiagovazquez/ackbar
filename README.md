# SWU Marketplace

A community marketplace for buying, selling, and claiming Star Wars Unlimited singles.

## Architecture

- `apps/web`: Next.js client deployed to Vercel.
- `apps/api`: Node.js/Express API. It uses local SQLite in development and Turso/libSQL in production.
- `packages/shared`: shared TypeScript contracts.

Google sign-in is initiated entirely in the browser. Protected API routes independently verify Google's ID token; trusting a browser-provided user ID would allow impersonation.

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and configure a Google OAuth Web client. Add a Vercel Blob read-write token to enable photo uploads; a public image URL can be used without it.
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

An ephemeral Vercel function cannot safely persist a local SQLite file. Create a free Turso database and set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` for the API. Deploy `apps/api` as one Vercel project, then deploy `apps/web` as another with `NEXT_PUBLIC_API_URL` pointing to the API project. The included API entrypoint and rewrite configuration package Express as a Vercel function.

Publications expire seven days after creation. Soft deletion preserves claims and reputation history.

# swu-compraventa
