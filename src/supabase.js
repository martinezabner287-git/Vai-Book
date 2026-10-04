import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvfpdkpzrtpmvmgzvdca.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zpAA2Gdcm_BJhu1D56tsTw_sBpZXiNA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── PRIVATE FILES (receipts / refund proof) ─────────────────────
// The `vaibook` bucket holds payment-related screenshots (deposit
// receipts, provider plan-payment receipts, refund proof) and is
// private — only the people a file actually concerns (see
// supabase_private_receipts.sql for the storage RLS) can open it, and
// only via a short-lived signed link, not a permanent public URL.
//
// Older rows saved before this change still hold a full public URL in
// their receipt_url column rather than a bare storage path — this
// strips that prefix back down to a path so both old and new rows
// keep working the same way.
const BUCKET_PUBLIC_PREFIX = '/storage/v1/object/public/vaibook/';
function extractStoragePath(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http')) {
    const idx = pathOrUrl.indexOf(BUCKET_PUBLIC_PREFIX);
    if (idx === -1) return null;
    try { return decodeURIComponent(pathOrUrl.slice(idx + BUCKET_PUBLIC_PREFIX.length)); }
    catch (e) { return pathOrUrl.slice(idx + BUCKET_PUBLIC_PREFIX.length); }
  }
  return pathOrUrl;
}

// Opens a receipt/refund file in a new tab via a short-lived signed URL.
// Opens the blank tab synchronously (before the await) so browsers don't
// treat it as a blocked popup — same trick used by printInvoice below.
export const openPrivateFile = async (pathOrUrl) => {
  const w = window.open("", "_blank");
  const path = extractStoragePath(pathOrUrl);
  if (!path) { if (w) w.close(); alert("This file can't be found."); return; }
  const { data, error } = await supabase.storage.from('vaibook').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    console.error('Error creating signed url:', error?.message);
    if (w) w.close();
    alert("Couldn't open this file — it may have been removed.");
    return;
  }
  if (w) w.location.href = data.signedUrl;
};

// ── AUTH HELPERS ─────────────────────────────────────────────────

export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      // Without this, Google silently re-authenticates using whatever
      // Google account session is already active in the browser, so a
      // returning visitor can never switch accounts (or even see a
      // picker) without first fully signing out of Google itself in a
      // separate tab. Forcing the account chooser every time fixes that
      // and matches what people expect from a "Log in" button.
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) console.error('Google sign in error:', error.message);
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Sign out error:', error.message);
};

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// ── SOLO-PLAN SINGLE SESSION (Starter/Pro only) ──────────────────
// A Starter or Pro ("Solo") provider is a single person — if their login
// shows up on a second device, the first one should get signed out, not
// stay live alongside it. Business ("Team") plan providers are exempt:
// multiple staff are expected to be signed in concurrently on their own
// devices/accounts.
//
// Mechanism: one row per provider user in `provider_sessions` holding an
// opaque `session_token`. Logging in rotates it (rotate_provider_session,
// see supabase_solo_single_session.sql) and the new token is cached in
// localStorage on this device. Every other device still has the OLD token
// cached — subscribeToSoloSessionReplacement below listens for the row
// changing and fires as soon as that happens, so a stale device gets
// signed out within moments instead of silently staying logged in.
//
// Requires Realtime enabled on `provider_sessions` (Supabase dashboard →
// Database → Replication → toggle it on) — the postgres_changes
// subscription below depends on it.
const SOLO_SESSION_KEY = 'vaibook_solo_session_token';

export const establishSoloSession = async (providerId) => {
  const { data: newToken, error } = await supabase.rpc('rotate_provider_session', {
    p_provider_id: providerId,
  });
  if (error) { console.error('Error establishing solo session:', error.message); return null; }
  localStorage.setItem(SOLO_SESSION_KEY, newToken);
  return newToken;
};

export const getLocalSoloSessionToken = () => localStorage.getItem(SOLO_SESSION_KEY);

export const clearLocalSoloSessionToken = () => localStorage.removeItem(SOLO_SESSION_KEY);

// One-shot check against the server's current token — used on mount and on
// tab-focus, as a backstop for the Realtime subscription below (sockets can
// silently drop on a flaky connection; this catches a replacement that
// happened while this tab was backgrounded or the socket was down).
export const getServerSoloSessionToken = async (userId) => {
  const { data, error } = await supabase
    .from('provider_sessions')
    .select('session_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) { console.error('Error checking solo session token:', error.message); return null; }
  return data?.session_token || null;
};

// Subscribes to this provider's session row; calls onReplaced() the moment
// another device rotates the token (i.e. signs in elsewhere). Returns an
// unsubscribe function — call it on sign-out / unmount.
export const subscribeToSoloSessionReplacement = (userId, onReplaced) => {
  if (!userId) return () => {};
  const channel = supabase
    .channel(`provider-session-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'provider_sessions', filter: `user_id=eq.${userId}` },
      (payload) => {
        const localToken = getLocalSoloSessionToken();
        if (payload.new?.session_token && payload.new.session_token !== localToken) {
          onReplaced();
        }
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
};

// ── USER HELPERS ─────────────────────────────────────────────────

export const getOrCreateUser = async (authUser) => {
  // Check if user profile exists.
  //
  // FIXED (P0 — same bug class as getProviderProfile below): this used to
  // ignore the error entirely, so a real query failure (network blip, or
  // the client's session/JWT not fully attached yet right after an OAuth
  // redirect) looked identical to "this account's users row doesn't exist
  // yet" — `existing` comes back falsy either way. That silently sent an
  // ALREADY-REGISTERED account down the insert path below on every
  // transient hiccup: the insert then fails on the primary-key conflict,
  // gets logged, and this returns undefined instead of their real row —
  // which is exactly the kind of failure that can cascade into "my data
  // is gone" symptoms elsewhere (setUser(undefined) upstream). Only a
  // genuine "no rows" (PGRST116) means this is really a brand-new user;
  // any other error just means the check itself failed and must not be
  // treated as "doesn't exist".
  const { data: existing, error: lookupError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (existing) return existing;
  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('Error checking for existing user (not creating a new one):', lookupError.message);
    throw lookupError;
  }

  // Create new user profile
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      id: authUser.id,
      full_name: authUser.user_metadata?.full_name || authUser.email,
      email: authUser.email,
      avatar_url: authUser.user_metadata?.avatar_url || null,
      oauth_provider: authUser.app_metadata?.provider || 'email',
      role: 'customer',
    })
    .select()
    .single();

  if (error) console.error('Error creating user:', error.message);
  return newUser;
};

// ── PROVIDER HELPERS ─────────────────────────────────────────────

// PGRST116 ("no rows") is the ONLY error code that means "this account
// genuinely has no business" — anything else (a network blip, or the
// client's session/JWT not fully attached yet right after an OAuth
// redirect, which is exactly when this tends to fire) is a real query
// failure, not an answer. Those used to be swallowed the same way real
// "no data" was (logged, then `data` — undefined either way — handed
// back), so a transient hiccup here looked identical to "you don't own a
// business" to every caller and could flash the onboarding screen at an
// actual registered provider. Throwing on a genuine error lets callers
// (see loadProviderProfile in App.jsx) tell "confirmed: no business" apart
// from "couldn't confirm — don't assume" and react accordingly.
// STILL P0 after the first round of fixes (routing/switching logic — see
// the switchToPortal/loadProviderProfile comments elsewhere in this file
// and in App.jsx): providers were still landing on "no provider profile
// yet" after that fix shipped. That fix was correct as far as it went —
// it stopped the APP from mishandling a real profile — but it can't help
// if this query is correctly, genuinely finding zero rows because the
// signed-in identity doesn't match the one on file. The most likely real
// cause: signInWithGoogle forces Google's account picker on every sign-in
// (`prompt: 'select_account'`), so anyone with more than one Google
// account (very plausible for an owner and staff sharing a device, or
// someone with a personal + business account) can easily pick the wrong
// one and land on a genuinely different, profile-less identity. That's a
// UX problem this function can't fix — see the "Try a different Google
// account" recovery button on ProviderPortal's no-profile screen in
// App.jsx, which is the actual fix for that. What THIS function can and
// now does harden defensively: it used to run `.single()`, which throws
// its own error whether zero rows OR more than one came back (both
// surfaced as the same PGRST116-ish shape in practice), so a genuine
// data-integrity problem (two rows for one user_id, which shouldn't be
// possible given upsertProviderProfile's `onConflict: 'user_id'`, but
// "shouldn't be possible" isn't "provably impossible" without inspecting
// the schema's constraints directly) would have been indistinguishable
// from "no business" too. Querying as a plain array sidesteps that
// entirely: an empty array is unambiguously "no business", any real
// Postgres/network error is unambiguously a failure worth throwing, and
// more than one row is caught explicitly and logged loudly rather than
// silently mistaken for either of the other two cases.
export const getProviderProfile = async (userId) => {
  const { data, error } = await supabase
    .from('provider_profiles')
    .select('*, services(*), working_hours(*)')
    .eq('user_id', userId);
  if (error) {
    console.error('Error fetching provider profile:', error.message);
    throw error;
  }
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    // Should be impossible given the unique constraint upsertProviderProfile
    // relies on — but if it ever happens, telling a real owner "no
    // business" is strictly worse than showing them (most likely) the
    // right one, so return a row rather than null. Logged loudly because
    // this needs a database-level fix, not a client-side workaround.
    console.error(`Data integrity: ${data.length} provider_profiles rows found for user_id ${userId} (expected at most 1). Returning the first — this needs to be fixed at the database level.`);
  }
  return data[0];
};

export const upsertProviderProfile = async (profile) => {
  const { data, error } = await supabase
    .from('provider_profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) console.error('Error saving provider profile:', error.message);
  return data;
};

// Used only the very first time a newly-approved applicant signs in, to
// create their provider_profiles row from scratch. Deliberately a plain
// insert with no .select() — same reasoning as submitProviderApplication:
// Postgres RLS treats "hand back the inserted row" (RETURNING) as a read,
// which needs a SELECT policy in addition to the INSERT policy, and this
// is the one place in the app where a brand-new row gets created by a
// regular (non-admin) authenticated user rather than an existing owner
// updating their own row. The caller re-reads with getProviderProfile
// afterward instead of relying on the insert to hand the row back.
export const createProviderProfile = async (profile) => {
  const { error } = await supabase.from('provider_profiles').insert(profile);
  if (error) { console.error('Error creating provider profile:', error.message); return false; }
  return true;
};

// ── PROVIDER PHOTO HELPERS ─────────────────────────────────────────

export const uploadProviderPhoto = async (userId, file) => {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('provider-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) {
    console.error('Error uploading photo:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('provider-photos').getPublicUrl(path);
  return data?.publicUrl || null;
};

export const deleteProviderPhoto = async (userId, url) => {
  // Extract the storage path from a public URL like
  // .../storage/v1/object/public/provider-photos/<userId>/<file>
  const marker = '/provider-photos/';
  const idx = url.indexOf(marker);
  if (idx === -1) return false;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from('provider-photos').remove([path]);
  if (error) {
    console.error('Error deleting photo:', error.message);
    return false;
  }
  return true;
};


// ── WORKING HOURS HELPERS ─────────────────────────────────────────

export const getWorkingHours = async (providerId) => {
  const { data, error } = await supabase
    .from('working_hours')
    .select('*')
    .eq('provider_id', providerId)
    .order('day_of_week', { ascending: true });
  if (error) console.error('Error fetching working hours:', error.message);
  // DB columns are open_time/close_time; the rest of the app reads start_time/end_time.
  return (data || []).map((d) => ({ ...d, start_time: d.open_time, end_time: d.close_time }));
};

export const upsertWorkingHours = async (providerId, days) => {
  const rows = days.map((d) => ({
    provider_id: providerId,
    day_of_week: d.day_of_week,
    is_open: d.is_open,
    open_time: d.start_time,
    close_time: d.end_time,
  }));
  const { data, error } = await supabase
    .from('working_hours')
    .upsert(rows, { onConflict: 'provider_id,day_of_week' })
    .select();
  if (error) console.error('Error saving working hours:', error.message);
  return (data || []).map((d) => ({ ...d, start_time: d.open_time, end_time: d.close_time }));
};

// ── SERVICE HELPERS ──────────────────────────────────────────────

export const createService = async (service) => {
  const { data, error } = await supabase
    .from('services')
    .insert(service)
    .select()
    .single();
  if (error) { console.error('Error creating service:', error.message); return null; }
  return data;
};

export const updateService = async (serviceId, updates) => {
  const { data, error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', serviceId)
    .select()
    .single();
  if (error) { console.error('Error updating service:', error.message); return null; }
  return data;
};

export const deleteService = async (serviceId) => {
  const { error } = await supabase.from('services').delete().eq('id', serviceId);
  if (error) { console.error('Error deleting service:', error.message); return false; }
  return true;
};

// ── PROVIDER STAFF (Business plan) ──────────────────────────────
// Owner-managed staff seats — no separate staff logins. The owner adds
// staff by name, then assigns bookings to whoever handled them so
// everyone's schedule shows up in the same portal. Enforced as a
// Business-plan-only feature server-side too (see
// supabase_provider_staff.sql), not just hidden in the UI.
export const getProviderStaff = async (providerId) => {
  if (!providerId) return [];
  const { data, error } = await supabase
    .from('provider_staff')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: true });
  if (error) { console.error('Error fetching staff:', error.message); return []; }
  return data || [];
};

export const addProviderStaff = async (providerId, { name, phone, email }) => {
  const { data, error } = await supabase
    .from('provider_staff')
    .insert({ provider_id: providerId, name, phone: phone || null, email: email || null })
    .select()
    .single();
  if (error) { console.error('Error adding staff:', error.message); return null; }
  return data;
};

export const updateProviderStaff = async (staffId, updates) => {
  const { data, error } = await supabase
    .from('provider_staff')
    .update(updates)
    .eq('id', staffId)
    .select()
    .single();
  if (error) { console.error('Error updating staff:', error.message); return null; }
  return data;
};

export const deleteProviderStaff = async (staffId) => {
  const { error } = await supabase.from('provider_staff').delete().eq('id', staffId);
  if (error) { console.error('Error deleting staff:', error.message); return false; }
  return true;
};

// ── STAFF LOGINS ─────────────────────────────────────────────────
// Each staff member gets their own account rather than sharing the
// owner's login — see supabase_staff_accounts.sql. A seat is "claimed"
// the first time someone signs in with the email the owner registered
// it under; after that getMyStaffProfile finds it directly by user_id.

// Called once per sign-in, same spot loadProviderProfile() checks
// whether this account owns a business — this checks whether it's
// already claimed a staff seat.
// Both of these go through SECURITY DEFINER RPCs rather than touching
// provider_staff directly — see supabase_audit_fixes.sql. Reading the seat
// needs a join onto the employer's provider_profiles row, which a staff
// member has no policy to read; and claiming a seat is an UPDATE whose
// WHERE clause reads a row that, being unclaimed and owned by someone
// else's business, matches no SELECT policy at all — so the direct version
// silently matched zero rows and the whole staff login never worked.
// The RPCs also enforce that the employer is still on the Business plan,
// so access ends by itself on downgrade or deactivation.
export const getMyStaffProfile = async () => {
  const { data, error } = await supabase.rpc('get_my_staff_seat');
  if (error) { console.error('Error fetching staff profile:', error.message); return null; }
  return data || null;
};

export const claimStaffSeatByEmail = async () => {
  const { data, error } = await supabase.rpc('claim_staff_seat');
  if (error) { console.error('Error claiming staff seat:', error.message); return null; }
  return data || null;
};

export const getStaffBookings = async (staffId) => {
  if (!staffId) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*, users(full_name, email, avatar_url), services(name, price)')
    .eq('staff_id', staffId)
    .order('booking_date', { ascending: true });
  if (error) { console.error('Error fetching staff bookings:', error.message); return []; }
  return data || [];
};

// ── LOYALTY & REWARDS (Business plan) ───────────────────────────
// Provider-configurable — see supabase_loyalty_program.sql. Points are
// only ever added by a database trigger when a booking completes;
// these functions read balances and let a provider manually reduce one
// (redeeming a reward), matching the "provider applies it themselves"
// decision.
export const getLoyaltyAccount = async (providerId, customerId) => {
  if (!providerId || !customerId) return null;
  const { data, error } = await supabase
    .from('loyalty_accounts')
    .select('*')
    .eq('provider_id', providerId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) { console.error('Error fetching loyalty balance:', error.message); return null; }
  return data;
};

export const getProviderLoyaltyCustomers = async (providerId) => {
  if (!providerId) return [];
  const { data, error } = await supabase
    .from('loyalty_accounts')
    .select('*, users(full_name, email)')
    .eq('provider_id', providerId)
    .gt('points_balance', 0)
    .order('points_balance', { ascending: false });
  if (error) { console.error('Error fetching loyalty customers:', error.message); return []; }
  return data || [];
};

// Subtraction happens in the database against the current balance, not as
// an absolute value computed from a list that may be minutes stale — see
// redeem_loyalty_reward in supabase_audit_fixes.sql. Returns the updated
// row, or null if the balance had already dropped below the threshold.
export const redeemLoyaltyReward = async (accountId) => {
  const { data, error } = await supabase.rpc('redeem_loyalty_reward', { p_account_id: accountId });
  if (error) { console.error('Error redeeming reward:', error.message); return null; }
  return Array.isArray(data) ? data[0] : data;
};

export const getActiveProviders = async (filters = {}) => {
  let query = supabase
    .from('provider_profiles')
    // working_hours(*) added so every card that renders from this list
    // (trending/discover carousels, browse + favorites grid) can show a
    // real open/closed status without a second query per provider — see
    // providerOpenNow() in App.jsx, which reads p.working_hours directly.
    .select('*, services(*), reviews(rating), working_hours(*)')
    .eq('is_active', true)
    // Business-plan providers can turn on "Featured in district search" —
    // boosts them to the top of every browse/search result, everything
    // else keeps whatever order it already had.
    .order('is_featured', { ascending: false });

  if (filters.district) query = query.eq('district', filters.district);
  if (filters.service_type) query = query.eq('service_type', filters.service_type);

  const { data, error } = await query;
  if (error) console.error(error.message);
  // Defensive: PostgREST can infer a to-one embed (single object) instead of
  // an array depending on constraints, so normalize both embeds to arrays.
  const toArray = (v) => (v ? (Array.isArray(v) ? v : [v]) : []);
  return (data || []).map((p) => ({
    ...p,
    services: toArray(p.services),
    reviews: toArray(p.reviews),
    // DB columns are open_time/close_time; providerOpenNow (and the rest
    // of the app) reads start_time/end_time — same mapping getWorkingHours
    // already does for the single-provider fetch.
    working_hours: toArray(p.working_hours).map((h) => ({ ...h, start_time: h.open_time, end_time: h.close_time })),
  }));
};

// Lightweight directory used for search-suggestion autocomplete (business
// name, category, and service names) — kept minimal since it's fetched
// eagerly on the landing page before the user has searched for anything.
// Fetches a single active provider by id, in the same shape as
// getActiveProviders — used to open a provider's booking page directly
// from a deep link (e.g. their QR code), without the customer having to
// search for them first.
export const getProviderById = async (id) => {
  if (!id) return null;
  const { data, error } = await supabase
    .from('provider_profiles')
    .select('*, services(*), reviews(rating)')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();
  if (error) { console.error('Error fetching provider:', error.message); return null; }
  if (!data) return null;
  const toArray = (v) => (v ? (Array.isArray(v) ? v : [v]) : []);
  return { ...data, services: toArray(data.services), reviews: toArray(data.reviews) };
};

export const getProviderDirectory = async () => {
  const { data, error } = await supabase
    .from('provider_profiles')
    .select('id, business_name, service_type, district, services(name)')
    .eq('is_active', true);
  if (error) console.error(error.message);
  const toArray = (v) => (v ? (Array.isArray(v) ? v : [v]) : []);
  return (data || []).map((p) => ({ ...p, services: toArray(p.services) }));
};

// ── BOOKING HELPERS ──────────────────────────────────────────────

export const createBooking = async (booking) => {
  const { data, error } = await supabase
    .from('bookings')
    .insert(booking)
    .select()
    .single();
  if (error) console.error('Error creating booking:', error.message);
  return data;
};

// Returns the busy time windows (start/end only, no customer identity) for a
// provider on a given date — used to render live availability and to block
// out already-taken slots on the booking calendar. Merges in provider_blocks
// (the 1-tap "Walk-in (30m)" panic button and the Custom Block bottom sheet)
// so a quick block is instantly reflected in what customers can book —
// get_busy_windows itself only knows about real bookings.
export const getProviderBusyWindows = async (providerId, dateStr) => {
  const [bookingsResult, blocksResult] = await Promise.all([
    supabase.rpc('get_busy_windows', { p_provider_id: providerId, p_date: dateStr }),
    supabase.from('provider_blocks').select('start_time, end_time').eq('provider_id', providerId).eq('block_date', dateStr),
  ]);
  if (bookingsResult.error) console.error('Error fetching busy windows:', bookingsResult.error.message);
  if (blocksResult.error) console.error('Error fetching provider blocks:', blocksResult.error.message);
  return [...(bookingsResult.data || []), ...(blocksResult.data || [])];
};

// ── PROVIDER BLOCKS (1-tap walk-in / break blocking) ────────────────
// See supabase_provider_blocks.sql. A block is just a start/end window on a
// date, owned by the provider (RLS: provider_id must map to the caller's own
// provider_profiles row) — it never touches the bookings table, so it can't
// be confused with a real appointment, and it's simply merged into busy
// windows above.

export const getProviderBlocks = async (providerId, fromDateStr) => {
  let query = supabase.from('provider_blocks').select('*').eq('provider_id', providerId).order('block_date', { ascending: true }).order('start_time', { ascending: true });
  if (fromDateStr) query = query.gte('block_date', fromDateStr);
  const { data, error } = await query;
  if (error) { console.error('Error fetching provider blocks:', error.message); return []; }
  return data || [];
};

export const insertProviderBlock = async (block) => {
  const { data, error } = await supabase.from('provider_blocks').insert(block).select().single();
  if (error) { console.error('Error creating provider block:', error.message); return null; }
  return data;
};

export const deleteProviderBlock = async (blockId) => {
  const { error } = await supabase.from('provider_blocks').delete().eq('id', blockId);
  if (error) { console.error('Error removing provider block:', error.message); return false; }
  return true;
};

// ── MULTI-SERVICE CHECKOUT ───────────────────────────────────────────
// create_booking_safe only takes a single p_service_id (it's the existing,
// already-hardened atomic slot-reservation RPC — see the note in
// supabase_multiservice_checkout.sql for why this is a follow-up call
// rather than a change to that RPC). A multi-service booking is created
// with its first selected service as the primary service_id + the combined
// price/deposit, then this attaches the full service list and total
// duration right after, with its own server-side overlap re-check.
export const attachBookingServices = async (bookingId, serviceIds, totalDurationMin) => {
  const { error } = await supabase.rpc('attach_booking_services', {
    p_booking_id: bookingId,
    p_service_ids: serviceIds,
    p_total_duration_min: totalDurationMin,
  });
  if (error) {
    if (error.message && error.message.includes('SLOT_TAKEN_MULTI')) {
      const err = new Error('SLOT_TAKEN_MULTI');
      err.code = 'SLOT_TAKEN_MULTI';
      throw err;
    }
    console.error('Error attaching multi-service details:', error.message);
    throw error;
  }
};

// Atomically re-checks for a conflicting booking and inserts, using a
// server-side advisory lock so two customers can't win the same slot in a
// race. Throws with a `.code === 'SLOT_TAKEN'` when the slot was just taken.
export const createBookingSafe = async (booking) => {
  const { data, error } = await supabase.rpc('create_booking_safe', {
    p_order_number: booking.order_number,
    p_customer_id: booking.customer_id,
    p_provider_id: booking.provider_id,
    p_service_id: booking.service_id,
    p_booking_date: booking.booking_date,
    p_booking_time: booking.booking_time,
    p_total_amount: booking.total_amount,
    p_downpayment_amount: booking.downpayment_amount,
    p_notes: booking.notes,
  });
  if (error) {
    throwKnownGuardErrors(error);
    console.error('Error creating booking:', error.message);
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
};

// The security-hardening migration added BEFORE INSERT guards (rate
// limiting + maintenance mode) on provider_applications, bookings, and
// booking_messages. Postgres surfaces a RAISE EXCEPTION as a plain error
// with our message text inside it, so we recognize it by substring and
// re-throw with a `.code` the UI can branch on — same pattern already
// used for SLOT_TAKEN above.
const throwKnownGuardErrors = (error) => {
  if (!error || !error.message) return;
  if (error.message.includes('RATE_LIMITED')) {
    const err = new Error('RATE_LIMITED');
    err.code = 'RATE_LIMITED';
    throw err;
  }
  if (error.message.includes('MAINTENANCE_MODE')) {
    const err = new Error('MAINTENANCE_MODE');
    err.code = 'MAINTENANCE_MODE';
    throw err;
  }
  if (error.message.includes('STARTER_LIMIT_REACHED')) {
    const err = new Error('STARTER_LIMIT_REACHED');
    err.code = 'STARTER_LIMIT_REACHED';
    throw err;
  }
  if (error.message.includes('NOT_ELIGIBLE_FOR_REVIEW')) {
    const err = new Error('NOT_ELIGIBLE_FOR_REVIEW');
    err.code = 'NOT_ELIGIBLE_FOR_REVIEW';
    throw err;
  }
  if (error.message.includes('REVIEW_LOCKED')) {
    const err = new Error('REVIEW_LOCKED');
    err.code = 'REVIEW_LOCKED';
    throw err;
  }
};

// Lets a provider add a confirmed booking directly for someone who isn't
// a VaiBook customer — a walk-in, or someone who called/asked in person
// (an older client, for example). Goes straight to "confirmed" since the
// provider is entering it on the client's behalf. See
// supabase_walkin_bookings.sql for the RPC and the security check that
// only lets a provider add walk-ins under their own profile.
export const createWalkInBooking = async (booking) => {
  const { data, error } = await supabase.rpc('create_walkin_booking', {
    p_order_number: booking.order_number,
    p_provider_id: booking.provider_id,
    p_service_id: booking.service_id,
    p_booking_date: booking.booking_date,
    p_booking_time: booking.booking_time,
    p_customer_name: booking.customer_name,
    p_customer_phone: booking.customer_phone || null,
    p_notes: booking.notes || null,
  });
  if (error) {
    throwKnownGuardErrors(error);
    console.error('Error adding walk-in booking:', error.message);
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
};

export const cancelBooking = async (bookingId) => {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .select()
    .single();
  if (error) console.error('Error cancelling booking:', error.message);
  return data;
};

export const getCustomerBookings = async (customerId) => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, provider_profiles(id, user_id, business_name, service_type, district, latitude, longitude, location_label, whatsapp, tax_id, payment_methods(id, type, name, account_name, account_number)), services(name, price, duration_min), reviews(id, rating, comment, hold_until), booking_refunds(id, amount, receipt_url, note, created_at), payments(id, amount, currency, payment_status, transaction_id, created_at)')
    .eq('customer_id', customerId)
    .order('booking_date', { ascending: false });
  if (error) console.error(error.message);
  // PostgREST infers a to-one embed for reviews (one review per booking),
  // so it returns a single object or null rather than an array. Normalize
  // to an array so the rest of the app can consistently do reviews.length.
  return (data || []).map((b) => ({
    ...b,
    reviews: b.reviews ? (Array.isArray(b.reviews) ? b.reviews : [b.reviews]) : [],
  }));
};

export const getProviderBookings = async (providerId) => {
  const { data, error } = await supabase
    .from('bookings')
    // `phone` added for the dashboard's "Next in the Chair" WhatsApp button
    // and Rebooking Radar check-ins — the provider's own view of their
    // bookings is the only place that needs a customer's phone number.
    .select('*, users(full_name, email, avatar_url, phone), services(name, price, duration_min), booking_refunds(id, amount, receipt_url, note, created_at), payments(id, amount, currency, payment_status, transaction_id, created_at)')
    .eq('provider_id', providerId)
    .order('booking_date', { ascending: true });
  if (error) console.error(error.message);
  return data || [];
};

export const updateBookingStatus = async (bookingId, status) => {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
    .select()
    .single();
  if (error) console.error(error.message);
  return data;
};

// Generalized update — used by the accept/reject/payment-confirmation flow
// to set status + provider_message + payment_status together in one call.
export const updateBooking = async (bookingId, updates) => {
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select()
    .single();
  if (error) console.error('Error updating booking:', error.message);
  return data;
};

export const uploadReceipt = async (bookingId, file) => {
  // Timestamped so re-uploading a second photo doesn't collide with the
  // first — phone cameras hand back the same filename over and over
  // ("image.jpg", "IMG_0001.jpg"), and a collision made the upload fail
  // while the app still reported success.
  const safeName = String(file.name || 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `receipts/${bookingId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from('vaibook')
    .upload(path, file);
  if (uploadError) { console.error(uploadError.message); return null; }

  // vaibook is a private bucket — store the storage path, not a public URL;
  // viewers open it via openPrivateFile(), which signs a short-lived link.
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ receipt_url: path, payment_status: 'receipt_uploaded' })
    .eq('id', bookingId);
  if (updateError) { console.error(updateError.message); return null; }

  return path;
};

// Hands back the provider's contact address for ONE booking the caller
// placed themselves, and only when that provider still wants new-booking
// emails. Their address deliberately isn't on the publicly readable profile
// row — see get_provider_notify_email in supabase_audit_fixes.sql.
export const getProviderNotifyEmail = async (bookingId) => {
  if (!bookingId) return null;
  const { data, error } = await supabase.rpc('get_provider_notify_email', { p_booking_id: bookingId });
  if (error) { console.error('Error resolving provider email:', error.message); return null; }
  return data || null;
};

// Moves a booking that hasn't happened yet to a new date/time, re-checking
// for a clash the same way booking does. Throws with .code === 'SLOT_TAKEN'
// when the new slot is already taken. See supabase_audit_fixes.sql.
export const rescheduleBooking = async (bookingId, dateStr, timeStr) => {
  const { data, error } = await supabase.rpc('reschedule_booking', {
    p_booking_id: bookingId,
    p_date: dateStr,
    p_time: timeStr,
  });
  if (error) {
    if (error.message && error.message.includes('SLOT_TAKEN')) {
      const err = new Error('SLOT_TAKEN');
      err.code = 'SLOT_TAKEN';
      throw err;
    }
    console.error('Error rescheduling booking:', error.message);
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
};

// Standalone lookup for a single booking's payment ledger — the normal
// path is the `payments` embed already included in getCustomerBookings/
// getProviderBookings above; this is for anywhere that only has a
// booking_id on hand (e.g. a future gateway-status poll or webhook result
// screen) and doesn't want to refetch the whole booking.
export const getBookingPayments = async (bookingId) => {
  const { data, error } = await supabase
    .from('payments')
    .select('id, amount, currency, payment_status, transaction_id, created_at, updated_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching booking payments:', error.message); return []; }
  return data || [];
};

// ── RESCHEDULE PROPOSE/CONFIRM ──────────────────────────────────
// A provider-initiated reschedule no longer moves the booking right away —
// it stores a *proposed* date/time and the customer has to confirm it.
// See 4_reschedule_requires_confirmation.sql. All four throw with
// .code === 'SLOT_TAKEN' (propose/confirm) on a real overlap; the others
// only fail on genuine errors (not-found, not-yours, nothing pending).

// Provider proposes a new date/time for their own booking.
export const proposeBookingReschedule = async (bookingId, dateStr, timeStr) => {
  const { error } = await supabase.rpc('propose_booking_reschedule', {
    p_booking_id: bookingId,
    p_date: dateStr,
    p_time: timeStr,
  });
  if (error) {
    if (error.message && error.message.includes('SLOT_TAKEN')) {
      const err = new Error('SLOT_TAKEN');
      err.code = 'SLOT_TAKEN';
      throw err;
    }
    console.error('Error proposing reschedule:', error.message);
    throw error;
  }
};

// Customer confirms the provider's proposed date/time — this is the only
// point the real booking_date/booking_time actually change.
export const confirmBookingReschedule = async (bookingId) => {
  const { error } = await supabase.rpc('confirm_booking_reschedule', { p_booking_id: bookingId });
  if (error) {
    if (error.message && error.message.includes('SLOT_TAKEN')) {
      const err = new Error('SLOT_TAKEN');
      err.code = 'SLOT_TAKEN';
      throw err;
    }
    console.error('Error confirming reschedule:', error.message);
    throw error;
  }
};

// Customer declines — the original date/time stand, nothing else changes.
export const declineBookingReschedule = async (bookingId) => {
  const { error } = await supabase.rpc('decline_booking_reschedule', { p_booking_id: bookingId });
  if (error) {
    console.error('Error declining reschedule:', error.message);
    throw error;
  }
};

// Provider withdraws their own proposal before the customer responds.
export const withdrawBookingReschedule = async (bookingId) => {
  const { error } = await supabase.rpc('withdraw_booking_reschedule', { p_booking_id: bookingId });
  if (error) {
    console.error('Error withdrawing reschedule proposal:', error.message);
    throw error;
  }
};

// ── PROVIDER PLAN PAYMENTS (provider ↔ VaiBook, not tied to a booking) ──
// See supabase_provider_payments.sql for the table, RLS, and admin RPCs.

// Uploads a receipt and records the submission in one call. Deliberately a
// plain insert with no .select() — same RLS+RETURNING gotcha as elsewhere
// in this file — so the caller re-fetches via getMyProviderPayments after.
export const submitProviderPayment = async (providerId, file, { plan, amount, periodLabel }) => {
  const path = `provider-payments/${providerId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('vaibook').upload(path, file);
  if (uploadError) { console.error('Error uploading payment receipt:', uploadError.message); return false; }

  // vaibook is a private bucket — store the storage path, not a public URL;
  // viewers open it via openPrivateFile(), which signs a short-lived link.
  const { error } = await supabase.from('provider_payments').insert({
    provider_id: providerId,
    plan,
    amount,
    period_label: periodLabel,
    receipt_url: path,
  });
  if (error) { console.error('Error submitting payment:', error.message); return false; }
  return true;
};

export const getMyProviderPayments = async (providerId) => {
  if (!providerId) return [];
  const { data, error } = await supabase
    .from('provider_payments')
    .select('*')
    .eq('provider_id', providerId)
    .order('submitted_at', { ascending: false });
  if (error) { console.error('Error fetching payments:', error.message); return []; }
  return data || [];
};

export const adminListProviderPayments = async () => {
  const { data, error } = await supabase.rpc('admin_list_provider_payments');
  if (error) { console.error('Error listing provider payments:', error.message); return []; }
  return data || [];
};

export const adminReviewProviderPayment = async (paymentId, status, note) => {
  const { error } = await supabase.rpc('admin_review_provider_payment', {
    p_payment_id: paymentId,
    p_status: status,
    p_note: note || null,
  });
  if (error) { console.error('Error reviewing payment:', error.message); return false; }
  return true;
};

// ── BOOKING REFUNDS (provider ↔ customer, proof of a direct refund) ────
// VaiBook doesn't process payments, so a "refund" is the provider sending
// money back to the customer themselves — this just records proof of it.
// See supabase_booking_refunds.sql for the table, RLS, and admin RPC.
export const submitBookingRefund = async (bookingId, providerId, file, { amount, note }) => {
  const path = `refunds/${bookingId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from('vaibook').upload(path, file);
  if (uploadError) { console.error('Error uploading refund receipt:', uploadError.message); return false; }

  // vaibook is a private bucket — store the storage path, not a public URL;
  // viewers open it via openPrivateFile(), which signs a short-lived link.
  const { error } = await supabase.from('booking_refunds').insert({
    booking_id: bookingId,
    provider_id: providerId,
    amount,
    receipt_url: path,
    note: note || null,
  });
  if (error) { console.error('Error recording refund:', error.message); return false; }
  return true;
};

export const adminListBookingRefunds = async () => {
  const { data, error } = await supabase.rpc('admin_list_booking_refunds');
  if (error) { console.error('Error listing refunds:', error.message); return []; }
  return data || [];
};

// ── BOOKING MESSAGES (customer ↔ provider, tied to one booking) ────

export const getBookingMessages = async (bookingId) => {
  const { data, error } = await supabase
    .from('booking_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) { console.error('Error loading messages:', error.message); return []; }
  return data || [];
};

export const sendBookingMessage = async ({ booking_id, sender_id, sender_role, body }) => {
  const { error } = await supabase
    .from('booking_messages')
    .insert({ booking_id, sender_id, sender_role, body });
  if (error) {
    throwKnownGuardErrors(error);
    console.error('Error sending message:', error.message);
    return false;
  }
  return true;
};

// Marks every message in a thread that wasn't sent by `viewerId` as read —
// called once the viewer actually opens the thread, to clear their unread
// badge without also clearing the badge on the other side.
export const markBookingMessagesRead = async (bookingId, viewerId) => {
  const { error } = await supabase
    .from('booking_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .is('read_at', null)
    .neq('sender_id', viewerId);
  if (error) console.error('Error marking messages read:', error.message);
};

// Every unread message across every booking thread this user participates
// in (RLS already scopes rows to threads they're part of), used to badge
// "My bookings" / "Bookings" per-booking in the portal list views.
export const getUnreadBookingMessages = async (viewerId) => {
  const { data, error } = await supabase
    .from('booking_messages')
    .select('booking_id')
    .is('read_at', null)
    .neq('sender_id', viewerId);
  if (error) { console.error('Error loading unread messages:', error.message); return []; }
  return data || [];
};

// Returns the last `months` calendar months (oldest first) of the calling
// provider's own revenue/bookings/reviews numbers — always live for the
// current month, backed by the permanent monthly snapshot for past ones.
export const getProviderMonthlyTrend = async (months = 6) => {
  const { data, error } = await supabase.rpc('get_my_provider_monthly_trend', { p_months: months });
  if (error) { console.error('Error loading monthly trend:', error.message); return []; }
  return data || [];
};

// ── REVIEW HELPERS ───────────────────────────────────────────────

export const submitReview = async (review) => {
  const { data, error } = await supabase
    .from('reviews')
    .insert(review)
    .select()
    .single();
  if (error) {
    throwKnownGuardErrors(error);
    console.error(error.message);
    return null;
  }
  return data;
};

// A 1- or 2-star review is held privately for 48 hours (see
// supabase_review_privacy.sql) — the row itself still comes back from
// this same select for whoever's allowed to see it early (the reviewer,
// the provider it's about, admin); everyone else's copy of this query
// simply won't include it until the hold clears, enforced by RLS, not by
// this function filtering anything client-side.
export const getProviderReviews = async (providerId) => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, users(full_name, avatar_url)')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) console.error(error.message);
  return data || [];
};

// Lets a customer edit their own review, but only while it's still inside
// its 48-hour hold (see before_review_update() in
// supabase_review_privacy.sql) — raising the rating to 3+ publishes it
// right away; trying to edit a review that's already public raises
// REVIEW_LOCKED.
export const updateReview = async (reviewId, { rating, comment }) => {
  const { data, error } = await supabase
    .from('reviews')
    .update({ rating, comment })
    .eq('id', reviewId)
    .select()
    .single();
  if (error) {
    throwKnownGuardErrors(error);
    console.error(error.message);
    return null;
  }
  return data;
};

// The old "VIP clients" (starred-customer) feature and its tagVIP/untagVIP/
// getVIPClients helpers were removed — the Provider Portal's "Clients" tab
// now lists every real customer straight from booking history instead of a
// manually-starred subset. The `vip_clients` table itself was left alone in
// the database (nothing here drops it), it's just unused by the app now.

// ── FAVORITES (customers) ────────────────────────────────────────

export const getFavoriteProviderIds = async (customerId) => {
  const { data, error } = await supabase
    .from('favorites')
    .select('provider_id')
    .eq('customer_id', customerId);
  if (error) { console.error('Error fetching favorites:', error.message); return []; }
  return (data || []).map((f) => f.provider_id);
};

export const getFavoriteProviders = async (customerId) => {
  const { data, error } = await supabase
    .from('favorites')
    .select('created_at, provider_profiles(*, services(*), reviews(rating))')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching favorite providers:', error.message); return []; }
  // Suspended providers are hidden from search, so they shouldn't stay
  // bookable from someone's favourites either.
  return (data || []).map((f) => f.provider_profiles).filter((p) => p && p.is_active !== false);
};

export const addFavorite = async (customerId, providerId) => {
  const { error } = await supabase.from('favorites').insert({ customer_id: customerId, provider_id: providerId });
  if (error) { console.error('Error adding favorite:', error.message); return false; }
  return true;
};

export const removeFavorite = async (customerId, providerId) => {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('customer_id', customerId)
    .eq('provider_id', providerId);
  if (error) { console.error('Error removing favorite:', error.message); return false; }
  return true;
};

// ── ANALYTICS HELPERS ────────────────────────────────────────────

export const getProviderAnalytics = async (providerId) => {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, services(name, price)')
    .eq('provider_id', providerId)
    .eq('status', 'completed');

  const totalRevenue = bookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;
  const totalBookings = bookings?.length || 0;

  // Most requested services
  const serviceCounts = {};
  bookings?.forEach(b => {
    const name = b.services?.name || 'Unknown';
    serviceCounts[name] = (serviceCounts[name] || 0) + 1;
  });
  const topServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return { totalRevenue, totalBookings, topServices, bookings };
};

// ── EMAIL HELPERS ─────────────────────────────────────────────────
// Sends transactional email via the `send-email` Supabase Edge Function,
// which forwards to Resend server-side (keeps the API key off the client).
// Best-effort: booking actions should never fail just because an email
// didn't go out (e.g. Resend's free tier only delivers to the account's
// own verified address until a custom sending domain is verified).
export const sendBookingEmail = async ({ to, subject, html }) => {
  if (!to) return false;
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, html },
    });
    if (error) {
      console.error('Email send error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
};

export const updateUserProfile = async (userId, updates) => {
  const { data, error } = await supabase.from('users').update(updates).eq('id', userId).select().single();
  if (error) console.error('Error updating profile:', error.message);
  return data;
};

// ── PASSWORDLESS EMAIL LOGIN (OTP) ───────────────────────────────
// No passwords, no separate signup form: a customer verifying a 6-digit
// code IS the entire account-creation step. shouldCreateUser: true means
// a brand-new email silently gets an account the moment it's verified —
// getOrCreateUser (above) already runs on every auth state change and
// will create the matching row in `users`, picking up `full_name` from
// the metadata passed here. Returning customers verifying an email that
// already has an account just get signed into that same account — same
// call, no branching needed on the frontend for "new vs returning".
export const sendEmailOtp = async (email, metadata) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: metadata, // e.g. { full_name: "Abner Martinez" } — only applied when the account is first created
    },
  });
  if (error) console.error('Error sending email OTP:', error.message);
  return { error };
};

// ── WEB PUSH NOTIFICATIONS ───────────────────────────────────────
// Stores the browser's PushSubscription so the send-booking-push Edge
// Function (triggered by a Database Webhook on bookings INSERT) knows
// where to deliver it. onConflict on endpoint so re-subscribing on the
// same device/browser (e.g. after clearing the old one) just updates the
// row instead of creating a duplicate.
export const savePushSubscription = async (userId, subscription) => {
  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' }
  );
  if (error) console.error('Error saving push subscription:', error.message);
  return { error };
};

export const deletePushSubscription = async (endpoint) => {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) console.error('Error deleting push subscription:', error.message);
  return { error };
};

export const verifyEmailOtp = async (email, token) => {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) console.error('Error verifying email OTP:', error.message);
  return { data, error };
};

// ── PAYMENT METHOD HELPERS ───────────────────────────────────────

export const getPaymentMethods = async (providerId) => {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: true });
  if (error) console.error('Error loading payment methods:', error.message);
  return data || [];
};

export const addPaymentMethod = async (method) => {
  const { data, error } = await supabase
    .from('payment_methods')
    .insert(method)
    .select()
    .single();
  if (error) { console.error('Error adding payment method:', error.message); return null; }
  return data;
};

export const deletePaymentMethod = async (id) => {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id);
  if (error) { console.error('Error deleting payment method:', error.message); return false; }
  return true;
};


// ── ADMIN HELPERS ─────────────────────────────────────────────────

// Goes through the is_current_user_admin() RPC (security definer, checks
// the caller's own JWT email against the admins table server-side) rather
// than querying the admins table directly. A direct .from('admins').select()
// depends on a public SELECT policy existing on that table — if RLS blocks
// it, this silently comes back empty instead of erroring, so real admins
// would never be recognized. The RPC sidesteps that entirely and also
// case-normalizes the email, matching how set_maintenance_mode/
// set_site_offline already check admin status. See
// supabase_admin_check_fix.sql. (The email param is kept for compatibility
// with existing call sites, but the RPC only ever checks whoever is
// currently signed in — every caller already passes their own email.)
export const checkIsAdmin = async (email) => {
  if (!email) return false;
  const { data, error } = await supabase.rpc('is_current_user_admin');
  if (error) { console.error('Admin check error:', error.message); return false; }
  return !!data;
};

// ── MAINTENANCE MODE (emergency pause switch — see supabase_security_hardening.sql) ──

// Public read — no auth required, so a signed-out visitor sees the banner
// too. Fails "open" (mode off) if the row can't be read, so a transient
// error here never itself locks the site.
export const getMaintenanceStatus = async () => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('maintenance_mode, maintenance_message')
    .eq('id', true)
    .maybeSingle();
  if (error) { console.error('Error checking maintenance mode:', error.message); return { on: false, message: '' }; }
  return { on: !!data?.maintenance_mode, message: data?.maintenance_message || '' };
};

// Admin-only — the RPC re-checks admin status server-side regardless of
// what the client believes.
export const setMaintenanceMode = async (on, message) => {
  const { error } = await supabase.rpc('set_maintenance_mode', { p_on: on, p_message: message || null });
  if (error) { console.error('Error setting maintenance mode:', error.message); return false; }
  return true;
};

// ── SITE OFFLINE (full-site takeover for planned changes — see
// supabase_site_offline.sql). Different from maintenance mode above: this
// one hides the whole site behind a "we'll be back shortly" page for
// everyone except a signed-in admin, instead of just pausing new writes. ──

export const getSiteOfflineStatus = async () => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('site_offline, site_offline_message')
    .eq('id', true)
    .maybeSingle();
  if (error) { console.error('Error checking site offline status:', error.message); return { on: false, message: '' }; }
  return { on: !!data?.site_offline, message: data?.site_offline_message || '' };
};

export const setSiteOffline = async (on, message) => {
  const { error } = await supabase.rpc('set_site_offline', { p_on: on, p_message: message || null });
  if (error) { console.error('Error setting site offline mode:', error.message); return false; }
  return true;
};

export const submitProviderApplication = async (application) => {
  // Deliberately a plain insert with no .select() — this form is reachable
  // by anyone who hasn't signed in yet, and Postgres RLS treats "hand back
  // the inserted row" (RETURNING) as a read, which requires a SELECT policy
  // in addition to the INSERT policy. There's intentionally no public SELECT
  // policy on provider_applications (that would let anyone read every
  // applicant's email/phone), so requesting the row back made every
  // anonymous submission fail with a misleading RLS error. The caller only
  // checks success/failure, so we don't need the row back at all.
  const { error } = await supabase
    .from('provider_applications')
    .insert(application);
  if (error) {
    throwKnownGuardErrors(error);
    console.error('Error submitting application:', error.message);
    return false;
  }
  return true;
};

export const getProviderApplications = async () => {
  const { data, error } = await supabase
    .from('provider_applications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching applications:', error.message); return []; }
  return data || [];
};

// "Velvet Rope" trial logic: trial_start_date/trial_end_date are stamped
// here, and ONLY here — the moment an admin actually flips an application
// to "active" (the "Activate" button in AdminPortal). Signing up never sets
// them, so a pending applicant has no trial clock running before they're
// approved. If an application is ever reset back to "pending" (the "Reset"
// button), the dates are cleared, so a later re-activation starts a fresh
// 14-day window instead of resuming a stale one.
export const updateApplicationStatus = async (id, status) => {
  const patch = { status };
  if (status === 'active') {
    const start = new Date();
    const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    patch.trial_start_date = start.toISOString();
    patch.trial_end_date = end.toISOString();
  } else if (status === 'pending') {
    patch.trial_start_date = null;
    patch.trial_end_date = null;
  }
  const { data, error } = await supabase
    .from('provider_applications')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('Error updating application:', error.message); return null; }
  return data;
};

// Looks up the most recent *active* application submitted with this email.
// Used to auto-create a provider_profiles row the first time that person
// signs in, since applications are submitted before the applicant has an
// account and activation alone doesn't create their provider profile.
export const getActiveApplicationByEmail = async (email) => {
  if (!email) return null;
  // Case-insensitive on purpose: the application's email was typed by hand
  // on a form (could be "John@Gmail.com"), while this is looked up against
  // the exact-case email Google hands back on sign-in ("john@gmail.com").
  // An exact match here silently stranded anyone whose casing didn't line
  // up — approved, but never able to actually reach their portal.
  // ilike is a PATTERN match, so % and _ in the address would act as
  // wildcards — and _ is perfectly legal in an email local part. Escaping
  // them keeps this a plain case-insensitive comparison, so
  // "john_doe@gmail.com" can't match an application for "johnXdoe@gmail.com".
  const normalized = String(email).trim().replace(/([\\%_])/g, '\\$1');
  const { data, error } = await supabase
    .from('provider_applications')
    .select('*')
    .ilike('email', normalized)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('Error fetching application by email:', error.message); return null; }
  return data;
};

// ── NOTIFICATION HELPERS ─────────────────────────────────────────

// Plain insert with no .select(): the row belongs to the OTHER party, and
// RLS treats RETURNING as a read, so asking for it back always failed the
// notifications SELECT policy and logged an error on every send. No caller
// needs the row.
export const createNotification = async ({ user_id, title, body, type, booking_id }) => {
  if (!user_id) return false;
  const { error } = await supabase
    .from('notifications')
    .insert({ user_id, title, body: body || null, type: type || null, booking_id: booking_id || null });
  if (error) { console.error('Error creating notification:', error.message); return false; }
  return true;
};

export const getNotifications = async (userId) => {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { console.error('Error loading notifications:', error.message); return []; }
  return data || [];
};

export const markNotificationRead = async (id) => {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) console.error('Error marking notification read:', error.message);
};

export const markAllNotificationsRead = async (userId) => {
  if (!userId) return;
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) console.error('Error marking all notifications read:', error.message);
};

// ── LANDING PAGE: LIVE STATS ─────────────────────────────────────
// Real counts for the landing page stats bar (replaces the old hardcoded
// "2,400+ bookings / 180+ providers" placeholders).
export const getLandingStats = async () => {
  const [bookingsRes, providersRes, districtsRes, ratingsRes] = await Promise.all([
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('provider_profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('provider_profiles').select('district').eq('is_active', true),
    supabase.from('reviews').select('rating'),
  ]);
  if (bookingsRes.error) console.error(bookingsRes.error.message);
  if (providersRes.error) console.error(providersRes.error.message);
  if (districtsRes.error) console.error(districtsRes.error.message);
  if (ratingsRes.error) console.error(ratingsRes.error.message);

  const districts = new Set((districtsRes.data || []).map((d) => d.district).filter(Boolean)).size;
  const ratings = (ratingsRes.data || []).map((r) => r.rating).filter((r) => r != null);
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  return {
    bookingsCompleted: bookingsRes.count || 0,
    activeProviders: providersRes.count || 0,
    districts,
    avgRating,
    reviewCount: ratings.length,
  };
};

// ── LANDING PAGE: RECOMMENDED SERVICES ───────────────────────────
// Ranks providers by average review rating (2+ reviews, so a single 5-star
// review can't dominate) and returns one representative service per
// top provider for the landing page "Recommended for you" rail.
export const getRecommendedServices = async (limit = 6) => {
  const { data: reviews, error: rErr } = await supabase.from('reviews').select('provider_id, rating');
  if (rErr) { console.error(rErr.message); return []; }

  const byProvider = {};
  (reviews || []).forEach((r) => {
    if (!r.provider_id || r.rating == null) return;
    if (!byProvider[r.provider_id]) byProvider[r.provider_id] = { sum: 0, count: 0 };
    byProvider[r.provider_id].sum += r.rating;
    byProvider[r.provider_id].count += 1;
  });

  const ranked = Object.entries(byProvider)
    .map(([id, v]) => ({ id, avg: v.sum / v.count, count: v.count }))
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const { data: providers, error: pErr } = await supabase
    .from('provider_profiles')
    .select('id, business_name, service_type, district, is_active, services(id, name, price, duration_min)')
    .in('id', ranked.map((p) => p.id))
    .eq('is_active', true);
  if (pErr) { console.error(pErr.message); return []; }

  const toArray = (v) => (v ? (Array.isArray(v) ? v : [v]) : []);
  const metaById = Object.fromEntries(ranked.map((p) => [p.id, p]));

  return ranked
    .map((r) => providers?.find((p) => p.id === r.id))
    .filter(Boolean)
    .flatMap((p) => {
      const svc = toArray(p.services)[0];
      if (!svc) return [];
      const m = metaById[p.id];
      return [{
        provider_id: p.id,
        business_name: p.business_name,
        service_type: p.service_type,
        district: p.district,
        service_id: svc.id,
        service_name: svc.name,
        price: svc.price,
        duration_min: svc.duration_min,
        rating: Math.round(m.avg * 10) / 10,
        reviewCount: m.count,
      }];
    });
};

// ── BUSINESS CATEGORIES & FEATURE FLAGS ──────────────────────────
// Reads from the tables created by supabase_feature_flags.sql
// (business_categories / feature_flags / category_default_features /
// provider_feature_overrides). See App.jsx for BUSINESS_CATEGORIES /
// INDUSTRY_FEATURE_CATALOG, the client-side mirror used for UI labels.
export const getCategoryDefaultFeatures = async (categoryKey) => {
  if (!categoryKey) return [];
  const { data, error } = await supabase
    .from('category_default_features')
    .select('feature_key')
    .eq('category_key', categoryKey);
  if (error) { console.error(error.message); return []; }
  return (data || []).map((r) => r.feature_key);
};

export const getProviderFeatureOverrides = async (providerId) => {
  if (!providerId) return {};
  const { data, error } = await supabase
    .from('provider_feature_overrides')
    .select('feature_key, enabled')
    .eq('provider_id', providerId);
  if (error) { console.error(error.message); return {}; }
  const out = {};
  (data || []).forEach((r) => { out[r.feature_key] = r.enabled; });
  return out;
};

export const setProviderFeatureOverride = async (providerId, featureKey, enabled) => {
  if (!providerId) return false;
  const { error } = await supabase
    .from('provider_feature_overrides')
    .upsert({ provider_id: providerId, feature_key: featureKey, enabled }, { onConflict: 'provider_id,feature_key' });
  if (error) { console.error(error.message); return false; }
  return true;
};

// ── VISIT NOTES (SOAP charting module) ───────────────────────────
// Gated behind the `soap_charting` feature flag — see VisitNotesButton
// in App.jsx. One note per booking.
export const getVisitNotes = async (bookingId) => {
  if (!bookingId) return null;
  const { data, error } = await supabase
    .from('visit_notes')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) { console.error(error.message); return null; }
  return data;
};

export const upsertVisitNote = async (note) => {
  const { error } = await supabase
    .from('visit_notes')
    .upsert(note, { onConflict: 'booking_id' });
  if (error) { console.error(error.message); return false; }
  return true;
};

// ── ADMIN: PROVIDER MANAGEMENT ────────────────────────────────────
// Every admin-mutating action here goes through a SECURITY DEFINER RPC
// that checks the caller's email against the `admins` table server-side
// (see supabase_admin_provider_management.sql) — enforced in the
// database, not just hidden behind a UI check.
export const adminListProviders = async () => {
  const { data, error } = await supabase.rpc('admin_list_providers');
  if (error) { console.error('Error listing providers:', error.message); return []; }
  return data || [];
};

// Pass only the fields you want to change — omitted/undefined fields are
// left as-is server-side (the RPC coalesces nulls against current values).
export const adminUpdateProvider = async (providerId, updates) => {
  const { data, error } = await supabase.rpc('admin_update_provider', {
    p_provider_id: providerId,
    p_business_name: updates.business_name ?? null,
    p_district: updates.district ?? null,
    p_service_type: updates.service_type ?? null,
    p_category_key: updates.category_key ?? null,
    p_whatsapp: updates.whatsapp ?? null,
    p_bio: updates.bio ?? null,
    p_plan: updates.plan ?? null,
    p_is_active: updates.is_active ?? null,
  });
  if (error) { console.error('Error updating provider:', error.message); return null; }
  return data;
};

// Irreversible — deletes the provider and every row tied to them
// (services, bookings, reviews, working hours, payment methods, feature
// overrides, visit notes, VIP tags). The UI requires a confirmation step
// before calling this.
export const adminDeleteProvider = async (providerId) => {
  const { error } = await supabase.rpc('admin_delete_provider', { p_provider_id: providerId });
  if (error) { console.error('Error deleting provider:', error.message); return false; }
  return true;
};
