-- Enable row level security for MeteorVoice tables.

alter table if exists accent_profiles enable row level security;
alter table if exists scenarios enable row level security;
alter table if exists theme_preferences enable row level security;
alter table if exists sessions enable row level security;
alter table if exists turns enable row level security;
alter table if exists correction_items enable row level security;
alter table if exists audio_clips enable row level security;
alter table if exists learning_history enable row level security;

drop policy if exists "accent_profiles_read_authenticated" on accent_profiles;
create policy "accent_profiles_read_authenticated"
  on accent_profiles for select
  to authenticated
  using (enabled = true);

drop policy if exists "scenarios_read_authenticated" on scenarios;
create policy "scenarios_read_authenticated"
  on scenarios for select
  to authenticated
  using (enabled = true);

drop policy if exists "theme_preferences_read_own" on theme_preferences;
create policy "theme_preferences_read_own"
  on theme_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "theme_preferences_write_own" on theme_preferences;
create policy "theme_preferences_write_own"
  on theme_preferences for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "sessions_read_own" on sessions;
create policy "sessions_read_own"
  on sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "sessions_insert_own" on sessions;
create policy "sessions_insert_own"
  on sessions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "sessions_update_own" on sessions;
create policy "sessions_update_own"
  on sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "sessions_delete_own" on sessions;
create policy "sessions_delete_own"
  on sessions for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "turns_read_own" on turns;
create policy "turns_read_own"
  on turns for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = turns.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "turns_write_own" on turns;
create policy "turns_write_own"
  on turns for all
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = turns.session_id
        and sessions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.sessions
      where sessions.id = turns.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "correction_items_read_own" on correction_items;
create policy "correction_items_read_own"
  on correction_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.turns
      join public.sessions on sessions.id = turns.session_id
      where turns.id = correction_items.turn_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "correction_items_write_own" on correction_items;
create policy "correction_items_write_own"
  on correction_items for all
  to authenticated
  using (
    exists (
      select 1
      from public.turns
      join public.sessions on sessions.id = turns.session_id
      where turns.id = correction_items.turn_id
        and sessions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.turns
      join public.sessions on sessions.id = turns.session_id
      where turns.id = correction_items.turn_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "audio_clips_read_own" on audio_clips;
create policy "audio_clips_read_own"
  on audio_clips for select
  to authenticated
  using (
    owner_type = 'user'
    and owner_id = auth.uid()
  );

drop policy if exists "audio_clips_write_own" on audio_clips;
create policy "audio_clips_write_own"
  on audio_clips for all
  to authenticated
  using (
    owner_type = 'user'
    and owner_id = auth.uid()
  )
  with check (
    owner_type = 'user'
    and owner_id = auth.uid()
  );

drop policy if exists "learning_history_read_own" on learning_history;
create policy "learning_history_read_own"
  on learning_history for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "learning_history_write_own" on learning_history;
create policy "learning_history_write_own"
  on learning_history for insert
  to authenticated
  with check (user_id = auth.uid());
