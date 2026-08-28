import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";

const google = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumSizeInBytes = 20 * 1024 * 1024;

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!token || !clientId)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    await google.verifyIdToken({ idToken: token, audience: clientId });
  } catch {
    return NextResponse.json(
      { error: "Your session expired. Sign in again to upload images." },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as { contentType?: string; size?: number };
    if (!body.contentType || !allowedContentTypes.has(body.contentType))
      throw new Error("Images must be JPG, PNG, or WebP");
    if (!body.size || body.size > maximumSizeInBytes)
      throw new Error("Images must be 20 MB or smaller");

    const bucket = requiredEnvironmentVariable("S3_BUCKET");
    const region = requiredEnvironmentVariable("S3_REGION");
    const key = `listing-images/${crypto.randomUUID()}`;
    const s3 = new S3Client({
      region,
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
    const upload = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: key,
      Fields: { "Content-Type": body.contentType },
      Conditions: [
        ["content-length-range", 1, maximumSizeInBytes],
        ["eq", "$Content-Type", body.contentType],
      ],
      Expires: 300,
    });
    const publicBaseUrl = requiredEnvironmentVariable("S3_PUBLIC_URL").replace(/\/$/, "");
    return NextResponse.json({ ...upload, publicUrl: `${publicBaseUrl}/${key}` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
