/* eslint-disable */
// Makes the picture WhatsApp/Facebook show when a business's link is shared:
// their photo on the left, a VaiBook-purple panel with the VaiBook logo,
// business name, area, rating and starting price on the right. 1200×630 JPEG.
const fs = require("fs");
const path = require("path");

let satori, sharp;
try {
  satori = require("satori");
  satori = satori.default || satori;
  sharp = require("sharp");
} catch (e) {
  satori = null;
}

const FONT_DIR = path.join(__dirname, "fonts");
const fonts = () => [500, 700, 800].map((w) => ({
  name: "Jakarta", weight: w, style: "normal",
  data: fs.readFileSync(path.join(FONT_DIR, `plus-jakarta-sans-latin-${w}-normal.woff`)),
}));

const h = (type, style, children) => ({ type, props: { style, children } });

async function photoDataUri(src) {
  let buf;
  if (!src) return null;
  if (/^https?:/.test(src)) {
    const res = await fetch(src);
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    buf = fs.readFileSync(src);
  }
  const out = await sharp(buf).resize(630, 630, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

// biz: { name, kind, area, rating: {avg,count}|null, fromPrice, photo }
async function makeShareImage(biz, outFile) {
  if (!satori || !sharp) return false;
  const photo = await photoDataUri(biz.photo).catch(() => null);
  const left = photo
    ? { type: "img", props: { src: photo, width: 630, height: 630, style: { width: 630, height: 630, objectFit: "cover" } } }
    : h("div", { width: 630, height: 630, display: "flex", alignItems: "center", justifyContent: "center", background: "#EEECFC", color: "#4C3DC4", fontSize: 120, fontWeight: 800 }, (biz.name || "?").slice(0, 1).toUpperCase());

  const nameSize = biz.name.length > 22 ? 46 : biz.name.length > 14 ? 54 : 62;
  const metaBits = [biz.kind, biz.area].filter(Boolean).join(" · ");
  const tree = h("div", { width: 1200, height: 630, display: "flex", fontFamily: "Jakarta", background: "#4C3DC4" }, [
    left,
    h("div", { width: 570, height: 630, display: "flex", flexDirection: "column", padding: "52px 52px 48px", background: "#4C3DC4", color: "#FFFFFF" }, [
      h("div", { display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }, [
        h("span", { color: "#FFFFFF" }, "vai"),
        h("span", { color: "#CFC8FF" }, "book"),
      ]),
      h("div", { display: "flex", flexDirection: "column", marginTop: "auto" }, [
        h("div", { fontSize: nameSize, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }, biz.name),
        metaBits ? h("div", { fontSize: 26, fontWeight: 500, color: "#DCD7FF", marginTop: 16 }, metaBits) : null,
        h("div", { display: "flex", gap: 14, marginTop: 22 }, [
          biz.rating ? h("div", { display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.14)", borderRadius: 999, padding: "8px 18px", fontSize: 24, fontWeight: 700 }, [
            { type: "svg", props: { width: 24, height: 24, viewBox: "0 0 24 24", children: { type: "path", props: { d: "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z", fill: "#FFC94D" } } } },
            h("span", {}, biz.rating.avg.toFixed(1)),
          ]) : null,
          biz.fromPrice ? h("div", { display: "flex", background: "rgba(255,255,255,0.14)", borderRadius: 999, padding: "8px 18px", fontSize: 24, fontWeight: 700 }, `From BZ$${biz.fromPrice}`) : null,
        ].filter(Boolean)),
      ].filter(Boolean)),
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40, background: "#FFFFFF", color: "#4C3DC4", borderRadius: 18, padding: "20px 26px", fontSize: 28, fontWeight: 800 }, [
        h("span", {}, "Book online"),
        h("span", { fontSize: 22, fontWeight: 700, color: "#6C5CE7" }, "vaibook.bz"),
      ]),
    ]),
  ]);

  const svg = await satori(tree, { width: 1200, height: 630, fonts: fonts() });
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, jpg);
  return true;
}

module.exports = { makeShareImage };
