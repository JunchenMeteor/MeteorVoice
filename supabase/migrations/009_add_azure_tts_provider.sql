alter table theme_preferences
  drop constraint if exists theme_preferences_tts_provider_check;

alter table theme_preferences
  add constraint theme_preferences_tts_provider_check
  check (tts_provider in ('mock', 'xunfei', 'volcengine', 'tencent', 'azure'));
