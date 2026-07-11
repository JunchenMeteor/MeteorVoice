-- Add secondary indexes for common query patterns.
-- These cover the most frequent lookups: sessions by user, turns by session,
-- corrections by turn, and learning history by user.

create index if not exists idx_sessions_user_id_status
  on sessions (user_id, status);

create index if not exists idx_sessions_user_id_created_at
  on sessions (user_id, created_at desc);

create index if not exists idx_turns_session_id_created_at
  on turns (session_id, created_at);

create index if not exists idx_correction_items_turn_id
  on correction_items (turn_id);

create index if not exists idx_learning_history_user_id_created_at
  on learning_history (user_id, created_at desc);

create index if not exists idx_audio_clips_owner
  on audio_clips (owner_type, owner_id);
