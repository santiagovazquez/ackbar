import "dotenv/config";

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4001),
  databaseUrl: process.env.DATABASE_URL ?? "file:local.db",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:4000",
};
