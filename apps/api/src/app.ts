import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { listingsRouter } from "./listings.js";
import { claimsRouter } from "./claims.js";
import { usersRouter } from "./users.js";
import { uploadsRouter } from "./uploads.js";

await migrate();
export const app = express();
app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/listings", listingsRouter);
app.use("/claims", claimsRouter);
app.use("/users", usersRouter);
app.use("/uploads", uploadsRouter);
app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    response.status(500).json({
      error: "Internal server error",
      ...(process.env.NODE_ENV === "test" ? { detail: message } : {}),
    });
  },
);
