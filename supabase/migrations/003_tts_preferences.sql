alter table theme_preferences
  add column if not exists tts_provider text not null default 'mock';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'theme_preferences_tts_provider_check'
  ) then
    alter table theme_preferences
      add constraint theme_preferences_tts_provider_check
      check (tts_provider in ('mock', 'xunfei', 'volcengine', 'tencent'));
  end if;
end $$;
