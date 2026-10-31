import json, sys, os
# Reuses the portals.py mocks; adds Aluxe-like long service names and staff,
# then checks every screen at small-phone sizes for broken layout.
src = open('portals.py').read().split('PT=[')[0]
exec(src)
from playwright.sync_api import sync_playwright

names = ["Classic Lash Lift", "Korean Lash Lift & Tint", "Brow Lamination", "Brow Map & Shape",
         "Facial", "Teen Acne Facial", "Event Makeup & Bridal Trial Package"]
svcs = [{"id": f"5e7a1111-0000-4000-8000-00000000010{i}", "name": n, "price": 60 + i, "duration_min": 60,
         "duration_minutes": 60, "is_active": True, "provider_id": PID} for i, n in enumerate(names)]
profile.update({"services": svcs, "plan": "business", "business_name": "Aluxe Aesthetics & Skin Studio",
                "location_label": "Grey House with Black Gate, Santa Elena"})
extra['services'] = svcs

PT = ["dashboard", "bookings", "clients", "services", "calendar", "staff", "memberships", "earnings", "review",
      "reviews", "announcements", "agreements", "modules", "profile", "billing", "settings"]
CT = ["home", "browse", "bookings", "favorites", "payments", "profile", "settings"]
AT = ["overview", "pending", "active", "rejected", "providers", "payments", "refunds", "messages", "security"]

CHECK = r'''() => {
  const out = [];
  const vw = window.innerWidth;
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inHScroll = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const floating = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'absolute' || p === 'fixed' || p === 'sticky') return true; } return false; };
  const desc = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '') + ' "' + (el.innerText || el.value || el.placeholder || '').trim().slice(0, 30) + '"');
  // 1) blown-up checkboxes / radios
  document.querySelectorAll('input[type=checkbox], input[type=radio]').forEach((el) => {
    if (!vis(el)) return; const r = el.getBoundingClientRect();
    if (r.width > 32 || r.height > 32) out.push('BIG-CHECKBOX ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' near ' + desc(el.closest('label') || el.parentElement));
  });
  // 2) words stacked letter by letter, and 3) things poking off the screen
  const leaves = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el)) return;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    const isCtl = /^(INPUT|SELECT|TEXTAREA|BUTTON|IMG)$/.test(el.tagName);
    if (own.length || isCtl) leaves.push(el);
    if (own.length) {
      const text = own.map((n) => n.textContent.trim()).join(' ');
      const range = document.createRange(); range.selectNodeContents(own[0]);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const longest = Math.max(...text.split(/\s+/).map((w) => w.length));
      if (lines >= 3 && longest >= 4 && el.getBoundingClientRect().width < longest * 6) out.push('SQUEEZED-TEXT ' + lines + ' lines in ' + Math.round(el.getBoundingClientRect().width) + 'px: ' + desc(el));
    }
    const r = el.getBoundingClientRect();
    if ((own.length || isCtl) && r.right > vw + 2 && !inHScroll(el) && !floating(el)) out.push('OFF-SCREEN right=' + Math.round(r.right) + ' ' + desc(el));
  });
  // 4) text / controls drawn on top of each other
  const L = leaves.filter((el) => !floating(el)).slice(0, 450).map((el) => [el, el.getBoundingClientRect()]);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const [a, ra] = L[i], [b, rb] = L[j];
    if (a.contains(b) || b.contains(a)) continue;
    const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (x <= 3 || y <= 3) continue;
    const small = Math.min(ra.width * ra.height, rb.width * rb.height);
    if (small > 0 && (x * y) / small > 0.35) out.push('OVERLAP ' + desc(a) + ' <> ' + desc(b));
  }
  return [...new Set(out)].slice(0, 12);
}'''

modes = [("320px", {'width': 320, 'height': 700}, None), ("390px+125% text", {'width': 390, 'height': 844}, "1.25")]
problems = []
count = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    runs = [("provider", PUID, profile, PT, "vaibook_provider_tab"), ("customer", CUID, None, CT, "vaibook_customer_tab"), ("admin", AUID, None, AT, "vaibook_admin_tab")]
    only = os.environ.get("ONLY", "").split(",") if os.environ.get("ONLY") else None
    for portal, uid, prof, tabs, key in runs:
        for tab in tabs:
            if only and f"{portal}:{tab}" not in only: continue
            for mname, vp, zoom in modes:
                ctx = b.new_context(viewport=vp, is_mobile=True, has_touch=True)
                init = f"localStorage.setItem('sb-nvfpdkpzrtpmvmgzvdca-auth-token', {json.dumps(json.dumps(sess(uid)))}); sessionStorage.setItem('{key}','{tab}');"
                if zoom: init += f"document.addEventListener('DOMContentLoaded',()=>{{document.documentElement.style.zoom='{zoom}'}});"
                ctx.add_init_script(init)
                ctx.route('**/*.supabase.co/**', handler(uid, prof))
                pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
                pg.goto(f'http://localhost:5077/#{portal}'); pg.wait_for_timeout(2200)
                issues = pg.evaluate(CHECK)
                count += 1
                if issues or errs:
                    problems.append((portal, tab, mname, issues, errs))
                    pg.screenshot(path=f'lc_{portal}_{tab}_{mname[:5]}.png', full_page=True)
                ctx.close()
    # public pages: landing + business page
    for name, path in (("landing", "/"), ("business-page", f"/#book-{PID}")):
        for mname, vp, zoom in modes:
            ctx = b.new_context(viewport=vp, is_mobile=True, has_touch=True)
            if zoom: ctx.add_init_script(f"document.addEventListener('DOMContentLoaded',()=>{{document.documentElement.style.zoom='{zoom}'}});")
            ctx.route('**/*.supabase.co/**', handler('none', None)); pg = ctx.new_page()
            pg.goto('http://localhost:5077' + path); pg.wait_for_timeout(2500)
            issues = pg.evaluate(CHECK); count += 1
            if issues: problems.append(("public", name, mname, issues, [])); pg.screenshot(path=f'lc_public_{name}_{mname[:5]}.png', full_page=True)
            ctx.close()
    # booking flow: pick two services, open the time picker + guest form
    for mname, vp, zoom in modes:
        ctx = b.new_context(viewport=vp, is_mobile=True, has_touch=True)
        if zoom: ctx.add_init_script(f"document.addEventListener('DOMContentLoaded',()=>{{document.documentElement.style.zoom='{zoom}'}});")
        ctx.route('**/*.supabase.co/**', handler('none', None)); pg = ctx.new_page()
        pg.goto('http://localhost:5077/#book-' + PID); pg.wait_for_timeout(2500)
        try:
            cards = pg.locator('.profile-panel .service-card')
            cards.nth(1).click(); cards.nth(6).click(); pg.wait_for_timeout(300)
            pg.locator('button:visible', has_text='Book now').last.click(); pg.wait_for_timeout(1500)
            issues = pg.evaluate(CHECK)
        except Exception as e:
            issues = ['FLOW-FAILED ' + str(e)[:120]]
        count += 1
        if issues: problems.append(("public", "booking-flow", mname, issues, [])); pg.screenshot(path=f'lc_public_bookingflow_{mname[:5]}.png', full_page=True)
        ctx.close()
    b.close()
print(f'screens checked: {count} | screens with layout problems: {len(problems)}')
for pr in problems:
    print('==', pr[0], pr[1], pr[2], pr[4] or '')
    for i in pr[3]: print('    ', i)
