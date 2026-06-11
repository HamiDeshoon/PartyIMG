# Deployment Guide

## Prerequisites
- Node.js 18+
- npm or pnpm

## Building
1. Run `npm install`
2. Run `npm run build`
   This uses Vite to build the frontend to `./dist` and esbuild to package the backend to `./dist/server.cjs`.

## Local / Standard Host Setup
We use SQLite as the database and local disk for uploads. 

1. Create a `.env` file from `.env.example`
2. Add a `SESSION_SECRET` (at least 32 characters)
3. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD`
4. Make sure port 3000 is open.
5. `npm run start`

## Cloud Run Deployment (Google Cloud)
1. Set the port to 3000.
2. Ensure you have mapped a Volume to `/app/uploads` and `/app/database.sqlite` if you want persistent storage, because Cloud Run instances are ephemeral.

## Cloudflare Setup (Experimental Migration)
Refer to `cloudflare-audit.md` and the abstracted storage/database layers. Configuration is controlled via:
- `USE_R2=true`
- `USE_D1=true`
*(Full Cloudflare natively requires switching the runner from Node to `wrangler` and removing some native modules).*
