import "dotenv/config";

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4001),
  databaseUrl: process.env.DATABASE_URL ?? "file:local.db",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:4000",
  sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN,
  s3Bucket: process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION,
  s3PublicUrl: process.env.S3_PUBLIC_URL,
  s3Endpoint: process.env.S3_ENDPOINT,
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  localAuthEnabled:
    process.env.NODE_ENV !== "production" &&
    (process.env.DATABASE_URL ?? "file:local.db").startsWith("file:"),
};
