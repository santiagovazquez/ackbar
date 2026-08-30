# SWU Marketplace

A community marketplace for buying, selling, and claiming Star Wars Unlimited singles.

## Architecture

- `apps/web`: Next.js web application.
- `apps/api`: Node.js/Express API. It uses local SQLite in development and Turso/libSQL in production.
- `packages/shared`: shared TypeScript contracts.

Google sign-in is initiated entirely in the browser. Protected API routes independently verify Google's ID token; trusting a browser-provided user ID would allow impersonation.

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `apps/api/.env.example` to `apps/api/.env` and configure the API variables.
3. Copy `apps/web/.env.example` to `apps/web/.env.local` and configure the Google and S3 variables. Next.js does not load the repository-root `.env` because the web app runs from `apps/web`.
4. Run `pnpm db:migrate`.
5. Run `pnpm db:seed` to download and import the current SWU card catalog.
6. To access the app from other devices on your local network, copy `.env.local.example` to
   `.env.local` and set `LOCAL_IP` to this computer's local IP address. On macOS with Wi-Fi you can
   usually find it with `ipconfig getifaddr en0`.
7. Run `pnpm dev` and open `http://<LOCAL_IP>:4000`.

`db:seed` downloads the public bulk export from SWU API and upserts cards in batches. Set
`SWU_CARD_CATALOG_URL` to use a compatible mirror or fixture instead.

To import test publications into the local SQLite database, edit
`apps/api/seeds/local-listings.json` and run `pnpm db:seed:listings`. You can also pass a different
JSON file after `--`, for example `pnpm db:seed:listings -- ./seeds/my-listings.json`. The command is
idempotent for listing IDs and refuses to run in production or against a non-`file:` database.

The web client runs on port 4000 and the API on port 4001 by default. Both listen on all network
interfaces in development; `LOCAL_IP` determines the URLs advertised to the browser and the API's
allowed CORS origin. Without `.env.local`, development continues to use `localhost`.

## Code quality

- `pnpm lint` checks ESLint rules for TypeScript, React, and React Hooks.
- `pnpm format` formats the workspace with Prettier.
- `pnpm check` runs linting, formatting checks, type checks, and tests.

## Production

Build the workspace with `pnpm build`, run the API with `pnpm --filter @swu/api start`, and run the web app with `pnpm --filter @swu/web start`. Set `NEXT_PUBLIC_API_URL` to the public API URL and `WEB_ORIGIN` to the public web URL. A process manager and reverse proxy can keep both services running behind HTTPS on a private server.

Photo uploads use presigned S3 POSTs and go directly from the browser to the bucket. Configure `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_PUBLIC_URL` in the web app environment. The bucket must allow public reads (or be fronted by the public CDN in `S3_PUBLIC_URL`) and its CORS policy must allow `POST` from the web origin. Each publication supports up to 24 images of 20 MB each.

The API can use a persistent local SQLite file on a private server. Set `DATABASE_URL` to an absolute file URL such as `file:/var/lib/swu/marketplace.db`, or configure a remote libSQL database with `DATABASE_AUTH_TOKEN`.

Publications expire seven days after creation. Owners can deactivate them, which removes them from
the marketplace and prevents new claims while preserving existing claims and reputation history.

# swu-compraventa
