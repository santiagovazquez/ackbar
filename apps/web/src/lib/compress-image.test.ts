import { describe, expect, it } from "vitest";
import { isSupportedImage } from "./compress-image";

describe("isSupportedImage", () => {
  it.each(["photo.jpg", "photo.jpeg", "photo.png", "photo.webp", "photo.avif", "photo.gif"])(
    "accepts the popular image format %s",
    (name) => expect(isSupportedImage(new File(["image"], name))).toBe(true),
  );

  it("accepts HEIC files even when the browser provides no MIME type", () => {
    expect(isSupportedImage(new File(["image"], "IMG_1234.HEIC"))).toBe(true);
  });

  it("rejects unrelated files", () => {
    expect(isSupportedImage(new File(["text"], "notes.txt", { type: "text/plain" }))).toBe(false);
  });
});
