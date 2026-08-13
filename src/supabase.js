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
  return data || [];
};

export const upsertWorkingHours = async (providerId, days) => {
  const rows = days.map((d) => ({
    provider_id: providerId,
    day_of_week: d.day_of_week,
    is_open: d.is_open,
    start_time: d.start_time,
    end_time: d.end_time,
  }));
  const { data, error } = await supabase
    .from('working_hours')
    .upsert(rows, { onConflict: 'provider_id,day_of_week' })
    .select();
  if (error) console.error('Error saving working hours:', error.message);
  return data;
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

export const getCustomerBookings = async (customerId) => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, provider_profiles(id, business_name, service_type, district, whatsapp), services(name, price, duration_min), reviews(id, rating, comment)')
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
  const { data, error } = await supabase
    .from('provider_applications')
    .insert(application)
    .select()
    .single();
  if (error) { console.error('Error submitting application:', error.message); return null; }
  return data;
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
  const { data, error } = await supabase
    .from('provider_applications')
    .select('*')
    .eq('email', email)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('Error fetching application by email:', error.message); return null; }
  return data;
};
