alter table if exists theme_preferences
  add column if not exists selected_voice_profile_id text,
  drop column if exists default_accent_key;

create table if not exists tts_voice_profiles (
  id text primary key,
  provider text not null,
  provider_voice_id text,
  display_name text not null,
  display_name_zh text,
  description text,
  description_zh text,
  locale text not null default 'en',
  accent_key text not null default 'american',
  accent_label text,
  accent_region text,
  gender text,
  style text,
  quality_tier text,
  status text not null default 'active',
  expires_at timestamptz,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tts_voice_profiles_provider_check
    check (provider in ('mock', 'xunfei', 'volcengine', 'tencent', 'azure')),
  constraint tts_voice_profiles_locale_check
    check (locale in ('en', 'zh')),
  constraint tts_voice_profiles_gender_check
    check (gender is null or gender in ('male', 'female')),
  constraint tts_voice_profiles_quality_tier_check
    check (quality_tier is null or quality_tier in ('base', 'featured')),
  constraint tts_voice_profiles_status_check
    check (status in ('active', 'expired', 'unavailable'))
);

alter table if exists tts_voice_profiles enable row level security;

drop policy if exists "tts_voice_profiles_read" on tts_voice_profiles;
create policy "tts_voice_profiles_read"
  on tts_voice_profiles for select
  to anon, authenticated
  using (true);

insert into tts_voice_profiles
  (id, provider, provider_voice_id, display_name, display_name_zh, description, description_zh, locale, accent_key, accent_label, accent_region, gender, style, quality_tier, status, expires_at, sort_order)
values
  ('mock:browser', 'mock', null, 'Browser voice', '浏览器声音', 'Local browser speech for development.', '用于本地开发的浏览器语音。', 'en', 'american', 'American', 'US', null, 'development', null, 'active', null, 10),
  ('xunfei:x4_enus_catherine_profnews', 'xunfei', 'x4_enus_catherine_profnews', 'Catherine Professional News', 'Catherine 新闻女声', 'News-style coach voice.', '新闻风格教练声音。', 'en', 'american', 'American', 'US', 'male', 'professional news', 'featured', 'active', '2026-06-08T16:00:00.000Z', 200),
  ('xunfei:x4_enus_ryan_assist', 'xunfei', 'x4_enus_ryan_assist', 'Ryan Assistant', 'Ryan 助手女声', 'Assistant-style coach voice.', '助手风格教练声音。', 'en', 'american', 'American', 'US', 'female', 'assistant', 'featured', 'active', '2026-06-08T16:00:00.000Z', 210),
  ('xunfei:x4_lingxiaolu_en', 'xunfei', 'x4_lingxiaolu_en', 'Lingxiaolu English', '讯飞小露英语', 'Mandarin voice with English support.', '支持英语的普通话发音人。', 'zh', 'american', 'American', 'US', 'female', 'featured', 'featured', 'active', '2026-06-08T16:00:00.000Z', 220),
  ('xunfei:x4_yezi', 'xunfei', 'x4_yezi', 'Yezi', '讯飞叶子', 'Mandarin coach voice.', '普通话教练声音。', 'zh', 'american', 'American', 'US', 'female', 'featured', 'featured', 'active', null, 230),
  ('xunfei:x4_xiaoyan', 'xunfei', 'x4_xiaoyan', 'Xiaoyan', '讯飞小燕', 'Base Mandarin voice.', '基础普通话发音人。', 'zh', 'american', 'American', 'US', 'female', 'base', 'base', 'active', null, 240),
  ('xunfei:aisjiuxu', 'xunfei', 'aisjiuxu', 'Jiuxu', '讯飞许久', 'Base Mandarin male voice.', '基础普通话男声。', 'zh', 'american', 'American', 'US', 'male', 'base', 'base', 'active', null, 250),
  ('xunfei:aisjinger', 'xunfei', 'aisjinger', 'Jinger', '讯飞小婧', 'Base Mandarin female voice.', '基础普通话女声。', 'zh', 'american', 'American', 'US', 'female', 'base', 'base', 'active', null, 260),
  ('xunfei:aisbabyxu', 'xunfei', 'aisbabyxu', 'Baby Xu', '讯飞许小宝', 'Base Mandarin child voice.', '基础普通话童声。', 'zh', 'american', 'American', 'US', 'male', 'base', 'base', 'active', null, 270)
on conflict (id) do update set
  provider = excluded.provider,
  provider_voice_id = excluded.provider_voice_id,
  display_name = excluded.display_name,
  display_name_zh = excluded.display_name_zh,
  description = excluded.description,
  description_zh = excluded.description_zh,
  locale = excluded.locale,
  accent_key = excluded.accent_key,
  accent_label = excluded.accent_label,
  accent_region = excluded.accent_region,
  gender = excluded.gender,
  style = excluded.style,
  quality_tier = excluded.quality_tier,
  status = excluded.status,
  expires_at = excluded.expires_at,
  sort_order = excluded.sort_order,
  updated_at = now();
