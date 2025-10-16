# Event Scheduler – GitHub Pages + Supabase

Simple static site that lets a user click their name and view the events they are in. Backed by Supabase. Security is intentionally permissive for quick setup.

## Files

- `index.html` – page shell
- `styles.css` – lightweight styling
- `config.js` – place your Supabase URL and anon key
- `app.js` – loads users, lets you pick one, shows their events
- `.nojekyll` – ensures Pages serves files as-is

## Quick start

1. Create a Supabase project.
2. In `config.js`, set:
   - `SUPABASE_URL = 'https://YOUR-REF.supabase.co'`
   - `SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY'`
3. Push to `main` on this repo (GitHub Pages serves from `main` for org/user pages).
4. Open `https://<your-username>.github.io/`.

## Expected schema

Tables (minimum columns used by the UI):

- `users`
  - `id` (bigint identity)
  - `created_at` (timestamptz)
  - `name` (text)
- `events`
  - `id` (bigint identity)
  - `created_at` (timestamptz)
  - `name` (text)
  - `type` (text)
  - `min_participants` (int)
- `event_members`
  - `user` → `users.id`
  - `event` → `events.id`
  - `required` (boolean)

Foreign keys should be set so that a join from `event_members(event)` to `events(id)` works.

## Row Level Security (public read)

If you want the site to work without auth, enable RLS and create permissive read policies:

```sql
-- users: public read
create policy "Public read users" on users
for select using (true);

-- events: public read
create policy "Public read events" on events
for select using (true);

-- event_members: public read
create policy "Public read event_members" on event_members
for select using (true);
```

If RLS is disabled entirely, reads may still work depending on your project settings, but enabling RLS with explicit public-read policies is recommended for clarity.

## How it works

- Loads `users` and renders chips. Clicking a chip sets `?user=<id>` and localStorage, then queries `event_members` joined to `events`.
- Events are sorted by `start_time` and displayed as cards.

## Customizing

- Rename `title` vs `name`: adjust the selection in `app.js`.
- Additional fields: extend the select list and the card UI.
- Filtering or grouping: add query parameters and client-side filters.

## Local testing

You can open `index.html` directly, but some browsers restrict `module` imports from `file://`. Use a simple local server:

```bash
npx serve .
```

Then browse to `http://localhost:3000`.

## Roadmap (next steps)

- Add scheduling/assignment logic and write operations
- Add lightweight auth (optional) or admin-only writes
- Realtime updates via Supabase channel subscriptions
