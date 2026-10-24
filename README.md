# calorieTracker

Read-only history website for the Daily Nutrition Tracker desktop app. It shows the entries the app syncs to Supabase,
styled to match the app's History & averages page.

Built with React, TypeScript and [Mantine](https://mantine.dev). GitHub Actions builds it and deploys it to GitHub Pages
on every push to `main`.

## Development

```
npm install
npm run dev
npm run build
```

The Supabase project URL and publishable key live in `src/supabase.ts`. The publishable key is meant for browsers;
row-level security means each account can only read its own entries.
