# Cookie Crumbler

A tiny pixel-art browser game where you click a giant cookie until it crumbles, then submit your score to a global leaderboard.

Live site: https://cookiecrumbler.lol/

## Why This Exists

Cookie Crumbler started as a single-file HTML game with a Supabase leaderboard. The first version exposed the Supabase client configuration in the browser and trusted direct client-side writes, which made the leaderboard easy to spam and allowed stored HTML injection in player names.

The current version keeps the playful frontend, but moves score handling behind Vercel serverless functions and locks down the database.

## Features

- Canvas-based pixel cookie renderer
- Click speed damage multiplier
- Global high-score leaderboard
- Server-side score validation
- Signed game-session tokens for score submissions
- Supabase/Postgres-backed score storage
- Vercel serverless API
- Content Security Policy and basic security headers
