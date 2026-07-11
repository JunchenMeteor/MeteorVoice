-- Persistent API rate limit buckets for multi-instance deployments.

create table if not exists api_rate_limits (
  bucket_key text primary key,
  request_count integer not null,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table api_rate_limits enable row level security;

create or replace function check_api_rate_limit(
  p_bucket_key text,
  p_window_ms integer,
  p_max_requests integer
)
returns table(allowed boolean, request_count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_reset_at timestamptz := v_now + make_interval(secs => p_window_ms::double precision / 1000.0);
  v_row api_rate_limits%rowtype;
begin
  if p_window_ms <= 0 or p_max_requests <= 0 then
    return query select false, 0, v_now;
    return;
  end if;

  insert into api_rate_limits as bucket (bucket_key, request_count, reset_at, updated_at)
  values (p_bucket_key, 1, v_reset_at, v_now)
  on conflict (bucket_key) do update
    set request_count = case
          when bucket.reset_at <= v_now then 1
          else bucket.request_count + 1
        end,
        reset_at = case
          when bucket.reset_at <= v_now then v_reset_at
          else bucket.reset_at
        end,
        updated_at = v_now
  returning * into v_row;

  return query select v_row.request_count <= p_max_requests, v_row.request_count, v_row.reset_at;
end;
$$;

revoke all on api_rate_limits from anon, authenticated;
grant execute on function check_api_rate_limit(text, integer, integer) to anon, authenticated;

create index if not exists idx_api_rate_limits_reset_at
  on api_rate_limits (reset_at);
