import { useEffect, useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { useTranslation } from "react-i18next";
import { cropImageToFile } from "./imageUtils";

// ── PROFILE PHOTO MODAL — forced 1:1 crop before upload ─────────────────
//
// Opens the moment a provider picks a file for their single profile
// photo (the Public Profile tab's photo box). react-easy-crop handles the
// interactive drag/zoom UI only; the actual pixel crop + resize + WebP
// re-encode happens via cropImageToFile (imageUtils.js) — the same
// canvas-based approach compressImageFile already uses elsewhere in this
// app for the portfolio gallery. No next/image, no server-side transform
// layer here (this isn't Next.js), so the crop has to be finished
// client-side before the result ever reaches uploadProviderPhoto.
//
// Light-themed (white modal over the app's existing .modal-overlay
// backdrop) to match ProviderPortal's own UI — unlike
// ProviderSignupModal.jsx, which is dark on purpose because it's part of
// the separate marketing funnel.
export default function ProfilePhotoModal({ open, file, onClose, onSave, saving, error }) {
  const { t } = useTranslation();
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Fresh image per file, and a fresh crop/zoom state every time the modal
  // opens — a stale crop from a previous photo should never carry over.
  //
  // Deliberately a data: URL (FileReader.readAsDataURL), not a blob: URL
  // (URL.createObjectURL) — this site's CSP (vercel.json) locks img-src
  // down to 'self' data: plus the specific hosts it actually needs
  // (Supabase storage, map tiles, the QR service) and does not include
  // blob:. A blob: URL here gets silently dropped by the browser: no
  // image renders, nothing can be cropped, and cropImageToFile's own
  // image load (same CSP, same reason) never resolves either. data: is
  // already on the allowlist, so this needs no CSP change.
  useEffect(() => {
    if (!open || !file) {
      setImageSrc(null);
      return;
    }
    let cancelled = false;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled) setImageSrc(reader.result);
    };
    reader.readAsDataURL(file);
    return () => { cancelled = true; };
  }, [open, file]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  if (!open) return null;

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels || saving) return;
    const cropped = await cropImageToFile(imageSrc, croppedAreaPixels, { fileName: "profile-photo" });
    if (cropped) onSave(cropped);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="ppm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ppm-title"
      >
        <h3 id="ppm-title" className="ppm-title">{t("providerPortal.profile.photoModalTitle")}</h3>
        <p className="ppm-hint">{t("providerPortal.profile.photoModalHint")}</p>

        <div className="ppm-crop-area">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          )}
        </div>

        <div className="ppm-zoom-row">
          <span className="ppm-zoom-label">{t("providerPortal.profile.zoom")}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t("providerPortal.profile.zoom")}
          />
        </div>

        {error && <p className="ppm-error">{error}</p>}

        <div className="ppm-actions">
          <button className="btn-sm ghost" onClick={onClose} disabled={saving}>
            {t("providerPortal.common.cancel")}
          </button>
          <button className="btn-sm forest" onClick={handleSave} disabled={saving || !croppedAreaPixels}>
            {saving ? t("providerPortal.common.saving") : t("providerPortal.common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
