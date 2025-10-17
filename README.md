### Pathfinder-finder

A tiny static site for picking a user and marking availability on event time slots (Supabase-backed). Shows a 5‑week calendar, highlights viable slots, and lets you toggle available/unavailable with instant UI updates.

### Files

- `index.html`: Page shell and landmarks
- `styles.css`: UI styles (dark theme, chips, calendar, focus states)
- `config.js`: Your Supabase URL and anon key
- `app.js`: Loads users/events/slots; renders calendar; handles availability actions
- `.nojekyll`: Ensures GitHub Pages serves files as-is
