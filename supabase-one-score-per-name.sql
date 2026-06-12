-- Optional cleanup for existing leaderboard rows.
-- Keeps each name's best existing time, then prevents future duplicate names
-- if you later switch the API to a database upsert.

with ranked as (
  select
    id,
    row_number() over (
      partition by name
      order by time_ms asc, clicks asc, created_at asc, id asc
    ) as row_num
  from public.scores
)
delete from public.scores scores
using ranked
where scores.id = ranked.id
  and ranked.row_num > 1;

alter table public.scores
  drop constraint if exists scores_name_unique;

alter table public.scores
  add constraint scores_name_unique unique (name);
