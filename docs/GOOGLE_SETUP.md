# Google setup (Gmail + Calendar)

This guide connects the app to Google so the assistant can read, draft and send email and manage calendar events. It takes about 10 minutes and is free.

> **Already set up for Gmail (Phase 4)?** Do steps 2 and 3 again: enable the **Google Calendar API** and add the `.../auth/calendar.events` scope. Then open **Settings** in the app and click **Reconnect** to grant calendar access.

## 1. Create a Google Cloud project
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project picker at the top, then **New project**. Name it (for example, "Doable") and click **Create**.
3. Make sure the new project is selected in the top bar.

## 2. Turn on the Gmail and Calendar APIs
1. Go to **APIs & Services → Library**.
2. Search for **Gmail API** and click **Enable**.
3. Search for **Google Calendar API** and click **Enable**.

## 3. Set up the consent screen
1. Go to **APIs & Services → OAuth consent screen** (shown as **Google Auth Platform** in newer consoles).
2. **User type:** choose **External**, then fill in the app name, your support email and your developer email.
3. **Scopes / Data access:** add these scopes:
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.compose`
   - `.../auth/calendar.events`
   - `openid` and `.../auth/userinfo.email`
4. **Test users / Audience:** add the Gmail addresses that will try the app, including your own.
   While the app is in **Testing**, only these accounts can connect (up to 100).

> Gmail scopes are "restricted". Testing mode is fine for development and demos. To make the app available to the public, Google requires an app verification and a security assessment.

## 4. Create OAuth credentials
1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type:** Web application.
3. **Authorized redirect URIs:** add
   `http://localhost:5173/api/integrations/google/callback`
   (In production, add `https://<your-api-domain>/api/integrations/google/callback`.)
4. Click **Create**, then copy the **Client ID** and **Client secret**.

## 5. Configure the server
Add these to `server/.env`:

```env
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:5173/api/integrations/google/callback
TOKEN_ENCRYPTION_KEY=<run the command below>
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Keep `TOKEN_ENCRYPTION_KEY` safe and don't change it.** If you lose or change it, saved Google connections can't be decrypted, and every user will have to reconnect.

Restart the server. The startup warning about Google should be gone.

## 6. Try it
1. Open the app and go to **Settings → Connected accounts → Connect Google**.
2. Pick one of your test-user accounts and allow access.
   Google may show "Google hasn't verified this app". Click **Continue**, which is expected in testing mode.
3. You're sent back to Settings with "Google connected!". In the chat, try:
   - "Do I have any unread emails?"
   - "Summarise the latest email from Amazon"
   - "Draft an email to me@example.com saying the report is ready"
   - "Email me@example.com that the report is ready". An approval card appears; click **Approve** to send.
   - "What's on my calendar tomorrow?"
   - "Find 30 minutes tomorrow afternoon and book a call with me@example.com with a Meet link"

## Troubleshooting
| Problem | Fix |
|---|---|
| `redirect_uri_mismatch` | The URI in Google Cloud must match `GOOGLE_REDIRECT_URI` exactly, including `http`/`https` and the port. |
| `access_denied` / "app is blocked" | Add your Gmail address as a test user (step 3.4). |
| "Needs reconnecting" in Settings | You revoked access, or the token expired. Click **Reconnect**. Refresh tokens for apps in Testing mode expire after 7 days. |
| "Please start the connection again from this browser" | The connection was started in a different browser, or it took more than 10 minutes. Start again. |
