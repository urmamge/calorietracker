# calorieTracker

Web version of the Daily Nutrition Tracker, usable from any browser (Windows, Linux, Android, iOS). Like the desktop app
it lets you search Open Food Facts, create custom foods, log portions for any day and review your history and averages.
Everything is stored in the same Supabase `nutrition_entries` table the desktop app syncs to.

Built with React, TypeScript and [Mantine](https://mantine.dev). GitHub Actions builds it and deploys it to GitHub Pages
on every push to `main`.

## Development

```
npm install
npm run dev
npm run build
```

The Supabase project URL and publishable key live in `src/supabase.ts`. The publishable key is meant for browsers;
row-level security means each account can only read and change its own entries.

## Saved foods ("My foods")

Saved custom foods live in a `custom_foods` table so they follow you between devices. Create it once by running
[`supabase/custom_foods.sql`](supabase/custom_foods.sql) in the Supabase SQL editor. Until then, searching and logging
still work; only the My foods tab asks for the setup.

## Food search relay

Searches go to the newer Open Food Facts search service first, because it is much faster and less overloaded than the
classic API. That service sends no CORS headers, so the browser reaches it through a small Supabase Edge Function,
[`supabase/functions/off-search`](supabase/functions/off-search/index.ts), which only relays its public `search` and
`autocomplete` endpoints. Deploy it (and redeploy after changing it) with:

```
npx supabase login
npx supabase functions deploy off-search --project-ref qcowxfnoboljphfewmxu --no-verify-jwt
```

If the relay is unavailable, searches fall back to the classic API with automatic retries.
