import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";

const google = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => {
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (!token || !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
          throw new Error("Authentication required");
        await google.verifyIdToken({
          idToken: token,
          audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        });
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
