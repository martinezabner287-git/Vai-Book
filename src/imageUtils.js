// Client-side stand-in for next/image's automatic WebP conversion + resizing.
// This app has no image-optimizing server (no Next.js, no CDN transform
// layer) — Supabase Storage just stores whatever bytes it's given and
// serves them back unchanged. Without this, a provider uploading a
// straight-off-the-phone photo (often several MB, sometimes 3000px+ wide)
// ships that exact file to every visitor's portfolio-grid thumbnail.
//
// compressImageFile re-encodes the photo, client-side, before it ever
// reaches uploadProviderPhoto: downscaled to a sane max dimension and
// re-encoded as WebP (falling back to JPEG on the rare browser that can't
// encode WebP via canvas — mainly older Safari).

const MAX_DIMENSION = 1600; // portfolio photos are never displayed larger than this
const WEBP_QUALITY = 0.8;

function canEncodeWebP() {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

// Resolves to a new File (WebP or JPEG) ready to upload. Falls back to the
// original file untouched if it isn't an image, or if anything about the
// decode/encode step fails — a failed "optimization" should never block a
// provider from uploading their photo.
export async function compressImageFile(file, { maxDimension = MAX_DIMENSION, quality = WEBP_QUALITY } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const outputType = canEncodeWebP() ? "image/webp" : "image/jpeg";
    const ext = outputType === "image/webp" ? "webp" : "jpg";

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, quality));
    if (!blob) return file;

    // Skip the swap if it didn't actually help (tiny source images, or a
    // format canvas re-encodes larger than the original).
    if (blob.size >= file.size) return file;

    const newName = file.name ? file.name.replace(/\.[^.]+$/, "") + "." + ext : `photo.${ext}`;
    return new File([blob], newName, { type: outputType });
  } catch (err) {
    console.error("Image compression skipped:", err);
    return file;
  }
}
