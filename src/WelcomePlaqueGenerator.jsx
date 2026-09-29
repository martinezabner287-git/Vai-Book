// "Elite Welcome" launch graphic — a 1080x1080 Canvas-drawn square, ready
// for Instagram, generated automatically (no design input from the
// provider) the moment they're shown it. Everything on the canvas is drawn
// with plain Canvas primitives — no external images, no network calls —
// so the download always works, never taints the canvas, and never
// depends on anything being reachable at share time.
//
// The QR code is rendered fully offline too, via the `qrcode` package
// straight onto an in-memory canvas, then composited onto the plaque with
// drawImage. That's a deliberate choice over the qrserver.com image API
// used elsewhere in the app (e.g. the dashboard's "Your Shopfront" card):
// loading a *remote* image onto a canvas you intend to export with
// toBlob/toDataURL requires that image to serve proper CORS headers, or
// the canvas becomes "tainted" and the export silently throws. A locally
// generated QR sidesteps that risk entirely for a feature whose whole job
// is producing a downloadable file.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

const SIZE = 1080;
const FOREST = "#0D3D2E";
const FOREST_DARK = "#081F17";
const FOREST_MID = "#3F6B4A";
const FOREST_LIGHT_BAR = "#5C8A68";
const LIME = "#C6F135";
const NEAR_WHITE = "#FAFAF7";
const FONT_STACK = "'Plus Jakarta Sans', Arial, sans-serif";

// Canvas has no built-in text wrapping — this is a plain greedy word-wrap,
// which is all short, all-caps marketing copy needs.
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

// Picks the largest font size (from a descending tier list) that wraps
// `text` into at most `maxLines` lines, so the sub-headline stays the
// biggest thing on the plaque whenever there's room and only shrinks as
// far as it actually needs to. Falls back to the smallest tier (still
// bigger than the "WE'VE UPGRADED" line) if nothing fits in maxLines.
function fitLines(ctx, text, maxWidth, sizes, weight, fontStack, maxLines) {
  let best = null;
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${fontStack}`;
    const lines = wrapText(ctx, text, maxWidth);
    best = { size, lines };
    if (lines.length <= maxLines) return best;
  }
  return best;
}

// Truncates with an ellipsis if `text` doesn't fit in maxWidth at the
// canvas's current font, so an unusually long business name can never push
// past the plaque's edges or collide with anything below it.
function fitOneLine(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The VaiBook mark — three ascending rounded bars — redrawn directly on
// canvas with the same relative geometry and colors as the <VaiBookMark>
// SVG used across the rest of the app, so the brand mark stays crisp at
// full resolution instead of rasterizing/scaling an image.
function drawLogoMark(ctx, cx, topY, scale) {
  const bar = (xOff, yOff, w, h, r, color) => {
    ctx.fillStyle = color;
    roundedRectPath(ctx, cx + xOff * scale, topY + yOff * scale, w * scale, h * scale, r * scale);
    ctx.fill();
  };
  bar(-47, 26, 26, 32, 6, FOREST_MID);
  bar(-16, 2, 26, 56, 6, FOREST_LIGHT_BAR);
  bar(15, -30, 26, 88, 6, LIME);
}

export default function WelcomePlaqueGenerator({ businessName, bookingUrl }) {
  const canvasRef = useRef(null);
  const [showQr, setShowQr] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [renderToken, setRenderToken] = useState(0); // bumps to force a redraw after async QR generation

  useEffect(() => {
    let cancelled = false;

    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // The headline copy is drawn in 'Plus Jakarta Sans', loaded async via
      // a Google Fonts @import elsewhere in the app. If this effect fires
      // before that font has actually finished loading, the canvas would
      // silently measure and draw with the browser's fallback serif/sans
      // metrics instead — wrapping the sub-headline differently than
      // intended and never redrawing once the real font arrives (canvas
      // text doesn't repaint itself on font load the way DOM text does).
      // Waiting on it here keeps the wrap/measure math and the final
      // render in agreement.
      try {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 800)),
          ]);
        }
      } catch (e) {
        // Font Loading API unsupported or errored — draw with whatever's
        // available rather than blocking the graphic entirely.
      }
      if (cancelled) return;

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Background — deep forest gradient, darker toward the bottom.
      const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
      bg.addColorStop(0, FOREST);
      bg.addColorStop(1, FOREST_DARK);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Semi-transparent deep-green vignette overlay for depth — this is
      // the "sophisticated overlay" the brief asks for.
      const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.12, SIZE / 2, SIZE / 2, SIZE * 0.72);
      vignette.addColorStop(0, "rgba(13,61,46,0)");
      vignette.addColorStop(1, "rgba(4,16,12,0.6)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Subtle geometric line pattern — thin diagonal lime hairlines at
      // very low opacity, blending into the dark green rather than
      // competing with the text drawn on top of them.
      ctx.save();
      ctx.strokeStyle = LIME;
      ctx.globalAlpha = 0.05;
      ctx.lineWidth = 1;
      for (let x = -SIZE; x < SIZE * 2; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + SIZE, SIZE);
        ctx.stroke();
      }
      ctx.restore();

      // Elite double neon glow border, inset from the edge.
      const inset = 44;
      ctx.save();
      ctx.strokeStyle = LIME;
      ctx.lineWidth = 2;
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 30;
      ctx.strokeRect(inset, inset, SIZE - inset * 2, SIZE - inset * 2);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(198,241,53,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(inset + 10, inset + 10, SIZE - (inset + 10) * 2, SIZE - (inset + 10) * 2);
      ctx.restore();

      // ---- Dynamic top-down layout. Every block below the logo is
      // positioned from the measured height of the block above it, so
      // nothing can overlap regardless of business-name length or how many
      // lines the fixed headline copy wraps to at whatever font actually
      // ended up loaded. ----
      ctx.textAlign = "center";

      // 1. Logo mark.
      const logoScale = 1.85;
      const logoTopY = 118; // yOff=0 anchor; shape spans logoTopY-55.5 .. logoTopY+107.3
      drawLogoMark(ctx, SIZE / 2, logoTopY, logoScale);
      let cursor = logoTopY + 58 * logoScale + 46; // logo bottom + gap

      // 2. Business name — the personalization. Truncated so an unusually
      // long name can never collide with anything below it.
      const nameSize = 28;
      ctx.font = `600 ${nameSize}px ${FONT_STACK}`;
      const nameBaseline = cursor + nameSize * 0.78;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = NEAR_WHITE;
      const nameText = fitOneLine(ctx, (businessName || "Your Business").toUpperCase(), SIZE - 260);
      ctx.fillText(nameText, SIZE / 2, nameBaseline);
      ctx.restore();
      cursor = nameBaseline + nameSize * 0.3 + 42;

      // 3. "WE'VE UPGRADED." — prominent, white with a soft lime glow, but
      // deliberately smaller than the sub-headline below so that one can
      // legitimately be the "largest" text on the plaque.
      const headSize = 50;
      ctx.font = `800 ${headSize}px ${FONT_STACK}`;
      const headBaseline = cursor + headSize * 0.78;
      ctx.save();
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 16;
      ctx.fillText("WE'VE UPGRADED.", SIZE / 2, headBaseline);
      ctx.restore();
      cursor = headBaseline + headSize * 0.15 + 54;

      // 4. Sub text — the headline. Largest, lime, strongest glow,
      // center-weighted. Auto-sized down only as far as needed to keep it
      // to 2 lines (falls back to more, still laid out safely, if even the
      // smallest tier can't manage that).
      const subMaxWidth = SIZE - 160;
      const { size: subSize, lines: subLines } = fitLines(
        ctx, "BOOKING IS NOW EXCLUSIVELY ON VAIBOOK.", subMaxWidth,
        [84, 78, 72, 66, 60, 54], 800, FONT_STACK, 2
      );
      ctx.font = `800 ${subSize}px ${FONT_STACK}`;
      const subLineHeight = subSize * 1.08;
      const subStartBaseline = cursor + subSize * 0.78;
      ctx.save();
      ctx.fillStyle = LIME;
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 36;
      subLines.forEach((line, i) => ctx.fillText(line, SIZE / 2, subStartBaseline + i * subLineHeight));
      ctx.restore();
      const subEndBaseline = subStartBaseline + (subLines.length - 1) * subLineHeight;
      cursor = subEndBaseline + subSize * 0.2 + 56;

      // 5. Footer — either the plain booking link, or (when toggled) a
      // locally-generated QR code on a white card for scan contrast.
      // Anchored to whatever's left below the sub-headline so it never
      // collides with it, and pulled up (never off the bottom edge) if the
      // header block above ran long.
      const bottomSafe = SIZE - inset - 14; // stay inside the inner border line
      if (showQr && bookingUrl) {
        try {
          const qrSize = 190;
          const pad = 15;
          const qrCanvas = document.createElement("canvas");
          await QRCode.toCanvas(qrCanvas, bookingUrl, {
            width: qrSize,
            margin: 1,
            color: { dark: FOREST, light: "#FFFFFF" },
          });
          if (cancelled) return;
          const cardH = qrSize + pad * 2;
          const totalFooterH = cardH + 30 + 34 + 14;
          const footerTop = Math.min(cursor, bottomSafe - totalFooterH);
          const qrX = SIZE / 2 - qrSize / 2;
          const qrY = footerTop + pad;
          ctx.fillStyle = "#FFFFFF";
          roundedRectPath(ctx, qrX - pad, footerTop, qrSize + pad * 2, cardH, 14);
          ctx.fill();
          ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
          ctx.fillStyle = "rgba(250,239,224,0.8)";
          ctx.font = `600 22px ${FONT_STACK}`;
          ctx.fillText("Scan to book", SIZE / 2, footerTop + cardH + 26);
          ctx.fillStyle = LIME;
          ctx.font = `800 26px ${FONT_STACK}`;
          ctx.fillText("VAIBOOK", SIZE / 2, footerTop + cardH + 26 + 40);
        } catch (e) {
          // QR generation is fully local, so this shouldn't happen — fall
          // back to the plain link text below rather than leave a gap.
          ctx.fillStyle = "rgba(250,239,224,0.7)";
          ctx.font = `600 24px ${FONT_STACK}`;
          ctx.fillText(bookingUrl, SIZE / 2, Math.min(cursor + 30, bottomSafe - 60));
          ctx.fillStyle = LIME;
          ctx.font = `800 26px ${FONT_STACK}`;
          ctx.fillText("VAIBOOK", SIZE / 2, Math.min(cursor + 74, bottomSafe - 16));
        }
      } else {
        // No QR: center the link + wordmark in whatever space remains
        // below the sub-headline, instead of always anchoring hard to the
        // bottom edge (which left a large dead gap when the header block
        // above was short).
        const blockH = 34 + 44;
        const remaining = bottomSafe - cursor;
        const footerTop = cursor + Math.max(0, (remaining - blockH) / 2);
        ctx.fillStyle = "rgba(250,239,224,0.75)";
        ctx.font = `600 24px ${FONT_STACK}`;
        const linkText = fitOneLine(ctx, bookingUrl || "vaibook.bz", SIZE - 200);
        ctx.fillText(linkText, SIZE / 2, footerTop + 24);
        ctx.fillStyle = LIME;
        ctx.font = `800 26px ${FONT_STACK}`;
        ctx.fillText("VAIBOOK", SIZE / 2, footerTop + 24 + 44);
      }
    };

    draw();
    return () => { cancelled = true; };
  }, [businessName, bookingUrl, showQr, renderToken]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    canvas.toBlob((blob) => {
      setDownloading(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(businessName || "vaibook").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "vaibook"}-launch-graphic.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div className="plaque-generator">
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="plaque-canvas" />
      <div className="plaque-actions">
        <button
          className="btn-sm ghost"
          onClick={() => { setShowQr((v) => !v); setRenderToken((t) => t + 1); }}
        >
          {showQr ? "Hide QR Code" : "Show QR Code"}
        </button>
        <button className="btn-sm lime" onClick={handleDownload} disabled={downloading}>
          {downloading ? "Preparing..." : "Download Your Official Launch Graphic"}
        </button>
      </div>
    </div>
  );
}
