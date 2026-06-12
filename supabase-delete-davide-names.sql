-- Run this in the Supabase SQL editor to remove existing blocked names.
-- It deletes DAVIDE, DAVIDEE, DAVIDE*, and common leet/punctuation variants.

delete from public.scores
where regexp_replace(
  translate(
    lower(name),
    '103@$547+',
    'ioeassatt'
  ),
  '[^a-z]',
  '',
  'g'
) like 'davide%';
