-- Phase 1 migration: core schema for English Conversation Coach

create table if not exists accent_profiles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  region      text,
  description text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists scenarios (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  name_zh     text,
  description text,
  description_zh text,
  difficulty  text not null default 'beginner',
  icon        text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists theme_preferences (
  user_id     uuid not null references auth.users(id) on delete cascade,
  theme_key   text not null default 'default-calm',
  ui_mode     text not null default 'auto',
  subtitle_mode text not null default 'english-only',
  updated_at  timestamptz not null default now(),
  primary key (user_id)
);

create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  scenario_id     uuid references scenarios(id) on delete set null,
  accent_profile_id uuid references accent_profiles(id) on delete set null,
  status          text not null default 'active',
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists turns (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  speaker     text not null,
  transcript  text not null,
  translated_text text,
  audio_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists correction_items (
  id              uuid primary key default gen_random_uuid(),
  turn_id         uuid not null references turns(id) on delete cascade,
  correction_type text not null,
  original_text   text not null,
  suggested_text  text,
  explanation     text,
  audio_url       text,
  severity        text not null default 'minor',
  created_at      timestamptz not null default now()
);

create table if not exists audio_clips (
  id          uuid primary key default gen_random_uuid(),
  owner_type  text not null,
  owner_id    uuid not null,
  url         text,
  duration    integer,
  created_at  timestamptz not null default now()
);

create table if not exists learning_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid references sessions(id) on delete set null,
  summary     text,
  created_at  timestamptz not null default now()
);

-- seed accent profiles
insert into accent_profiles (key, name, region, description) values
  ('british', 'British English', 'UK', 'RP and contemporary British'),
  ('american', 'General American', 'US', 'Standard American accent'),
  ('indian', 'Indian English', 'India', 'Indian English with regional influences'),
  ('australian', 'Australian English', 'Australia', 'General Australian'),
  ('singapore', 'Singapore English', 'Singapore', 'Singaporean English variation'),
  ('african', 'African English', 'Africa', 'Pan-African English influences')
on conflict (key) do nothing;

-- seed scenarios
insert into scenarios (key, name, name_zh, description, description_zh, difficulty, icon) values
  ('interview', 'Job Interview', '工作面试', 'Practice common interview questions and professional responses', '练习常见的面试问题和专业回答', 'beginner', 'briefcase'),
  ('travel', 'Travel', '旅行', 'Navigate airports, hotels, restaurants and local transport', '应对机场、酒店、餐厅和当地交通', 'beginner', 'plane'),
  ('small-talk', 'Daily Small Talk', '日常闲聊', 'Casual conversations about weather, hobbies, and daily life', '关于天气、爱好和日常生活的轻松对话', 'beginner', 'coffee'),
  ('restaurant', 'Restaurant', '餐厅', 'Order food, make reservations, and handle dining situations', '点餐、预订和处理用餐场景', 'beginner', 'utensils'),
  ('workplace', 'Workplace', '职场', 'Meetings, emails, presentations and office communication', '会议、邮件、演示和办公室交流', 'intermediate', 'building')
on conflict (key) do nothing;
