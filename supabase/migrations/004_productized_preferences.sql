alter table theme_preferences
  add column if not exists locale text not null default 'en',
  add column if not exists default_scenario_key text not null default 'small-talk',
  add column if not exists default_accent_key text not null default 'american',
  add column if not exists tts_speed numeric not null default 1.0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'theme_preferences_locale_check'
  ) then
    alter table theme_preferences
      add constraint theme_preferences_locale_check
      check (locale in ('en', 'zh'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'theme_preferences_tts_speed_check'
  ) then
    alter table theme_preferences
      add constraint theme_preferences_tts_speed_check
      check (tts_speed >= 0.7 and tts_speed <= 1.3);
  end if;
end $$;
