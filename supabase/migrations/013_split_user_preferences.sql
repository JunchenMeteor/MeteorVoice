create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tts_provider text not null default 'mock',
  locale text not null default 'en',
  default_scenario_key text not null default 'small-talk',
  tts_speed numeric not null default 1.0,
  tts_voice_id text,
  selected_voice_profile_id text,
  updated_at timestamptz not null default now(),
  constraint user_preferences_tts_provider_check
    check (tts_provider in ('mock', 'xunfei', 'volcengine', 'tencent', 'azure')),
  constraint user_preferences_locale_check
    check (locale in ('en', 'zh')),
  constraint user_preferences_tts_speed_check
    check (tts_speed >= 0.7 and tts_speed <= 1.3)
);

insert into user_preferences (
  user_id,
  tts_provider,
  locale,
  default_scenario_key,
  tts_speed,
  tts_voice_id,
  selected_voice_profile_id,
  updated_at
)
select
  user_id,
  tts_provider,
  locale,
  default_scenario_key,
  tts_speed,
  tts_voice_id,
  selected_voice_profile_id,
  updated_at
from theme_preferences
on conflict (user_id) do update set
  tts_provider = excluded.tts_provider,
  locale = excluded.locale,
  default_scenario_key = excluded.default_scenario_key,
  tts_speed = excluded.tts_speed,
  tts_voice_id = excluded.tts_voice_id,
  selected_voice_profile_id = excluded.selected_voice_profile_id,
  updated_at = excluded.updated_at;

alter table if exists user_preferences enable row level security;

drop policy if exists "user_preferences_read_own" on user_preferences;
create policy "user_preferences_read_own"
  on user_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_preferences_write_own" on user_preferences;
create policy "user_preferences_write_own"
  on user_preferences for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
