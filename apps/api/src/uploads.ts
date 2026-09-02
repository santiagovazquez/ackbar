import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";

const maximumSizeInBytes = 20 * 1024 * 1024;
const uploadSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(maximumSizeInBytes),
});

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export const uploadsRouter = Router();

uploadsRouter.post("/", requireAuth, async (request, response) => {
  const body = uploadSchema.safeParse(request.body);
  if (!body.success)
    return response
      .status(400)
      .json({ error: "Images must be JPG, PNG, or WebP and 20 MB or smaller" });

  const bucket = required(config.s3Bucket, "S3_BUCKET");
  const region = required(config.s3Region, "S3_REGION");
  const publicBaseUrl = required(config.s3PublicUrl, "S3_PUBLIC_URL").replace(/\/$/, "");
  const key = `listing-images/${crypto.randomUUID()}`;
  const s3 = new S3Client({
    region,
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
    forcePathStyle: config.s3ForcePathStyle,
  });
  const upload = await createPresignedPost(s3, {
    Bucket: bucket,
    Key: key,
    Fields: { "Content-Type": body.data.contentType },
    Conditions: [
      ["content-length-range", 1, maximumSizeInBytes],
      ["eq", "$Content-Type", body.data.contentType],
    ],
    Expires: 300,
  });
  response.json({ ...upload, publicUrl: `${publicBaseUrl}/${key}` });
});
