# ShopKart Database Setup

ShopKart uses PostgreSQL through the `pg` driver. Neon is the recommended hosted PostgreSQL provider for Vercel deployments.

## Neon

1. Create a Neon project and copy its pooled connection string from the Neon dashboard.
2. Set `DATABASE_URL` to that connection string. Keep the password private; do not commit `.env` or paste credentials into source files.
3. The application creates its tables and indexes automatically on the first API request. Tables include users, products, categories, and invite codes.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to the Neon connection string and replace the JWT and invite-code placeholders.
3. Run `npm install`, then `npm start`.

## Vercel

Deploy the project root with Vercel Drop or the Vercel CLI. Do not deploy the nested `dist` folder. The root `server.js` is the Express entrypoint, and Vercel serves files from `public/` through its CDN.

After creating the Vercel project, add `DATABASE_URL`, `JWT_SECRET`, and `DEVELOPER_INVITE_CODE` as environment variables for each environment. Set `COOKIE_SECURE=true` for production. `PG_POOL_MAX` is optional and defaults to 5. Use a hosted PostgreSQL URL; `localhost` will not work from Vercel.

Product images currently use local disk storage and are temporary on Vercel. Configure persistent object storage before production use. Existing SQLite files are not automatically imported into PostgreSQL. The application accepts images up to 4 MB to stay below Vercel Functions' 4.5 MB request-body limit.
