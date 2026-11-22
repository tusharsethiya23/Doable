# Doable — AI Task Agent (MERN)

An AI assistant that answers questions **and** performs real tasks: sending emails, booking calendar events and setting reminders, with your approval on every action. Full requirements are in [docs/SRS.md](docs/SRS.md).

## Project structure
```
client/   React + Vite + Tailwind front-end
server/   Node.js + Express + MongoDB API
docs/     SRS and other documentation
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

## Roadmap
- [x] Phase 1: Setup & authentication
- [x] Phase 2: Chat UI + LLM (streaming Q&A)
- [x] Phase 3: Tool framework + action log
- [x] Phase 4: Google OAuth + email tools
- [x] Phase 5: Calendar tools + confirmation cards
- [ ] Phase 6: Reminders & scheduled tasks
- [ ] Phase 7: Hardening & admin
- [ ] Phase 8: Deployment
