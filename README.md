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
| POST | `/api/conversations/:id/messages` | Bearer | Send a message; reply streams back as Server-Sent Events |

## AI configuration
Chat uses Claude through the official `@anthropic-ai/sdk`. Set `ANTHROPIC_API_KEY` in `server/.env` ([get a key](https://console.anthropic.com/settings/keys)). Optional: `LLM_MODEL` (default `claude-opus-5-5`), `LLM_EFFORT` (`low`…`max`, default `medium`), `LLM_MAX_TOKENS`.

## Roadmap
- [x] Phase 1: Setup & authentication
- [x] Phase 2: Chat UI + LLM (streaming Q&A)
- [ ] Phase 3: Tool framework + action log
- [ ] Phase 4: Google OAuth + email tools
- [ ] Phase 5: Calendar tools + confirmation cards
- [ ] Phase 6: Reminders & scheduled tasks
- [ ] Phase 7: Hardening & admin
- [ ] Phase 8: Deployment
