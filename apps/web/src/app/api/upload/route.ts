import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { NextResponse } from "next/server";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maximumSizeInBytes = 20 * 1024 * 1024;

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function POST(request: Request) {
  const sessionCookie = request.headers
    .get("cookie")
    ?.split(";")
    .find((cookie) => cookie.trim().startsWith("ackbar_session="))
    ?.trim();
  if (!sessionCookie)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";
    const authentication = await fetch(`${apiUrl}/users/me`, {
      headers: { Cookie: sessionCookie },
      cache: "no-store",
    });
    if (!authentication.ok) throw new Error("Invalid identity token");
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
