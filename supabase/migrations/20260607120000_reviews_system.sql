-- Client reviews: record type, public submit RPCs, review_token on bookings.
-- Run in Supabase SQL Editor if db push is not linked.

alter table public.styld_site_records drop constraint if exists styld_site_records_record_type_check;

alter table public.styld_site_records add constraint styld_site_records_record_type_check
  check (
    record_type in (
      'blocked_interval',
      'booking',
      'site_setting',
      'inquiry',
      'style_cover_image',
      'review'
    )
  );

create index if not exists styld_site_records_user_reviews_idx
  on public.styld_site_records (user_id, created_at desc)
  where record_type = 'review';

create or replace function public.styld_tenant_get_review_context(
  p_subdomain text,
  p_token text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_booking public.styld_site_records%rowtype;
  v_brand text;
  v_reviews_enabled boolean := true;
  v_booking_id text;
  v_already boolean := false;
begin
  if coalesce(trim(p_subdomain), '') = '' or coalesce(trim(p_token), '') = '' then
    raise exception 'invalid request';
  end if;

  select s.user_id
    into v_user_id
  from public.styld_site_subdomains s
  where s.subdomain = lower(trim(p_subdomain))
    and s.published_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'site not found';
  end if;

  select coalesce(
    (ss.data -> 'value' ->> 'enabled')::boolean,
    (ss.data ->> 'enabled')::boolean,
    true
  )
    into v_reviews_enabled
  from public.styld_site_records ss
  where ss.user_id = v_user_id
    and ss.record_type = 'site_setting'
    and ss.record_key = 'reviews_settings'
  limit 1;

  if v_reviews_enabled is false then
    raise exception 'reviews are not accepted at this time';
  end if;

  select *
    into v_booking
  from public.styld_site_records b
  where b.user_id = v_user_id
    and b.record_type = 'booking'
    and b.data ->> 'review_token' = trim(p_token)
  limit 1;

  if v_booking.id is null then
    raise exception 'invalid or expired review link';
  end if;

  if coalesce(v_booking.data ->> 'booking_status', '') <> 'completed' then
    raise exception 'this appointment is not eligible for a review yet';
  end if;

  select coalesce(sc.data ->> 'brandName', sc.data -> 'value' ->> 'brandName', '')
    into v_brand
  from public.styld_site_records sc
  where sc.user_id = v_user_id
    and sc.record_type = 'site_setting'
    and sc.record_key = 'site_content'
  limit 1;

  v_booking_id := coalesce(v_booking.data ->> 'id', v_booking.record_key, v_booking.id::text);

  select exists (
    select 1
    from public.styld_site_records rv
    where rv.user_id = v_user_id
      and rv.record_type = 'review'
      and rv.data ->> 'booking_id' = v_booking_id
  )
    into v_already;

  return json_build_object(
    'brand_name', nullif(trim(v_brand), ''),
    'client_name', coalesce(v_booking.data ->> 'full_name', v_booking.data ->> 'client_name', ''),
    'style_name', coalesce(v_booking.data ->> 'style_name', ''),
    'already_submitted', v_already
  );
end;
$$;

create or replace function public.styld_tenant_submit_review(
  p_subdomain text,
  p_token text,
  p_rating integer,
  p_message text,
  p_client_name text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_booking public.styld_site_records%rowtype;
  v_reviews_enabled boolean := true;
  v_booking_id text;
  v_rating integer;
  v_message text;
  v_client_name text;
begin
  if coalesce(trim(p_subdomain), '') = '' or coalesce(trim(p_token), '') = '' then
    raise exception 'invalid request';
  end if;

  v_rating := greatest(1, least(5, coalesce(p_rating, 0)));
  if v_rating < 1 or v_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;

  v_message := trim(coalesce(p_message, ''));
  if length(v_message) < 3 then
    raise exception 'please share a short message about your visit';
  end if;

  v_client_name := trim(coalesce(p_client_name, ''));
  if length(v_client_name) < 2 then
    raise exception 'please enter your name';
  end if;

  select s.user_id
    into v_user_id
  from public.styld_site_subdomains s
  where s.subdomain = lower(trim(p_subdomain))
    and s.published_at is not null
  limit 1;

  if v_user_id is null then
    raise exception 'site not found';
  end if;

  select coalesce(
    (ss.data -> 'value' ->> 'enabled')::boolean,
    (ss.data ->> 'enabled')::boolean,
    true
  )
    into v_reviews_enabled
  from public.styld_site_records ss
  where ss.user_id = v_user_id
    and ss.record_type = 'site_setting'
    and ss.record_key = 'reviews_settings'
  limit 1;

  if v_reviews_enabled is false then
    raise exception 'reviews are not accepted at this time';
  end if;

  select *
    into v_booking
  from public.styld_site_records b
  where b.user_id = v_user_id
    and b.record_type = 'booking'
    and b.data ->> 'review_token' = trim(p_token)
  limit 1;

  if v_booking.id is null then
    raise exception 'invalid or expired review link';
  end if;

  if coalesce(v_booking.data ->> 'booking_status', '') <> 'completed' then
    raise exception 'this appointment is not eligible for a review yet';
  end if;

  v_booking_id := coalesce(v_booking.data ->> 'id', v_booking.record_key, v_booking.id::text);

  if exists (
    select 1
    from public.styld_site_records rv
    where rv.user_id = v_user_id
      and rv.record_type = 'review'
      and rv.data ->> 'booking_id' = v_booking_id
  ) then
    raise exception 'you have already submitted a review for this appointment';
  end if;

  insert into public.styld_site_records (user_id, record_type, data)
  values (
    v_user_id,
    'review',
    jsonb_build_object(
      'client_name', v_client_name,
      'rating', v_rating,
      'message', v_message,
      'published', true,
      'booking_id', v_booking_id,
      'source', 'client'
    )
  );

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.styld_tenant_get_review_context(text, text) to anon, authenticated;
grant execute on function public.styld_tenant_submit_review(text, text, integer, text, text) to anon, authenticated;
