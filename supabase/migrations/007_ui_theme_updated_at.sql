alter table theme_preferences
  add column if not exists ui_theme_updated_at timestamptz not null default now();
