# iLabz Booking — Deploy Guide

## Step 1 — Environment Variables
In Vercel dashboard → your project → Settings → Environment Variables, add:

- `GOOGLE_CLIENT_ID` — from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — from Google Cloud Console  
- `GOOGLE_REFRESH_TOKEN` — from OAuth Playground

(Truman has all three values — do not put them in this file)

## Step 2 — Update widget URL
In `public/index.html`, find:
```js
var BACKEND_URL = 'https://ilabz-booking.vercel.app';
```
Replace with your actual Vercel URL.

## Step 3 — Paste into Squarespace
Copy everything in `public/index.html` into a Squarespace Code Block.
