alter table theme_preferences
  add column if not exists ui_theme text not null default 'forest';
