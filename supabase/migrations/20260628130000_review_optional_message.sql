-- Allow empty review message (rating-only reviews).

create or replace function public.styld_tenant_submit_review(
  p_subdomain text,
  p_token text,
  p_rating integer,
  p_message text,
  p_client_name text default null,
  p_anonymous boolean default false
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
  v_booking_name text;
begin
  if coalesce(trim(p_subdomain), '') = '' or coalesce(trim(p_token), '') = '' then
    raise exception 'invalid request';
  end if;

  v_rating := greatest(1, least(5, coalesce(p_rating, 0)));
  if v_rating < 1 or v_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;

  v_message := trim(coalesce(p_message, ''));

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

  v_booking_name := trim(coalesce(v_booking.data ->> 'full_name', v_booking.data ->> 'client_name', ''));

  if coalesce(p_anonymous, false) then
    v_client_name := 'Anonymous';
  elsif length(v_booking_name) >= 2 then
    v_client_name := v_booking_name;
  else
    raise exception 'could not verify your name for this review';
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
      'source', 'client',
      'anonymous', coalesce(p_anonymous, false)
    )
  );

  return json_build_object('ok', true);
end;
$$;
