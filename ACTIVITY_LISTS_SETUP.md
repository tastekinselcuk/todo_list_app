# Activity Lists (Listelerim) — Setup

## 1. Database

Run `supabase/migrations/activity_items.sql` in the Supabase SQL Editor.

## 2. API keys

### Movies & Series — TMDB (required for film/dizi search)

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/settings/api)
2. Request an API key (API Read Access / v3 key)
3. Add to `.env` or `.env.local`:

```
VITE_TMDB_API_KEY=your_tmdb_v3_key_here
```

4. Restart the Vite dev server.

### Books — Open Library

No API key. Uses `https://openlibrary.org/search.json`.

### Places — Photon (Komoot) + Wikipedia thumbs

No API key. Uses `https://photon.komoot.io` for geocoding. Cover images are best-effort via Wikipedia; cards fall back to a styled placeholder when none is found.

## 3. Enable the module

Workspace Settings → activate **Listelerim / My Lists** (`activities`).

New accounts get it in `defaultModules`. Existing users may need to toggle it on once.
