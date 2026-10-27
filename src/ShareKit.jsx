// Share kit for one business: share the booking page like an Instagram
// profile link, download its QR code, and download / print a ready-made
// "Scan to book" poster. Everything is drawn locally on a canvas (the QR
// comes from the `qrcode` package), so downloads never depend on another
// website and the canvas is never blocked by cross-site image rules.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

const INDIGO = "#4C3DC4";
const INDIGO_DARK = "#2E2380";
const NAVY = "#152E59";
const INK = "#16181D";
const MUTED = "#6C7281";
const PAGE = "#FAF8F5";
const SOFT = "#EEECFC";
const FONT = "'Plus Jakarta Sans', Arial, sans-serif";

const W = 1240; // A4 portrait at 150 dpi
const H = 1754;

const TEXT = {
  en: {
    title: "Share your page",
    sub: "Send it like an Instagram profile, or print the poster for your counter.",
    share: "Share…",
    copy: "Copy link",
    copied: "Copied ✓",
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    instagram: "Instagram",
    igHint: "Link copied. On Instagram, paste it in your bio (Edit profile → Links) or add it to a Story with the Link sticker.",
    qrTitle: "QR code",
    qrDownload: "Download QR",
    posterTitle: "“Scan to book” poster",
    posterDownload: "Download poster",
    posterPrint: "Print",
    preparing: "Preparing…",
    scanToBook: "SCAN TO BOOK",
    pointCamera: "Point your phone camera here",
    bookOnline: "Book your next visit online — any time, in seconds.",
    shareText: (name) => `Book with ${name} on VaiBook:`,
  },
  es: {
    title: "Comparte tu página",
    sub: "Envíala como un perfil de Instagram o imprime el póster para tu mostrador.",
    share: "Compartir…",
    copy: "Copiar enlace",
    copied: "Copiado ✓",
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    instagram: "Instagram",
    igHint: "Enlace copiado. En Instagram, pégalo en tu biografía (Editar perfil → Enlaces) o agrégalo a una Historia con el sticker de Enlace.",
    qrTitle: "Código QR",
    qrDownload: "Descargar QR",
    posterTitle: "Póster “Escanea para reservar”",
    posterDownload: "Descargar póster",
    posterPrint: "Imprimir",
    preparing: "Preparando…",
    scanToBook: "ESCANEA PARA RESERVAR",
    pointCamera: "Apunta la cámara de tu teléfono aquí",
    bookOnline: "Reserva tu próxima visita en línea — a cualquier hora, en segundos.",
    shareText: (name) => `Reserva con ${name} en VaiBook:`,
  },
};

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFont(ctx, text, maxWidth, start, min, weight) {
  let size = start;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

function slugify(name) {
  return String(name || "vaibook").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vaibook";
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

async function drawQrCanvas(url, size) {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, url, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: INK, light: "#FFFFFF" } });
  return c;
}

// Square QR card: QR plus the business name under it.
async function buildQrImage({ url, businessName }) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size; c.height = size + 150;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, c.width, c.height);
  const qr = await drawQrCanvas(url, size - 80);
  ctx.drawImage(qr, 40, 40);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  fitFont(ctx, businessName || "VaiBook", size - 120, 64, 32, 800);
  ctx.fillText(businessName || "VaiBook", size / 2, size + 40);
  ctx.fillStyle = MUTED;
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText("vaibook", size / 2, size + 100);
  return c;
}

async function buildPoster({ url, businessName, subtitle, photoUrl, t }) {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* ignore */ } }
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Page
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, W, H);

  // Top band
  const grad = ctx.createLinearGradient(0, 0, W, 360);
  grad.addColorStop(0, INDIGO);
  grad.addColorStop(1, INDIGO_DARK);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 360);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath(); ctx.arc(W - 120, 60, 220, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(80, 330, 140, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  fitFont(ctx, t.scanToBook, W - 160, 110, 60, 800);
  ctx.fillText(t.scanToBook, W / 2, 200);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(t.pointCamera, W / 2, 270);

  // Photo / initials circle overlapping the band
  const cy = 440, r = 110;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.arc(W / 2, cy, r + 10, 0, Math.PI * 2); ctx.fill();
  const photo = await loadImage(photoUrl);
  ctx.save();
  ctx.beginPath(); ctx.arc(W / 2, cy, r, 0, Math.PI * 2); ctx.clip();
  if (photo) {
    const s = Math.max((2 * r) / photo.width, (2 * r) / photo.height);
    const pw = photo.width * s, ph = photo.height * s;
    ctx.drawImage(photo, W / 2 - pw / 2, cy - ph / 2, pw, ph);
  } else {
    ctx.fillStyle = SOFT;
    ctx.fillRect(W / 2 - r, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = INDIGO;
    ctx.font = `800 84px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(initials(businessName), W / 2, cy + 4);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();

  // Business name + subtitle
  ctx.fillStyle = NAVY;
  fitFont(ctx, businessName || "VaiBook", W - 160, 92, 48, 800);
  ctx.fillText(businessName || "VaiBook", W / 2, 640);
  if (subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText(subtitle, W / 2, 700);
  }

  // QR card
  const qrSize = 640;
  const cardX = (W - (qrSize + 80)) / 2, cardY = 760, cardW = qrSize + 80, cardH = qrSize + 80;
  ctx.shadowColor = "rgba(23,20,31,0.12)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, cardX, cardY, cardW, cardH, 48);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 6;
  ctx.strokeStyle = INDIGO;
  roundRect(ctx, cardX, cardY, cardW, cardH, 48);
  ctx.stroke();
  const qr = await drawQrCanvas(url, qrSize);
  ctx.drawImage(qr, cardX + 40, cardY + 40, qrSize, qrSize);

  // Footer copy
  ctx.fillStyle = INK;
  ctx.font = `600 38px ${FONT}`;
  const lines = [];
  const words = t.bookOnline.split(" ");
  let line = "";
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > W - 220) { lines.push(line); line = w; } else { line = test; }
  });
  if (line) lines.push(line);
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, 1560 + i * 50));

  // Brand mark
  const by = 1690;
  ctx.font = `500 46px ${FONT}`;
  const vai = "vai", book = "book";
  const wv = ctx.measureText(vai).width, wb = ctx.measureText(book).width;
  const startX = W / 2 - (wv + wb) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = INK; ctx.fillText(vai, startX, by);
  ctx.fillStyle = INDIGO; ctx.fillText(book, startX + wv, by);
  ctx.textAlign = "center";
  return c;
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }, "image/png");
}

function printCanvas(canvas, title) {
  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (!win) { downloadCanvas(canvas, `${slugify(title)}-poster.png`); return; }
  win.document.write(`<!doctype html><html><head><title>${String(title || "Poster").replace(/</g, "")}</title><style>@page{size:A4;margin:0}html,body{margin:0;padding:0}img{width:100%;height:auto;display:block}</style></head><body><img src="${dataUrl}" onload="setTimeout(function(){window.print()},300)"></body></html>`);
  win.document.close();
}

export default function ShareKit({ businessName, bookingUrl, photoUrl, subtitle, lang }) {
  const t = TEXT[(lang || "en").toLowerCase().startsWith("es") ? "es" : "en"];
  const [copied, setCopied] = useState(false);
  const [igNote, setIgNote] = useState(false);
  const [qrSrc, setQrSrc] = useState(null);
  const [posterSrc, setPosterSrc] = useState(null);
  const qrCanvas = useRef(null);
  const posterCanvas = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = await buildQrImage({ url: bookingUrl, businessName });
        if (cancelled) return;
        qrCanvas.current = q;
        setQrSrc(q.toDataURL("image/png"));
        const p = await buildPoster({ url: bookingUrl, businessName, subtitle, photoUrl, t });
        if (cancelled) return;
        posterCanvas.current = p;
        try { setPosterSrc(p.toDataURL("image/jpeg", 0.85)); } catch (e) {
          // A photo without permission to be reused taints the canvas; redraw without it.
          const p2 = await buildPoster({ url: bookingUrl, businessName, subtitle, photoUrl: null, t });
          if (cancelled) return;
          posterCanvas.current = p2;
          setPosterSrc(p2.toDataURL("image/jpeg", 0.85));
        }
      } catch (e) { /* leave previews empty */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [bookingUrl, businessName, photoUrl, subtitle, lang]);

  const shareText = t.shareText(businessName || "us");
  const copy = async () => {
    try { await navigator.clipboard.writeText(bookingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); return true; } catch (e) { return false; }
  };
  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: businessName, text: shareText, url: bookingUrl }); } catch (e) { /* cancelled */ }
    } else {
      copy();
    }
  };
  const instagram = async () => {
    await copy();
    setIgNote(true);
  };
  const slug = slugify(businessName);

  return (
    <div className="sk">
      <h3 className="sk-title">{t.title}</h3>
      <p className="sk-sub">{t.sub}</p>

      <div className="sk-profile">
        <div className="sk-avatar" style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}>{!photoUrl && initials(businessName)}</div>
        <div className="sk-profile-text">
          <div className="sk-name">{businessName}</div>
          {subtitle && <div className="sk-meta">{subtitle}</div>}
          <div className="sk-url">{bookingUrl.replace(/^https?:\/\//, "")}</div>
        </div>
      </div>

      <div className="sk-buttons">
        <button className="sk-btn sk-btn-primary" onClick={nativeShare}>📤 {t.share}</button>
        <button className="sk-btn" onClick={copy}>{copied ? t.copied : `🔗 ${t.copy}`}</button>
        <a className="sk-btn" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${bookingUrl}`)}`} target="_blank" rel="noreferrer">💬 {t.whatsapp}</a>
        <a className="sk-btn" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(bookingUrl)}`} target="_blank" rel="noreferrer">📘 {t.facebook}</a>
        <button className="sk-btn" onClick={instagram}>📸 {t.instagram}</button>
      </div>
      {igNote && <p className="sk-note">{t.igHint}</p>}

      <div className="sk-grid">
        <div className="sk-panel">
          <div className="sk-panel-title">{t.qrTitle}</div>
          <div className="sk-qr">{qrSrc ? <img src={qrSrc} alt="QR" /> : <span>{t.preparing}</span>}</div>
          <button className="sk-btn" disabled={!qrSrc} onClick={() => qrCanvas.current && downloadCanvas(qrCanvas.current, `${slug}-qr.png`)}>⬇️ {t.qrDownload}</button>
        </div>
        <div className="sk-panel">
          <div className="sk-panel-title">{t.posterTitle}</div>
          <div className="sk-poster">{posterSrc ? <img src={posterSrc} alt="Poster" /> : <span>{t.preparing}</span>}</div>
          <div className="sk-row">
            <button className="sk-btn sk-btn-primary" disabled={!posterSrc} onClick={() => posterCanvas.current && downloadCanvas(posterCanvas.current, `${slug}-scan-to-book-poster.png`)}>⬇️ {t.posterDownload}</button>
            <button className="sk-btn" disabled={!posterSrc} onClick={() => posterCanvas.current && printCanvas(posterCanvas.current, businessName)}>🖨️ {t.posterPrint}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
