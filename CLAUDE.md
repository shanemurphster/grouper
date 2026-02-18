# Grouper project context (read this first)

## What Grouper is
Grouper is a student group project planning app (Expo / React Native, iOS-first) using Supabase (Postgres/Auth/Edge Functions) and OpenAI Responses API.

Users create a project with:
- assignment_details (authoritative text)
- timeframe (twoDay | oneWeek | long)
- group_size (int)
- optional description + member names

AI generates:
- deliverables[]
- bundles[]: EXACTLY group_size bundles labeled Person 1..Person N
- each bundle has tasks[] with category enum, size S/M/L, effort_points 1/2/3

DB is source of truth. AI suggests structure; users claim bundles and check off tasks.

## Tech stack
- Frontend: Expo + React Native, expo-router (web dev runs at http://localhost:8081)
- Backend: Supabase Postgres + RLS + Edge Functions (Deno runtime)
- AI: OpenAI Responses API with strict JSON schema output
- Local harness: ai:test script works with manual inputs (prompt/schema/model are proven)

## Current focus (highest priority)
Fix "Create Project → Edge Function → OpenAI → Persist plan" pipeline.
Current production issue: browser CORS preflight (OPTIONS) to
/functions/v1/create-project-with-ai returns 504 Gateway Timeout, blocking POST.
Goal: make OPTIONS return instantly with correct CORS headers and ensure POST returns a JSON response (even on errors/timeouts).

## What’s already implemented
- Edge function create-project-with-ai creates project + membership rows
- debug_skip_openai flag exists to return early
- OpenAI fetch has AbortController timeout (~150s)
- step-by-step logs and trace_id concept

## Constraints
- Do not weaken security for prod.
- Dev-only shortcuts (verify_jwt=false, bypass headers) must be clearly marked and reverted.

## What to do when making changes
- Prefer minimal diffs
- Ensure all responses include CORS headers
- Add a fast /ping path for diagnostics
- Provide a test plan (DevTools Network: OPTIONS 200 → POST visible)
