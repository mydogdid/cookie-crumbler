-- Run this in the Supabase SQL editor to allow high-score submissions up to
-- the same 50 clicks-per-second cap enforced by the Vercel API.

alter table public.scores
  drop constraint if exists scores_realistic_rate_check;

alter table public.scores
  add constraint scores_realistic_rate_check
  check (clicks / (time_ms::numeric / 1000) <= 50);
