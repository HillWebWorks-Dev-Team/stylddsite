-- Fix tenant unavailable-times RPC to include appointments/blocks that overlap a day,
-- not only records whose start time falls on that calendar date.
-- Run in Supabase SQL Editor if db push is not linked.

create or replace function public.styld_tenant_get_unavailable_times_for_day(
  p_subdomain text,
  p_date date
)
returns table (
  start timestamptz,
  "end" timestamptz,
  duration integer,
  kind text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tz text;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if coalesce(trim(p_subdomain), '') = '' or p_date is null then
    return;
  end if;

  select s.user_id
    into v_user_id
  from public.styld_site_subdomains s
  where s.subdomain = lower(trim(p_subdomain))
    and s.published_at is not null
  limit 1;

  if v_user_id is null then
    return;
  end if;

  v_tz := coalesce(nullif(trim(public.styld_site_timezone(v_user_id)), ''), 'America/New_York');
  v_day_start := (p_date::text || ' 00:00:00')::timestamp at time zone v_tz;
  v_day_end := ((p_date + 1)::text || ' 00:00:00')::timestamp at time zone v_tz;

  return query
  select
    b_start as start,
    b_end as "end",
    greatest(1, round(extract(epoch from (b_end - b_start)) / 60.0))::integer as duration,
    'booking'::text as kind
  from (
    select
      coalesce(
        nullif(coalesce(r.data -> 'value' ->> 'appointment_starts_at', r.data ->> 'appointment_starts_at'), '')::timestamptz,
        null
      ) as b_start,
      coalesce(
        nullif(coalesce(r.data -> 'value' ->> 'appointment_starts_at', r.data ->> 'appointment_starts_at'), '')::timestamptz,
        null
      )
      + make_interval(
          mins => greatest(
            1,
            coalesce(
              nullif(coalesce(r.data -> 'value' ->> 'duration_minutes', r.data ->> 'duration_minutes'), '')::integer,
              60
            )
          )
        ) as b_end
    from public.styld_site_records r
    where r.user_id = v_user_id
      and r.record_type = 'booking'
      and coalesce(r.data -> 'value' ->> 'booking_status', r.data ->> 'booking_status', '') not in ('cancelled', 'canceled')
  ) bookings
  where b_start is not null
    and b_start < v_day_end
    and b_end > v_day_start

  union all

  select
    blk_start as start,
    blk_end as "end",
    greatest(1, round(extract(epoch from (blk_end - blk_start)) / 60.0))::integer as duration,
    'block'::text as kind
  from (
    select
      coalesce(
        nullif(coalesce(r.data -> 'value' ->> 'starts_at', r.data ->> 'starts_at'), '')::timestamptz,
        null
      ) as blk_start,
      coalesce(
        nullif(coalesce(r.data -> 'value' ->> 'ends_at', r.data ->> 'ends_at'), '')::timestamptz,
        null
      ) as blk_end
    from public.styld_site_records r
    where r.user_id = v_user_id
      and r.record_type = 'blocked_interval'
  ) blocks
  where blk_start is not null
    and blk_end is not null
    and blk_start < v_day_end
    and blk_end > v_day_start;
end;
$$;

grant execute on function public.styld_tenant_get_unavailable_times_for_day(text, date) to anon, authenticated;
