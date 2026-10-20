# Deploying the web app to Vercel

Vercel can't auto-deploy from a private organization repo on the free plan, so GitHub Actions deploys with the Vercel CLI instead (`.github/workflows/deploy-web.yml`).

| Branch | Result |
| --- | --- |
| `main` | deployed to production |
| `dev`, `staging` | tests only (CI), no deploy |

So the site changes only when `dev` is merged to `staging` and then `staging` to `main`.

The workflow does nothing until the three secrets below exist, so it never turns CI red before setup.

## One-time setup

1. Install and sign in: `npm install --global vercel`, then `vercel login`.
2. In the repo root run `vercel link`.
   - Scope: the **PrimeStar** team.
   - Link to an existing project: **No**. Project name: `primestar-hrms-portal`.
   - Code directory: **`apps/web`**.
   - This writes `.vercel/project.json` (git-ignored) with `orgId` and `projectId`.
3. Create a token at https://vercel.com/account/tokens (scope: PrimeStar).
4. In GitHub: Settings > Secrets and variables > Actions > New repository secret:
   - `VERCEL_TOKEN`: the token
   - `VERCEL_ORG_ID`: `orgId` from `.vercel/project.json`
   - `VERCEL_PROJECT_ID`: `projectId` from `.vercel/project.json`
5. In `apps/web/vercel.json`, replace `REPLACE-WITH-RENDER-API.onrender.com` with the real API address. A deploy to `main` fails while the placeholder is still there.
6. Deploy: merge into `main` (or Actions > **Deploy web** > Run workflow on `main`). The address is in the run summary: https://primestar-hrms-portal.vercel.app

## Notes
- `vercel.json` stays the single place for the build command and the `/api` rewrite.
- **Role buttons on the login page** are off in a normal build. To show them on a test deployment, add two variables in Vercel (Project > Settings > Environment Variables, environment **Production**, not sensitive): `VITE_QUICK_LOGIN=true` and `VITE_DEV_PASSWORD=<the shared dev password>`, then run **Deploy web** again. The password is written into the site's JavaScript, so anyone can read it: only for test accounts. Delete both variables and redeploy to turn it off.
- Set `APP_URL` on the API to the deployed web address, so invite emails link to the right site.
