-- 2026-11-07 APPLIED to the live database after Abner said "apply all"; verified with a rolled-back test.
-- 2026-11-06: Admin → Reviews → "Hide review" always failed with
-- "Only VaiBook admins can do this": the review-edit rule only let the
-- reviewer edit their own (still-on-hold) review, so it blocked the admin's
-- hide too. Admins may now change the moderation fields (hidden / reason /
-- when) — and only those; the review's text and stars stay exactly as written.
create or replace function public.before_review_update()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if is_current_user_admin() and (auth.uid() is null or auth.uid() <> old.customer_id
                                  or old.hold_until is null or old.hold_until <= now()) then
    new.booking_id := old.booking_id; new.customer_id := old.customer_id;
    new.provider_id := old.provider_id; new.created_at := old.created_at;
    new.rating := old.rating; new.comment := old.comment; new.hold_until := old.hold_until;
    return new;
  end if;

  if auth.uid() is null or auth.uid() <> old.customer_id then
    raise exception 'NOT_AUTHORIZED: you can only edit your own review';
  end if;

  if old.hold_until is null or old.hold_until <= now() then
    raise exception 'REVIEW_LOCKED: this review has already been published and can no longer be edited';
  end if;

  -- Only rating/comment are meant to change.
  new.booking_id := old.booking_id;
  new.customer_id := old.customer_id;
  new.provider_id := old.provider_id;
  new.created_at := old.created_at;

  if new.rating >= 3 then
    new.hold_until := null;
  else
    new.hold_until := old.hold_until;
  end if;

  return new;
end;
$function$;
