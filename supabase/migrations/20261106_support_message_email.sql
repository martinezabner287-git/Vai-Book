-- 2026-11-06: support messages also EMAIL every admin (before: only an
-- in-app bell notification + phone push, and push only reaches an admin who
-- turned push on — so a message could arrive with nobody noticing).
create or replace function public.submit_support_message(p_name text, p_contact text, p_topic text, p_message text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_key text; v_admin text; v_html text;
  esc_name text := replace(replace(replace(left(trim(p_name),120), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  esc_contact text := replace(replace(replace(left(trim(p_contact),160), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  esc_topic text := replace(replace(replace(left(coalesce(nullif(trim(p_topic),''),'general'),40), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  esc_msg text := replace(replace(replace(replace(left(trim(p_message),4000), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n', '<br>');
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_contact),'') = '' or char_length(coalesce(trim(p_message),'')) < 5 then
    raise exception 'MISSING_FIELDS';
  end if;
  v_key := coalesce(auth.uid()::text, lower(trim(p_contact)));
  perform enforce_rate_limit('support_message', v_key, 5, interval '1 hour');
  insert into support_messages (user_id, name, contact, topic, message)
  values (auth.uid(), left(trim(p_name),120), left(trim(p_contact),160), left(coalesce(nullif(trim(p_topic),''),'general'),40), left(trim(p_message),4000));
  -- In-app bell + phone push for admins who turned push on.
  insert into notifications (user_id, title, body, type)
  select u.id, '📩 New message: ' || left(trim(p_name),60), left(trim(p_message),140), 'support'
  from users u join admins a on lower(a.email) = lower(u.email);
  -- And an email to every admin, so it's never missed.
  v_html := '<div style="font-family:Arial,sans-serif;max-width:520px">'
    || '<h2 style="color:#4C3DC4;margin:0 0 12px">New support message</h2>'
    || '<p><b>From:</b> ' || esc_name || '<br><b>Contact:</b> ' || esc_contact || '<br><b>Topic:</b> ' || esc_topic || '</p>'
    || '<div style="background:#F4F2EE;border-radius:10px;padding:14px">' || esc_msg || '</div>'
    || '<p style="color:#6C7281;font-size:13px">Reply directly to them, or see all messages at vaibook.bz → Admin → Support.</p></div>';
  for v_admin in select email from admins loop
    begin
      perform net.http_post(
        url := 'https://nvfpdkpzrtpmvmgzvdca.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer sb_publishable_zpAA2Gdcm_BJhu1D56tsTw_sBpZXiNA', 'apikey', 'sb_publishable_zpAA2Gdcm_BJhu1D56tsTw_sBpZXiNA'),
        body := jsonb_build_object('to', v_admin, 'subject', '📩 VaiBook support: ' || left(trim(p_name),60), 'html', v_html),
        timeout_milliseconds := 5000);
    exception when others then null; -- email is a bonus; never block the message
    end;
  end loop;
end $function$;
