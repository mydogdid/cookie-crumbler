-- Run this in the Supabase SQL editor after deploying the matching API change.
-- The API now treats any finish time below 0.70s as unrealistic and no longer
-- enforces a clicks-per-second cap.

alter table public.scores
  drop constraint if exists scores_realistic_rate_check;

alter table public.scores
  drop constraint if exists scores_time_ms_range_check;

alter table public.scores
  add constraint scores_time_ms_range_check
  check (time_ms between 700 and 600000);
