import imageCompression from "browser-image-compression";
import { heicTo, isHeic } from "heic-to/next";

export const MAX_UPLOADED_IMAGE_SIZE = 1024 * 1024 - 1;
export const MAX_UPLOADED_IMAGE_DIMENSION = 1500;

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  ...HEIC_TYPES,
]);

export function isSupportedImage(file: File) {
  return (
    COMPRESSIBLE_TYPES.has(file.type.toLowerCase()) ||
    /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name)
  );
}

function withExtension(name: string, extension: string) {
  return `${name.replace(/\.[^.]+$/, "") || "imagen"}.${extension}`;
}

async function normalizeHeic(file: File) {
  if (!HEIC_TYPES.has(file.type.toLowerCase()) && !(await isHeic(file))) return file;

  const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
  return new File([jpeg], withExtension(file.name, "jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

export async function compressImageForUpload(source: File): Promise<File> {
  const file = await normalizeHeic(source);
  let compressed = await imageCompression(file, {
    maxSizeMB: 0.9,
    maxWidthOrHeight: MAX_UPLOADED_IMAGE_DIMENSION,
    initialQuality: 0.86,
    fileType: "image/webp",
    maxIteration: 20,
    // Keep the worker code local instead of relying on the library's CDN fallback.
    useWebWorker: false,
  });

  if (compressed.size > MAX_UPLOADED_IMAGE_SIZE) {
    compressed = await imageCompression(compressed, {
      maxSizeMB: 0.75,
      maxWidthOrHeight: 1200,
      initialQuality: 0.75,
      fileType: "image/webp",
      maxIteration: 20,
      useWebWorker: false,
    });
  }

  if (compressed.size > MAX_UPLOADED_IMAGE_SIZE)
    throw new Error(`No se pudo reducir ${source.name} a menos de 1 MB.`);

  return new File([compressed], withExtension(source.name, "webp"), {
    type: "image/webp",
    lastModified: source.lastModified,
  });
}
