/* eslint-disable */
// Build step (runs after `react-scripts build`): writes plain, fast HTML
// pages Google can read without running the app, plus sitemap.xml and
// robots.txt.
//
//   /b/<business>/            one page per live business (services, prices,
//                             area, reviews) with a "Book now" button
//   /<category>/              e.g. /barbers  — "Barbers in Belize"
//   /<category>/<place>/      e.g. /massage/cayo — only where a business
//                             actually is (no empty doorway pages)
//
// Data comes from the same public (anon) API the app uses. If it can't be
// reached, the build still succeeds with just the category pages.
const fs = require("fs");
const path = require("path");
const { makeShareImage } = require("./share-image");

const SITE = "https://vaibook.bz";
const SUPABASE_URL = "https://nvfpdkpzrtpmvmgzvdca.supabase.co";
const ANON = "sb_publishable_zpAA2Gdcm_BJhu1D56tsTw_sBpZXiNA";
const OUT = path.join(__dirname, "..", "build");

// Towns people actually search for, by district — used in page text so a
// search like "barbers in San Pedro Belize" matches the right page.
const DISTRICT_TOWNS = {
  "Belize City": ["Belize City", "San Pedro", "Ambergris Caye", "Caye Caulker", "Ladyville", "Burrell Boom"],
  Cayo: ["San Ignacio", "Santa Elena", "Belmopan", "Benque Viejo", "Spanish Lookout", "Bullet Tree"],
  Corozal: ["Corozal Town", "Sarteneja", "Consejo"],
  "Orange Walk": ["Orange Walk Town", "San Estevan", "Shipyard"],
  "Stann Creek": ["Dangriga", "Hopkins", "Placencia", "Independence"],
  Toledo: ["Punta Gorda", "San Antonio", "Big Falls"],
};

const CATEGORIES = [
  ["barbers", "Barbers", "Barber", "Barbershops and barbers — fades, cuts, beard trims and line-ups."],
  ["hair-salons", "Hair Salons", "Hair Salon", "Hair salons for colour, cuts, braids, treatments and styling."],
  ["nail-techs", "Nail Techs", "Nail Tech", "Nail techs for manicures, pedicures, gel, acrylics and nail art."],
  ["spas", "Spas", "Spa", "Day spas for full-body relaxation, wraps and packages."],
  ["med-spas", "Med Spas", "Med Spa / Clinic", "Med spas and clinics for injectables, skin treatments and aesthetic care."],
  ["massage", "Massage", "Massage", "Massage therapists — deep tissue, Swedish, sports and lymphatic drainage."],
  ["skincare-facials", "Skincare & Facials", "Skincare Studio", "Facials, cleanses, peels and skincare treatments."],
  ["hair-removal", "Hair Removal", "Hair Removal Studio", "Waxing, threading and laser hair removal."],
  ["tattoo-piercing", "Tattoo & Piercing", "Tattoo & Piercing Studio", "Tattoo artists and piercing studios."],
  ["wellness", "Wellness Centers", "Wellness Center", "Wellness and recovery — saunas, holistic care and more."],
  ["pet-grooming", "Pet Grooming", "Pet Grooming", "Pet groomers for baths, cuts and nail trims for all breeds."],
  ["fitness-recovery", "Fitness & Recovery", "Fitness & Recovery", "Personal training, classes, infrared sauna and recovery."],
  ["physical-therapy", "Physical Therapy", "Physical Therapy", "Physical therapy, rehab and mobility work."],
  ["photography", "Photography", "Photography", "Photographers for shoots, portraits and events."],
];

const KEYWORD_CATS = [
  ["barbers", /\b(fade|barber|line.?up|beard)\b/], ["hair-salons", /\b(braid|colou?r|blowout|keratin|hair ?cut|silk press|locs?)\b/],
  ["nail-techs", /\b(mani|pedi|nail|gel|acrylic)/], ["massage", /massage|lymphatic|cupping/],
  ["skincare-facials", /facial|peel|skin ?care|dermaplan/], ["hair-removal", /wax|thread|laser hair/],
  ["wellness", /sauna|cold plunge|float|reiki|meditation/], ["fitness-recovery", /sauna|cold plunge|recovery|personal training|stretch/],
  ["spas", /\bspa\b|body wrap|scrub/], ["pet-grooming", /\b(dog|cat|pet)\b/], ["photography", /photo ?shoot|portrait|headshot/],
];
const slugify = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => `BZ$${Number(n || 0).toFixed(Number(n) % 1 ? 2 : 0)}`;

async function api(pathQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathQuery}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`${res.status} ${pathQuery}`);
  return res.json();
}

function categoryFor(serviceType) {
  const st = String(serviceType || "").toLowerCase();
  return CATEGORIES.find((c) => c[2].toLowerCase() === st) || CATEGORIES.find((c) => st.includes(c[1].toLowerCase().split(" ")[0])) || null;
}

const CSS = `
:root{--ink:#16181D;--muted:#5D6472;--brand:#4C3DC4;--soft:#EEECFC;--line:#E7E5EF;--bg:#FAF9FE}
*{box-sizing:border-box}body{margin:0;font-family:'Plus Jakarta Sans',system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
a{color:var(--brand)}header{background:#fff;border-bottom:1px solid var(--line)}
.wrap{max-width:860px;margin:0 auto;padding:0 18px}
.top{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-weight:800;font-size:20px;text-decoration:none;color:var(--ink)}.logo span{color:var(--brand)}
.btn{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;padding:12px 18px}
.btn.ghost{background:#fff;color:var(--brand);border:1px solid var(--line)}
h1{font-size:clamp(26px,6vw,38px);line-height:1.15;margin:28px 0 8px;letter-spacing:-.02em}
.lead{color:var(--muted);font-size:17px;margin:0 0 22px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;margin:0 0 14px}
.card h2,.card h3{margin:0 0 4px;font-size:19px}.meta{color:var(--muted);font-size:14px}
.svc{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.svc:first-of-type{border-top:0}.svc b{white-space:nowrap}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 22px}.chips a{background:#fff;border:1px solid var(--line);border-radius:999px;padding:7px 12px;text-decoration:none;font-size:14px}
.stars{color:#E8A400;font-weight:700}
footer{color:var(--muted);font-size:13px;padding:30px 0 40px;border-top:1px solid var(--line);margin-top:30px}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
`;

function page({ urlPath, title, description, body, jsonld, ogImage, noindex }) {
  const url = `${SITE}${urlPath}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">${noindex ? '\n<meta name="robots" content="noindex,follow">' : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="VaiBook">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${esc(ogImage || SITE + "/og-vaibook.jpg")}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#4C3DC4">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
${(jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head><body>
<header><div class="wrap top"><a class="logo" href="/">vai<span>book</span></a><a class="btn ghost" href="/#providers">List your business</a></div></header>
<main class="wrap">${body}</main>
<footer class="wrap">VaiBook — book local services across Belize, online, 24/7. <a href="/">vaibook.bz</a></footer>
</body></html>`;
}

// Business pages are the real app (so a shared link opens straight into
// booking) with that business's own title, description and photo in the
// head — what WhatsApp, Facebook and Google read — plus a plain-text copy
// of the page for anything that doesn't run JavaScript.
function appShell({ urlPath, title, description, shareTitle, shareDescription, ogImage, jsonld, body }) {
  const shell = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
  const url = `${SITE}${urlPath}`;
  let head = shell
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta[^>]+name="(description|twitter:card)"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<link[^>]+rel="canonical"[^>]*>/gi, "")
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/i, `<noscript><main style="max-width:760px;margin:0 auto;padding:18px;font-family:system-ui,sans-serif">${body}</main></noscript>`);
  const tags = `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="VaiBook">
<meta property="og:title" content="${esc(shareTitle)}"><meta property="og:description" content="${esc(shareDescription)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
${(jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("")}`;
  // Right after <meta charset> (browsers want it in the first bytes).
  return /<meta charset="utf-8"\/?>/i.test(head)
    ? head.replace(/(<meta charset="utf-8"\/?>)/i, `$1${tags}`)
    : head.replace(/<head>/i, `<head>${tags}`);
}

function write(urlPath, html) {
  const dir = path.join(OUT, urlPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

function businessCard(p, withLink = true) {
  const svcs = (p.services || []).filter((s) => s.is_active !== false && !s.is_addon).slice(0, 6);
  const rating = p._rating;
  return `<div class="card">
<h3>${withLink ? `<a href="/b/${esc(p.slug)}/">${esc(p.business_name)}</a>` : esc(p.business_name)}</h3>
<div class="meta">${esc(p.service_type || "")}${p.district ? ` · ${esc(p.location_label || p.district)}, Belize` : ""}${rating ? ` · <span class="stars">★ ${rating.avg.toFixed(1)}</span> (${rating.count})` : ""}</div>
${svcs.length ? `<div style="margin-top:10px">${svcs.map((s) => `<div class="svc"><span>${esc(s.name)} <span class="meta">· ${esc(s.duration_min)} min</span></span><b>${money(s.price)}</b></div>`).join("")}</div>` : ""}
<div class="row"><a class="btn" href="/#book-${esc(p.slug || p.id)}">Book now</a>${withLink ? `<a class="btn ghost" href="/b/${esc(p.slug)}/">See details</a>` : ""}</div>
</div>`;
}

async function main() {
  if (!fs.existsSync(OUT)) { console.log("seo-pages: no build folder, skipping"); return; }
  let providers = [];
  try {
    providers = process.env.SEO_DATA ? JSON.parse(fs.readFileSync(process.env.SEO_DATA, "utf8")) : await api("provider_profiles?select=id,slug,business_name,service_type,district,location_label,bio,profile_photo_url,whatsapp,services(name,price,duration_min,is_active,is_addon),reviews(rating)&is_active=eq.true");
    providers = providers.filter((p) => p.slug && (p.services || []).some((s) => s.is_active !== false));
    for (const p of providers) {
      const rs = (p.reviews || []).map((r) => Number(r.rating)).filter((x) => x > 0);
      p._rating = rs.length ? { avg: rs.reduce((a, b) => a + b, 0) / rs.length, count: rs.length } : null;
      p._cat = categoryFor(p.service_type);
      // Also list a business under other categories its services clearly
      // belong to (e.g. a massage studio with an infrared sauna shows up
      // for "wellness" and "recovery" searches too).
      const names = (p.services || []).filter((s) => s.is_active !== false && !s.is_addon).map((s) => s.name.toLowerCase()).join(" | ");
      p._cats = new Set([p._cat && p._cat[0]].filter(Boolean));
      for (const [slug, re] of KEYWORD_CATS) if (re.test(names)) p._cats.add(slug);
    }
  } catch (e) {
    console.warn("seo-pages: could not load businesses —", e.message);
  }

  const urls = [{ loc: "/", pri: "1.0" }];

  // Business pages
  for (const p of providers) {
    const area = p.location_label || p.district || "Belize";
    const towns = DISTRICT_TOWNS[p.district] || [];
    const svcs = (p.services || []).filter((s) => s.is_active !== false && !s.is_addon);
    const title = `${p.business_name} — ${p.service_type || "Book online"} in ${area}, Belize | VaiBook`;
    const description = `Book ${p.business_name} online in ${area}, Belize: ${svcs.slice(0, 4).map((s) => `${s.name} ${money(s.price)}`).join(", ")}. See prices and open times and book in seconds on VaiBook.`;
    const ld = {
      "@context": "https://schema.org", "@type": "LocalBusiness", name: p.business_name,
      url: `${SITE}/b/${p.slug}/`, image: p.profile_photo_url || undefined,
      description: (p.bio || "").trim() || undefined,
      address: { "@type": "PostalAddress", addressLocality: p.location_label || p.district || undefined, addressRegion: p.district || undefined, addressCountry: "BZ" },
      telephone: p.whatsapp || undefined,
      aggregateRating: p._rating ? { "@type": "AggregateRating", ratingValue: p._rating.avg.toFixed(1), reviewCount: p._rating.count } : undefined,
      hasOfferCatalog: { "@type": "OfferCatalog", name: "Services", itemListElement: svcs.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.name }, price: Number(s.price || 0), priceCurrency: "BZD" })) },
      potentialAction: { "@type": "ReserveAction", target: `${SITE}/#book-${p.slug}` },
    };
    const body = `<h1>${esc(p.business_name)}</h1>
<p class="lead">${esc(p.service_type || "")} in ${esc(area)}, Belize${towns.length ? ` — serving ${esc(towns.slice(0, 4).join(", "))}` : ""}. Book online any time on VaiBook.</p>
${p.bio && p.bio.trim() ? `<p>${esc(p.bio.trim())}</p>` : ""}
${businessCard(p, false)}
${p._cat ? `<p>More <a href="/${p._cat[0]}/">${esc(p._cat[1].toLowerCase())} in Belize</a>${p.district ? ` · <a href="/${p._cat[0]}/${slugify(p.district)}/">${esc(p._cat[1].toLowerCase())} in ${esc(p.district)}</a>` : ""}</p>` : ""}`;
    const priceLine = svcs.slice(0, 3).map((s) => `${s.name} ${money(s.price)}`).join(" · ");
    // Branded share picture: their photo + VaiBook purple panel.
    let shareImg = p.profile_photo_url || `${SITE}/og-vaibook.jpg`;
    try {
      const prices = svcs.map((s) => Number(s.price)).filter((x) => x > 0);
      const ok = await makeShareImage({
        name: p.business_name, kind: p.service_type, area: `${area}, Belize`, rating: p._rating,
        fromPrice: prices.length ? Math.min(...prices) : null, photo: process.env.SEO_PHOTO || p.profile_photo_url,
      }, path.join(OUT, "b", p.slug, "share.jpg"));
      if (ok) shareImg = `${SITE}/b/${p.slug}/share.jpg?v=${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    } catch (e) { console.warn("seo-pages: share image failed for", p.slug, "—", e.message); }
    write(`/b/${p.slug}`, appShell({
      urlPath: `/b/${p.slug}/`, title, description, body, jsonld: [ld],
      shareTitle: `Book ${p.business_name} on VaiBook`,
      shareDescription: `${p.service_type || "Self-care"} in ${area}, Belize${p._rating ? ` · ★ ${p._rating.avg.toFixed(1)}` : ""}. ${priceLine}${svcs.length > 3 ? " and more" : ""}. Tap to see open times and book.`,
      ogImage: shareImg,
    }));
    urls.push({ loc: `/b/${p.slug}/`, pri: "0.9" });
  }

  // Category pages (all) + category × district pages (only where businesses are)
  for (const [cslug, cname, cname2, cdesc] of CATEGORIES) {
    const inCat = providers.filter((p) => p._cats && p._cats.has(cslug));
    const districts = [...new Set(inCat.map((p) => p.district).filter(Boolean))];
    const title = `${cname} in Belize — Book Online | VaiBook`;
    const description = `Find and book ${cname.toLowerCase()} in Belize on VaiBook — ${Object.values(DISTRICT_TOWNS).flat().slice(0, 6).join(", ")} and across all 6 districts. See prices and open times, book 24/7.`;
    const body = `<h1>${esc(cname)} in Belize</h1>
<p class="lead">${esc(cdesc)} Compare prices, see open times and book online in seconds — no calls, no waiting.</p>
${districts.length ? `<div class="chips">${districts.map((d) => `<a href="/${cslug}/${slugify(d)}/">${esc(cname)} in ${esc(d)}</a>`).join("")}</div>` : ""}
${inCat.length ? inCat.map((p) => businessCard(p)).join("") : `<div class="card"><h3>New businesses are joining every week</h3><p class="meta">Run a ${esc(cname2.toLowerCase())} business in Belize? Get your own booking page on VaiBook — free to start.</p><div class="row"><a class="btn" href="/#providers">List your business</a><a class="btn ghost" href="/">Browse all services</a></div></div>`}
<p class="meta">VaiBook covers ${Object.keys(DISTRICT_TOWNS).join(", ")} districts, including ${esc(Object.values(DISTRICT_TOWNS).flat().join(", "))}.</p>`;
    write(`/${cslug}`, page({ urlPath: `/${cslug}/`, title, description, body, jsonld: [{ "@context": "https://schema.org", "@type": "ItemList", name: `${cname} in Belize`, itemListElement: inCat.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/b/${p.slug}/`, name: p.business_name })) }], noindex: !inCat.length }));
    // Empty categories stay out of Google until a business joins (thin
    // pages hurt the whole site); the next deploy lists them automatically.
    if (inCat.length) urls.push({ loc: `/${cslug}/`, pri: "0.8" });

    for (const d of districts) {
      const here = inCat.filter((p) => p.district === d);
      const towns = DISTRICT_TOWNS[d] || [d];
      const dslug = slugify(d);
      const t2 = `${cname} in ${d}, Belize (${towns.slice(0, 3).join(", ")}) — Book Online | VaiBook`;
      const d2 = `Book ${cname.toLowerCase()} in ${towns.join(", ")}, Belize. ${here.length} on VaiBook — see prices and open times and book online 24/7.`;
      const b2 = `<h1>${esc(cname)} in ${esc(d)}, Belize</h1>
<p class="lead">${esc(cname)} serving ${esc(towns.join(", "))}. Book online on VaiBook.</p>
${here.map((p) => businessCard(p)).join("")}
<p><a href="/${cslug}/">All ${esc(cname.toLowerCase())} in Belize</a></p>`;
      write(`/${cslug}/${dslug}`, page({ urlPath: `/${cslug}/${dslug}/`, title: t2, description: d2, body: b2 }));
      urls.push({ loc: `/${cslug}/${dslug}/`, pri: "0.8" });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join("\n")}
</urlset>
`);
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
  console.log(`seo-pages: ${providers.length} business page(s), ${urls.length} URLs in sitemap`);
}

main().catch((e) => { console.warn("seo-pages failed (build continues):", e.message); });
