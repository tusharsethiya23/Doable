# Deploying Doable

Doable runs as **one web service**: the Express API also serves the built React app. Everything is on one domain, which means first-party login cookies, no CORS setup, and live streams that work reliably. You need:

| Service | What it's for | Cost |
|---|---|---|
| **GitHub** | Code + automatic tests (GitHub Actions) | Free |
| **MongoDB Atlas** | Production database | Free (M0) |
| **Render** | Runs the app | Starter $7/month (recommended), or Free with a caveat (see step 4) |
| **Anthropic** | Claude API | Pay per use (capped per user by `USER_MONTHLY_BUDGET_USD`) |
| **Google Cloud** | Gmail + Calendar access | Free |

Allow about 30–45 minutes for the first deploy.

---

## 1. Push to GitHub
The repo already contains `render.yaml`, `Dockerfile` and `.github/workflows/ci.yml`. Push to `main`. The **Actions** tab should show the **CI** workflow running the tests and finishing green ✅.

## 2. Create the database (MongoDB Atlas)
1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a free **M0** cluster. Pick a region close to your Render region.
2. Go to **Database Access → Add user**. Choose a username and generate a strong password.
3. Go to **Network Access → Add IP → `0.0.0.0/0`**. Render's IP addresses change, so the app needs to be allowed from anywhere; the database password is still required.
4. Go to **Connect → Drivers** and copy the connection string. Add the database name `doable` before the `?`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/doable?retryWrites=true&w=majority
   ```

## 3. Prepare secrets
Run this on your computer to create the token encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
**Save this key in a password manager.** If it's lost or changed, nobody's saved Google connection can be read any more, and every user would have to reconnect.

Also get an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys). Set a **spend limit** on that console as a second safety net.

## 4. Deploy on Render
1. On Render, choose **New → Blueprint**, connect your GitHub repo, and select it. Render reads `render.yaml`.
2. Fill in the values it asks for:

| Variable | Value |
|---|---|
| `MONGO_URI` | the Atlas string from step 2 |
| `CLIENT_URL` | `https://<service-name>.onrender.com`. Render shows the URL; you can fix it after the first deploy |
| `ANTHROPIC_API_KEY` | your key |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud (step 5) |
| `GOOGLE_REDIRECT_URI` | `https://<service-name>.onrender.com/api/integrations/google/callback` |
| `TOKEN_ENCRYPTION_KEY` | the key from step 3 |
| `ADMIN_EMAILS` | your email |

   Render generates `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` for you.
3. Click **Apply**. The first build takes a few minutes. When it's done, open `https://<service-name>.onrender.com/api/health`; you should see `"status":"ok"`.
4. **Check the logs.** Lines starting with `⚠️ [production]` point out settings that still need fixing, for example a `CLIENT_URL` that still says localhost.

> **Free plan vs Starter:** the free plan *sleeps after 15 minutes without traffic*. While it sleeps, **reminders and scheduled tasks don't run**, and the first visit after sleeping takes about 50 seconds.
> - `render.yaml` uses `plan: free`. Add a free uptime monitor (for example UptimeRobot) that pings `/api/health` every 5 minutes to keep the app awake. The free plan's 750 hours per month is enough for one always-on service.
> - For reliable production use, change it to `plan: starter` ($7/month).

**Optional settings:**
- In Render, set **Settings → Auto-Deploy → "After CI checks pass"**, so a commit that fails the tests is never deployed.
- Add a custom domain under **Settings → Custom Domains**. If you do, update `CLIENT_URL`, `GOOGLE_REDIRECT_URI` and Google Cloud to match.

## 5. Google Cloud for production
Follow [GOOGLE_SETUP.md](GOOGLE_SETUP.md), then:
1. Go to **Credentials** and open your OAuth client. Under **Authorized redirect URIs**, add:
   `https://<service-name>.onrender.com/api/integrations/google/callback`
   (Keep the localhost one too for development.)
2. **Publishing status:**
   - **Testing** (fine for personal use, a portfolio or a demo): up to 100 listed test users. Google sign-ins expire after **7 days**, so users click **Reconnect** in Settings once a week.
   - **In production** (open to anyone): Gmail scopes are *restricted*, so Google requires app verification and an annual third-party security assessment. Plan for weeks of work and possibly fees before opening Gmail access to the public.

## 6. First login
Open your URL and **register with the email you put in `ADMIN_EMAILS`**. That account becomes an admin automatically, and **Admin** appears in the sidebar.

## 7. Smoke test (5 minutes)
- [ ] Register and log in, refresh the page, and check you stay logged in.
- [ ] Ask "What time is it?". You should see the tool chip and get an answer.
- [ ] Go to **Settings → Connect Google**. You should come back with "Google connected!".
- [ ] Ask "Any unread emails?" and get a summary.
- [ ] Ask "Email me@… saying hello". An approval card should appear; approve it and check the email arrives.
- [ ] Ask "Remind me in 2 minutes to stretch". A pop-up should appear 2 minutes later.
- [ ] Check that **Admin** shows your usage and the messages chart.

---

## Production checklist
- [ ] `NODE_ENV=production`, so cookies are `Secure` and detailed error messages are hidden.
- [ ] `CLIENT_URL` and `GOOGLE_REDIRECT_URI` use your real `https://` domain.
- [ ] Strong, unique JWT secrets (Render generates them).
- [ ] `TOKEN_ENCRYPTION_KEY` is backed up somewhere safe.
- [ ] An Atlas database user with a strong password, used only by this app.
- [ ] A spend limit is set in the Anthropic console, and `USER_MONTHLY_BUDGET_USD` is set to what you're willing to pay per user.
- [ ] `ADMIN_EMAILS` contains only your email(s).
- [ ] CI is green, and auto-deploy waits for CI.
- [ ] No `.env` file is committed (`.gitignore` already covers this).

## Operating it
- **Logs:** Render → your service → **Logs**. Errors are logged without tokens or request bodies.
- **Updating:** push to `main`. CI runs the tests and Render redeploys. Running agent replies get up to 10 seconds to finish when the server restarts.
- **Backups:** Atlas M0 has no automatic backups. Export regularly (`mongodump`), or upgrade to a paid tier.
- **Rotating secrets:**
  - Changing the JWT secrets logs everyone out, which is safe to do.
  - **Never** change `TOKEN_ENCRYPTION_KEY`, unless you're OK with everyone reconnecting Google.
- **Scaling:** you can run more than one instance. Scheduled tasks and approvals use atomic database locks, so nothing runs twice. Live notifications, though, only reach users connected to the same instance, so stay on one instance until you add a shared message bus such as Redis.

## Other hosts (Docker)
The `Dockerfile` builds the client and runs the API on Node 22 (Alpine), as a non-root user, with a health check. It works on Railway, Fly.io, a VPS, and similar hosts:
```bash
docker build -t doable .
docker run -p 5000:5000 --env-file server/.env -e NODE_ENV=production doable
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| Build fails with `vite: not found` | Use the provided build command (`npm run build` at the repo root). It installs the client's dev dependencies. |
| `MongoServerSelectionError` | The Atlas **Network Access** list must include `0.0.0.0/0`. Also check the password inside `MONGO_URI` (URL-encode special characters). |
| Logged out on every refresh | `CLIENT_URL` must be the exact URL you open, and you must use `https://`. Only set `CROSS_SITE_COOKIES=true` if the client is hosted on a different domain. |
| Google `redirect_uri_mismatch` | The URI in Google Cloud must match `GOOGLE_REDIRECT_URI` exactly. |
| Reminders don't fire | You're on the free plan and it's sleeping. Use the Starter plan or an uptime monitor (step 4). |
| Chat says "usage limit" | The user's monthly budget is used up. Raise it in **Admin → Budget**. |
