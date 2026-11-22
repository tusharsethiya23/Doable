# Doable — AI Task Agent (MERN)

An AI assistant that answers questions **and** performs real tasks: sending emails, booking calendar events and setting reminders, with your approval on every action. Full requirements are in [docs/SRS.md](docs/SRS.md).

## Project structure
```
client/   React + Vite + Tailwind front-end
server/   Node.js + Express + MongoDB API (also serves the client in production)
docs/     SRS, Google setup and deployment guides
.github/  CI workflow
```

## Getting started

**Prerequisites:** Node.js 20+ and a MongoDB database (local install or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster).

```bash
# 1. API
cd server
npm install
cp .env.example .env        # then set MONGO_URI and the two JWT secrets
npm run dev                 # http://localhost:5000/api/health

# 2. Client (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## API (so far)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | – | Server status |
| POST | `/api/auth/register` | – | Create account |
| POST | `/api/auth/login` | – | Log in |
| POST | `/api/auth/refresh` | cookie | New access token |
| POST | `/api/auth/logout` | – | Clear session |
| GET / PATCH / DELETE | `/api/users/me` | Bearer | Profile |
| GET / POST | `/api/conversations` | Bearer | List / create chats |
| GET / PATCH / DELETE | `/api/conversations/:id` | Bearer | Get (with messages) / rename / delete |
| POST | `/api/conversations/:id/messages` | Bearer | Send a message; the agent's reply and tool progress stream back as Server-Sent Events |
| GET | `/api/activity?status=&before=` | Bearer | Log of actions the agent performed |
| GET | `/api/integrations` | Bearer | Connected accounts |
| POST | `/api/integrations/google/connect` | Bearer | Returns Google's consent URL |
| GET | `/api/integrations/google/callback` | state + cookie | OAuth callback (Google redirects here) |
| DELETE | `/api/integrations/google` | Bearer | Disconnect and revoke Google access |
| POST | `/api/actions/:id/decision` | Bearer | Approve (optionally with edited input) or reject an action |
| POST | `/api/conversations/:id/continue` | Bearer | After approvals: run approved actions and stream the rest of the reply |
| GET | `/api/tasks` | Bearer | Reminders and scheduled tasks |
| PATCH / DELETE | `/api/tasks/:id` | Bearer | Pause/resume (`{ enabled }`) or delete |
| GET | `/api/notifications` | Bearer | Latest notifications + unread count |
| POST | `/api/notifications/read` | Bearer | Mark some (`{ ids }`) or all as read |
| GET | `/api/notifications/stream` | Bearer | Live notifications (Server-Sent Events) |

## Reminders & scheduled tasks
- **`create_reminder`**: one-time or repeating (cron). Delivers an in-app notification, plus an optional email to yourself.
- **`schedule_task`**: the assistant runs an instruction later or on a repeat, in that task's own chat. It needs approval when created. Each run can email **your own address** automatically (`allowEmailToMe`). Any other action waits for approval, and you get an "Approval needed" notification.
- The scheduler ([server/src/services/schedulerService.js](server/src/services/schedulerService.js)) checks MongoDB every 15 seconds. It claims due tasks atomically, so several server instances are safe, and it releases tasks stuck in "running" for more than 10 minutes.
- **Limits:** agent tasks repeat at most once an hour, reminders at most every 5 minutes, and each user can have at most 20 active items.

## Google (Gmail + Calendar) setup
Follow [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) to create OAuth credentials. OAuth tokens are stored encrypted with AES-256-GCM.

| Tool | Type | Approval |
|---|---|---|
| `search_emails`, `read_email` | read | — |
| `create_draft` | write (low-risk) | runs directly, because only you can see drafts |
| `send_email` | write | approval card |
| `list_events`, `check_availability` | read | — |
| `create_event`, `update_event`, `delete_event` | write | approval card |

## Approvals (human in the loop)
When the agent calls a `write` tool, it **pauses**: the action is saved as `pending` and an approval card shows exactly what will happen. You can **Approve**, **Edit** (emails and new events) or **Reject**. Once every card is decided, the agent resumes. Approved actions run exactly once, thanks to atomic status changes. Rejected actions, and actions not approved within 15 minutes, are reported back to the agent as not done. If you send a new message instead of deciding, the open cards are closed and nothing runs.

## Adding a tool
1. Create `server/src/tools/myTool.js` exporting `{ name, description, type: 'read' | 'write', inputSchema (Zod), run(input, { user }) }`.
   Write the description as *when* to call it ("Call this when the user asks…").
2. Add it to the `tools` array in [server/src/tools/index.js](server/src/tools/index.js).
3. Optional: add a friendly label in [client/src/lib/toolLabels.js](client/src/lib/toolLabels.js).

The agent loop ([server/src/services/agentService.js](server/src/services/agentService.js)) validates inputs, runs tools in parallel, logs each run to the Activity log, and stops after 10 steps.

## AI configuration
Chat uses Claude through the official `@anthropic-ai/sdk`. Set `ANTHROPIC_API_KEY` in `server/.env` ([get a key](https://console.anthropic.com/settings/keys)). Optional: `LLM_MODEL` (default `claude-opus-5-5`), `LLM_EFFORT` (`low`…`max`, default `medium`), `LLM_MAX_TOKENS`, `ENABLE_WEB_SEARCH` (default `true`; each search is billed by Anthropic).

## Security & cost controls
- **Monthly AI budget per user:** estimated in USD from token usage, with prices set in `.env`. Once a user reaches it, new messages, approval resumes and scheduled runs return `429` until the 1st of the next month. Admins can change the budget per user. Users see their usage in **Settings**.
- **One reply at a time per chat:** a conversation lock stops a second tab, a double submit or a scheduled run from mixing up the history. A lock older than 10 minutes is taken over.
- **Prompt injection:**
  - text from emails, events and web pages is labelled untrusted;
  - actions that change things always need approval;
  - approval cards show a warning when the action was proposed right after reading outside content;
  - unattended runs can only email the user's own address.
- **Safe logs:** errors are logged without request headers, so Google tokens are never printed. Tool output is capped at 40k characters.
- **Admin:** emails listed in `ADMIN_EMAILS` get the admin role. The dashboard at `/admin` shows stats and lets admins change budgets and disable accounts. Disabling an account logs the user out and stops their scheduled tasks.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/users/me/usage` | Bearer | This month's AI spend vs. budget |
| GET | `/api/admin/stats` | Admin | Users, messages per day, actions, error rate, spend |
| GET | `/api/admin/users?q=` | Admin | Users with usage |
| PATCH | `/api/admin/users/:id` | Admin | `{ disabled?, monthlyBudgetUsd? }` |

## Deployment
The app runs as **one service**: in production, Express serves the built React app from `client/dist`. Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
npm run build   # (repo root) build the client + install the server's runtime dependencies
NODE_ENV=production npm start
```
- **Render:** `render.yaml` (Blueprint, one click). **Any Docker host:** `Dockerfile`.
- **CI:** `.github/workflows/ci.yml` runs the server tests and the client tests + build on every push and pull request.
- If you run the root `npm run build` locally, run `npm install` in `server/` afterwards to get the dev tools (nodemon, vitest) back.

## Tests
```bash
cd server && npm test   # 39 tests: unit + API (in-memory MongoDB, Claude mocked, no Google calls)
cd client && npm test   # client helper tests
```
The first server run downloads a MongoDB binary (~100 MB), which takes a minute.

## Roadmap
- [x] Phase 1: Setup & authentication
- [x] Phase 2: Chat UI + LLM (streaming Q&A)
- [x] Phase 3: Tool framework + action log
- [x] Phase 4: Google OAuth + email tools
- [x] Phase 5: Calendar tools + confirmation cards
- [x] Phase 6: Reminders & scheduled tasks
- [x] Phase 7: Hardening & admin
- [x] Phase 8: Deployment
