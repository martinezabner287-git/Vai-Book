import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nvfpdkpzrtpmvmgzvdca.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zpAA2Gdcm_BJhu1D56tsTw_sBpZXiNA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── AUTH HELPERS ─────────────────────────────────────────────────

export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
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

// ── USER HELPERS ─────────────────────────────────────────────────

export const getOrCreateUser = async (authUser) => {
  // Check if user profile exists
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (existing) return existing;

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

export const getProviderProfile = async (userId) => {
  const { data, error } = await supabase
    .from('provider_profiles')
    .select('*, services(*), working_hours(*)')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') console.error(error.message);
  return data;
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

export const getActiveProviders = async (filters = {}) => {
  let query = supabase
    .from('provider_profiles')
    .select('*, services(*), reviews(rating)')
    .eq('is_active', true);

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
// out already-taken slots on the booking calendar.
export const getProviderBusyWindows = async (providerId, dateStr) => {
  const { data, error } = await supabase
    .rpc('get_busy_windows', { p_provider_id: providerId, p_date: dateStr });
  if (error) { console.error('Error fetching busy windows:', error.message); return []; }
  return data || [];
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
    if (error.message && error.message.includes('SLOT_TAKEN')) {
      const err = new Error('SLOT_TAKEN');
      err.code = 'SLOT_TAKEN';
      throw err;
    }
    console.error('Error creating booking:', error.message);
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
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
  if (error) { console.error('Error adding walk-in booking:', error.message); return null; }
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
    .select('*, provider_profiles(id, user_id, business_name, service_type, district, latitude, longitude, location_label, whatsapp, payment_methods(id, type, name, account_name, account_number)), services(name, price, duration_min), reviews(id, rating, comment)')
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
    .select('*, users(full_name, email, avatar_url), services(name, price)')
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
  const path = `receipts/${bookingId}/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('vaibook')
    .upload(path, file);
  if (uploadError) { console.error(uploadError.message); return null; }

  const { data: { publicUrl } } = supabase.storage
    .from('vaibook')
    .getPublicUrl(path);

  await supabase
    .from('bookings')
    .update({ receipt_url: publicUrl, payment_status: 'receipt_uploaded' })
    .eq('id', bookingId);

  return publicUrl;
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
  if (error) { console.error('Error sending message:', error.message); return false; }
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
  if (error) console.error(error.message);
  return data;
};

export const getProviderReviews = async (providerId) => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, users(full_name, avatar_url)')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) console.error(error.message);
  return data || [];
};

// ── VIP HELPERS ──────────────────────────────────────────────────

export const tagVIP = async (providerId, customerId) => {
  const { error } = await supabase
    .from('vip_clients')
    .upsert({ provider_id: providerId, customer_id: customerId });
  if (error) console.error(error.message);
};

export const getVIPClients = async (providerId) => {
  const { data, error } = await supabase
    .from('vip_clients')
    .select('*, users(full_name, email, avatar_url)')
    .eq('provider_id', providerId);
  if (error) console.error(error.message);
  return data || [];
};

export const untagVIP = async (providerId, customerId) => {
  const { error } = await supabase
    .from('vip_clients')
    .delete()
    .eq('provider_id', providerId)
    .eq('customer_id', customerId);
  if (error) { console.error('Error removing VIP tag:', error.message); return false; }
  return true;
};

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
  return (data || []).map((f) => f.provider_profiles).filter(Boolean);
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

export const checkIsAdmin = async (email) => {
  if (!email) return false;
  const { data, error } = await supabase
    .from('admins')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (error) { console.error('Admin check error:', error.message); return false; }
  return !!data;
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
  if (error) { console.error('Error submitting application:', error.message); return false; }
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

export const updateApplicationStatus = async (id, status) => {
  const { data, error } = await supabase
    .from('provider_applications')
    .update({ status })
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
  const normalized = String(email).trim();
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

export const createNotification = async ({ user_id, title, body, type, booking_id }) => {
  if (!user_id) return null;
  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id, title, body: body || null, type: type || null, booking_id: booking_id || null })
    .select()
    .single();
  if (error) { console.error('Error creating notification:', error.message); return null; }
  return data;
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
