# Software Requirements Specification (SRS)
## Project: AI Task Agent ("Agent") — MERN Stack

| Field | Value |
|---|---|
| Version | 1.0 (Draft) |
| Date | 22 Nov 2026 |
| Stack | MongoDB, Express.js, React, Node.js |
| Status | For review |

---

## 1. Introduction

### 1.1 Purpose
This document describes the requirements for **Agent**, a web application where users chat with an AI assistant that can both **answer questions** and **perform real actions** for them, such as sending emails, scheduling calendar events, and setting reminders. It is written for developers, testers and reviewers of the project.

### 1.2 Scope
Agent will:
- Provide a chat interface where users type requests in plain language.
- Use a Large Language Model (LLM) with **tool calling** to decide when an action is needed.
- Connect to the user's accounts (Gmail, Google Calendar) via **OAuth 2.0**.
- Carry out actions: send/read/draft emails, create/update/cancel events, check availability, schedule reminders and delayed tasks.
- Ask the user to **confirm** before any action that has an external effect.
- Keep a history of conversations and actions.

Out of scope for v1: voice input, mobile apps, payments, non-Google providers (Outlook etc. are planned for later), and multi-user shared workspaces.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Agent | The AI system that reasons about a request and calls tools |
| LLM | Large Language Model (e.g., Claude Sonnet 5.5) |
| Tool | A backend function the LLM can ask to run (e.g., `send_email`) |
| Tool call | A structured request from the LLM to run a tool with given arguments |
| Action | A tool call that changes something outside the app (sends mail, creates event) |
| Confirmation | User approval required before an Action runs |
| Integration | A connected external account (Gmail, Google Calendar) |
| HITL | Human-in-the-loop (the confirmation step) |

### 1.4 References
- IEEE 830 / ISO/IEC/IEEE 29148 SRS structure
- Google Gmail API and Google Calendar API documentation
- LLM provider tool-use (function calling) documentation
- OAuth 2.0 (RFC 6749)

---

## 2. Overall Description

### 2.1 Product Perspective
Agent is a new, standalone web application. Its architecture:

```
┌──────────────┐    HTTPS / WebSocket     ┌──────────────────────────────┐
│ React Client │ ───────────────────────▶ │ Node.js + Express API        │
│ (Chat UI)    │ ◀─── streamed replies ── │                              │
└──────────────┘                          │  ┌────────────────────────┐  │
                                          │  │ Agent Orchestrator     │  │──▶ LLM API (tool calling)
                                          │  │  - prompt + memory     │  │
                                          │  │  - tool loop           │  │
                                          │  └─────────┬──────────────┘  │
                                          │            │ tool calls      │
                                          │  ┌─────────▼──────────────┐  │
                                          │  │ Tool Registry          │  │──▶ Gmail API
                                          │  │ email / calendar /     │  │──▶ Google Calendar API
                                          │  │ reminder / search      │  │──▶ Web search API (optional)
                                          │  └────────────────────────┘  │
                                          │  ┌────────────────────────┐  │
                                          │  │ Job Scheduler (Agenda) │  │  (delayed / recurring tasks)
                                          │  └────────────────────────┘  │
                                          └──────────────┬───────────────┘
                                                         │
                                                 ┌───────▼────────┐
                                                 │   MongoDB      │
                                                 └────────────────┘
```

### 2.2 Product Functions (summary)
1. User registration, login and profile.
2. Connect / disconnect Google account (Gmail + Calendar).
3. Chat with the AI (questions and task requests), with streamed replies.
4. Agent decides on and runs tools: email, calendar, reminders, search.
5. Confirmation cards for sensitive actions (approve / edit / reject).
6. Scheduled and recurring tasks (e.g., "email me a summary every Monday 9 AM").
7. Conversation history and action/audit log.
8. Notifications in the app (and optionally by email).

### 2.3 User Classes

| User | Description |
|---|---|
| End User | Signs up, connects accounts, chats with the agent and approves actions |
| Admin | Monitors usage, errors, LLM cost and users; can disable accounts |

### 2.4 Operating Environment
- Client: modern browsers (Chrome, Edge, Firefox, Safari — latest 2 versions), responsive down to 360 px width.
- Server: Node.js 20+ LTS, Express 4/5.
- Database: MongoDB 7+ (MongoDB Atlas recommended).
- Hosting: e.g., Render / Railway / AWS for API; Vercel / Netlify for client.

### 2.5 Design and Implementation Constraints
- Must use the MERN stack.
- LLM must support tool/function calling and streaming.
- Google APIs require an OAuth consent screen; until Google verifies the app, only listed test users can connect (max 100).
- Gmail send/read scopes are "sensitive/restricted" scopes; request the narrowest scopes needed.
- LLM calls cost money per token, so there must be usage limits.

### 2.6 Assumptions and Dependencies
- Users have a Google account.
- LLM provider and Google APIs are available and within quota.
- Server time is UTC; user time zone is stored in their profile and used for all scheduling.

---

## 3. Functional Requirements

Priority: **H** = must have (v1), **M** = should have, **L** = nice to have.

### 3.1 Authentication & User Management

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | User can register with name, email and password. | H |
| FR-1.2 | User can log in with email/password or "Sign in with Google". | H |
| FR-1.3 | Passwords are hashed with bcrypt (cost ≥ 10). | H |
| FR-1.4 | Sessions use a short-lived JWT access token (15 min) plus a refresh token in an httpOnly cookie. | H |
| FR-1.5 | User can set name, time zone and default email signature. | H |
| FR-1.6 | User can reset a forgotten password by email link. | M |
| FR-1.7 | User can delete their account and all stored data. | M |

### 3.2 Integrations (Connected Accounts)

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | User can connect a Google account through OAuth 2.0 and grant Gmail and Calendar scopes. | H |
| FR-2.2 | OAuth access and refresh tokens are stored **encrypted** (AES-256-GCM) in MongoDB. | H |
| FR-2.3 | The system refreshes expired access tokens automatically. | H |
| FR-2.4 | The Integrations page shows each connection's status (connected / expired / revoked). | H |
| FR-2.5 | User can disconnect an integration; tokens are revoked at Google and deleted. | H |
| FR-2.6 | If a tool needs an integration that is not connected, the agent tells the user and shows a "Connect" button. | H |
| FR-2.7 | Support for Microsoft Outlook / Calendar. | L |

### 3.3 Chat Interface

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | User can start a new conversation and send text messages. | H |
| FR-3.2 | Agent replies are streamed token by token (WebSocket or Server-Sent Events). | H |
| FR-3.3 | Messages render Markdown (lists, links, code, tables). | H |
| FR-3.4 | The UI shows the agent's progress while tools run (e.g., "Checking your calendar…"). | H |
| FR-3.5 | Sidebar lists past conversations; user can rename, search and delete them. | M |
| FR-3.6 | User can stop a response while it is being generated. | M |
| FR-3.7 | Conversation titles are generated automatically from the first message. | L |

### 3.4 Agent Core (Reasoning & Tool Loop)

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | For each user message, the backend sends the conversation history, a system prompt (including current date/time and user time zone) and the list of available tools to the LLM. | H |
| FR-4.2 | If the LLM returns tool calls, the backend validates the arguments against each tool's JSON schema, runs the tool, returns the result to the LLM, and repeats until the LLM gives a final answer. | H |
| FR-4.3 | The tool loop stops after a maximum of **10 iterations** per user message to prevent runaway loops. | H |
| FR-4.4 | Plain questions (no action needed) are answered directly without tools. | H |
| FR-4.5 | If a request is missing information (e.g., recipient email), the agent asks a follow-up question instead of guessing. | H |
| FR-4.6 | The agent resolves relative dates ("next Friday at 3") using the user's time zone. | H |
| FR-4.7 | The agent can look up contacts by name from the user's Gmail history / Google Contacts to find email addresses. | M |
| FR-4.8 | Long conversations are trimmed or summarized to stay within the LLM context limit. | M |
| FR-4.9 | Tool errors (API failure, permission denied) are returned to the LLM so it can explain the problem or try another approach. | H |
| FR-4.10 | The agent can store user preferences as long-term memory (e.g., "my manager is priya@company.com"). | L |

### 3.5 Human-in-the-Loop Confirmation

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Every tool is labelled **read** (safe) or **write** (has an external effect). | H |
| FR-5.2 | Before running a **write** tool, the system pauses and shows a confirmation card with the full details (e.g., To, Subject, Body; or Title, Time, Attendees). | H |
| FR-5.3 | User can **Approve**, **Edit then approve**, or **Reject** the action. | H |
| FR-5.4 | On reject, the LLM is told the action was cancelled and replies accordingly. | H |
| FR-5.5 | Pending confirmations expire after 15 minutes. | M |
| FR-5.6 | User can allow specific low-risk actions to run without confirmation (e.g., "create events on my own calendar"). | L |

### 3.6 Email Tools (Gmail)

| ID | Tool | Type | Description | Priority |
|---|---|---|---|---|
| FR-6.1 | `send_email` | write | Send an email (to, cc, bcc, subject, body; plain text or HTML). | H |
| FR-6.2 | `create_draft` | write | Save an email as a Gmail draft. | H |
| FR-6.3 | `search_emails` | read | Search the inbox with a Gmail query (sender, subject, date, unread). | H |
| FR-6.4 | `read_email` | read | Get the full content of a message by ID. | H |
| FR-6.5 | `reply_to_email` | write | Reply in an existing thread. | M |
| FR-6.6 | `summarize_inbox` | read | Summarize unread or recent emails. | M |
| FR-6.7 | Attachments: send files uploaded in chat. | write | | L |

### 3.7 Calendar Tools (Google Calendar)

| ID | Tool | Type | Description | Priority |
|---|---|---|---|---|
| FR-7.1 | `list_events` | read | List events in a date range. | H |
| FR-7.2 | `check_availability` | read | Find free slots for the user (and attendees, via free/busy). | H |
| FR-7.3 | `create_event` | write | Create an event with title, start/end, description, attendees, location and optional Google Meet link. | H |
| FR-7.4 | `update_event` | write | Change time, title or attendees of an event. | H |
| FR-7.5 | `delete_event` | write | Cancel an event (with notification to attendees). | H |
| FR-7.6 | The agent warns about clashes with existing events before creating one. | — | | M |

### 3.8 Reminders & Scheduled Tasks

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | `create_reminder` tool: remind the user at a given time (in-app notification and/or email). | H |
| FR-8.2 | `schedule_task` tool: run an agent instruction later or on a recurring schedule (e.g., "every Monday 9 AM, email me my week's meetings"). | M |
| FR-8.3 | Scheduled jobs are stored in MongoDB (Agenda.js) so they survive server restarts. | H |
| FR-8.4 | User can view, pause and delete scheduled tasks on a "Tasks" page. | M |
| FR-8.5 | Scheduled write actions that run without the user present follow the rules set when the task was created (approved at creation time). | M |

### 3.9 Other Tools

| ID | Tool | Type | Description | Priority |
|---|---|---|---|---|
| FR-9.1 | `get_current_time` | read | Current date/time in the user's time zone. | H |
| FR-9.2 | `web_search` | read | Search the web for current information. | M |
| FR-9.3 | `get_weather` | read | Weather for a location. | L |
| FR-9.4 | The tool registry is modular so new tools can be added by creating one file (name, description, JSON schema, type, handler). | — | | H |

### 3.10 Activity Log & Notifications

| ID | Requirement | Priority |
|---|---|---|
| FR-10.1 | Every tool run is logged: user, tool, arguments, result/error, status, time taken, approved by. | H |
| FR-10.2 | User can view their Activity page (filter by tool, status, date). | M |
| FR-10.3 | In-app notifications for reminders, finished scheduled tasks and failures (via WebSocket). | M |

### 3.11 Admin

| ID | Requirement | Priority |
|---|---|---|
| FR-11.1 | Admin dashboard: users, messages per day, tool calls, error rate, LLM token usage/cost. | M |
| FR-11.2 | Admin can disable a user or set their usage limit. | M |

---

## 4. External Interface Requirements

### 4.1 User Interface (pages)
| Page | Contents |
|---|---|
| Landing | Product intro, Sign up / Log in |
| Auth | Register, Login, Forgot password, Google sign-in |
| Chat (main) | Sidebar (conversations), message area, input box, streaming replies, tool-progress chips, confirmation cards |
| Integrations | Connect/disconnect Google, status of each |
| Tasks | Upcoming reminders and scheduled/recurring tasks |
| Activity | Table of past actions with status |
| Settings | Profile, time zone, signature, auto-approve rules, delete account |
| Admin | Usage and user management (admin only) |

Must support light/dark mode and be usable on mobile.

### 4.2 Software Interfaces
| System | Purpose | Protocol |
|---|---|---|
| LLM API (e.g., Anthropic Claude) | Reasoning + tool calling + streaming | HTTPS / REST, SSE |
| Gmail API | Send, draft, search, read email | HTTPS / REST, OAuth 2.0 |
| Google Calendar API | Events, free/busy | HTTPS / REST, OAuth 2.0 |
| Web search API (optional) | Live information | HTTPS / REST |
| SMTP / transactional email (e.g., Resend, SendGrid) | App's own emails (password reset, reminders) | HTTPS / SMTP |

### 4.3 REST API (main endpoints)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/refresh` | New access token |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/users/me` · PATCH `/api/users/me` | Profile |
| GET | `/api/integrations` | List connections |
| GET | `/api/integrations/google/connect` | Start OAuth |
| GET | `/api/integrations/google/callback` | OAuth callback |
| DELETE | `/api/integrations/:provider` | Disconnect |
| GET / POST | `/api/conversations` | List / create conversation |
| GET / PATCH / DELETE | `/api/conversations/:id` | Get / rename / delete |
| POST | `/api/conversations/:id/messages` | Send message (reply streamed) |
| POST | `/api/actions/:actionId/approve` | Approve (optionally with edited args) |
| POST | `/api/actions/:actionId/reject` | Reject |
| GET | `/api/tasks` · DELETE `/api/tasks/:id` · PATCH `/api/tasks/:id` | Scheduled tasks |
| GET | `/api/activity` | Action log |
| GET | `/api/admin/stats` | Admin metrics |

### 4.4 Real-time Events (Socket.io)
`message:delta`, `message:done`, `tool:start`, `tool:result`, `action:confirm_required`, `notification:new`, `error`.

---

## 5. Data Requirements (MongoDB Collections)

```js
User {
  _id, name, email (unique), passwordHash, authProvider: 'local'|'google',
  role: 'user'|'admin', timezone: 'Asia/Kolkata', signature,
  autoApproveRules: [String], usage: { tokensThisMonth, limit },
  createdAt, updatedAt
}

Integration {
  _id, userId, provider: 'google', accountEmail, scopes: [String],
  accessTokenEnc, refreshTokenEnc, expiresAt,
  status: 'active'|'expired'|'revoked', createdAt
}

Conversation {
  _id, userId, title, summary, lastMessageAt, createdAt
}

Message {
  _id, conversationId, role: 'user'|'assistant'|'tool',
  content, toolCalls: [{ id, name, args }], toolCallId,
  tokens: { input, output }, createdAt
}

Action {                      // one per tool execution
  _id, userId, conversationId, toolName, type: 'read'|'write',
  args, editedArgs, result, error,
  status: 'pending_confirmation'|'approved'|'rejected'|'running'|'success'|'failed'|'expired',
  durationMs, createdAt, resolvedAt
}

ScheduledTask {               // managed by Agenda.js (agendaJobs collection) + metadata
  _id, userId, kind: 'reminder'|'agent_task', instruction,
  runAt, repeatCron, timezone, enabled, lastRunAt, lastStatus
}

Notification {
  _id, userId, title, body, link, read: Boolean, createdAt
}
```

Indexes: `User.email` (unique), `Message.conversationId + createdAt`, `Conversation.userId + lastMessageAt`, `Action.userId + createdAt`, `Integration.userId + provider` (unique).

---

## 6. Non-Functional Requirements

### 6.1 Performance
| ID | Requirement |
|---|---|
| NFR-1 | First streamed token appears within 2 s (p90) for questions without tools. |
| NFR-2 | Non-LLM API endpoints respond within 300 ms (p95). |
| NFR-3 | Scheduled tasks run within 60 s of their scheduled time. |
| NFR-4 | Supports at least 100 concurrent users in v1. |

### 6.2 Security & Privacy
| ID | Requirement |
|---|---|
| NFR-5 | All traffic over HTTPS; secure, httpOnly, SameSite cookies. |
| NFR-6 | OAuth tokens encrypted at rest; encryption key kept in environment variables, never in code or Git. |
| NFR-7 | Request minimum OAuth scopes (e.g., `gmail.send`, `gmail.readonly`, `calendar.events`). |
| NFR-8 | Every tool checks that the resource belongs to the logged-in user. |
| NFR-9 | **Prompt-injection defence:** content from emails/web pages is treated as data, not instructions; write actions always go through confirmation unless the user has explicitly auto-approved that tool. |
| NFR-10 | Rate limiting (e.g., 30 messages/min per user) and monthly token limits. |
| NFR-11 | Input validation on all endpoints (Zod/Joi); Helmet, CORS whitelist, Mongo sanitisation. |
| NFR-12 | Email bodies and tokens are never written to application logs. |
| NFR-13 | Users can export and delete their data. |

### 6.3 Reliability
| ID | Requirement |
|---|---|
| NFR-14 | Retry failed Google/LLM calls up to 3 times with exponential backoff (only for safe/idempotent operations). |
| NFR-15 | A write action is never run twice for the same approval (idempotency key = Action ID). |
| NFR-16 | 99% uptime target; scheduled jobs persist across restarts. |

### 6.4 Usability
| ID | Requirement |
|---|---|
| NFR-17 | A new user can connect Google and send their first email via chat in under 3 minutes. |
| NFR-18 | Confirmation cards show exactly what will happen, in plain language. |
| NFR-19 | Meets WCAG 2.1 AA basics: keyboard navigation, contrast, labels. |

### 6.5 Maintainability
| ID | Requirement |
|---|---|
| NFR-20 | Layered backend: routes → controllers → services → tools. |
| NFR-21 | Adding a new tool requires only one new file in `server/tools/` plus registration. |
| NFR-22 | LLM provider is wrapped behind one service so it can be swapped. |
| NFR-23 | Unit tests for tools and services; ≥ 70% backend coverage. |
| NFR-24 | ESLint + Prettier; environment config via `.env` (with `.env.example` committed). |

---

## 7. Use Cases

### UC-1: Send an email
- **Actor:** End User (Google connected)
- **Flow:**
  1. User: "Email Rahul that the demo moves to Friday 4 PM."
  2. Agent calls `search_emails`/contacts to find Rahul's address. If more than one match, asks which one.
  3. Agent drafts subject and body and requests `send_email`.
  4. System shows a confirmation card (To, Subject, Body).
  5. User approves (or edits, then approves).
  6. System sends via Gmail API, logs the Action, agent confirms "Sent ✅".
- **Alternate:** User rejects → agent says it was not sent. Google not connected → agent shows Connect button.

### UC-2: Book a meeting
1. User: "Book a 30-min call with priya@x.com tomorrow afternoon."
2. Agent calls `check_availability` for tomorrow 12:00–18:00 (user's time zone).
3. Agent proposes free slots, or picks the first one if the user said "any".
4. Agent requests `create_event` with a Meet link → confirmation card.
5. On approval, event is created and invite sent; agent replies with time and link.

### UC-3: Answer a question
1. User: "What is the difference between SQL and NoSQL?"
2. Agent answers directly without tools; reply is streamed.

### UC-4: Recurring task
1. User: "Every weekday at 8 AM email me today's meetings."
2. Agent confirms the schedule → `schedule_task` (recurring cron, user's time zone).
3. At each run, the scheduler runs the agent with the stored instruction: `list_events` → `send_email` to the user's own address (pre-approved at creation).
4. Result appears in Activity and Notifications.

### UC-5: Reminder
1. User: "Remind me to submit the report at 5 PM."
2. `create_reminder` → at 5 PM user receives an in-app notification (and optionally an email).

---

## 8. Suggested Technology Choices

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, React Router, Tailwind CSS, Zustand or Redux Toolkit, TanStack Query, react-markdown, Socket.io client |
| Backend | Node.js 20, Express, Socket.io, Mongoose, Zod, Passport/JWT, Helmet, express-rate-limit |
| AI | LLM SDK with tool calling + streaming (e.g., `@anthropic-ai/sdk` with Claude Sonnet 5.5) |
| Integrations | `googleapis` npm package (Gmail, Calendar, OAuth2) |
| Scheduling | Agenda.js (stores jobs in MongoDB — no extra infrastructure) |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend) |
| DevOps | GitHub, GitHub Actions CI, MongoDB Atlas, Render/Railway (API), Vercel (client) |

### Suggested folder structure
```
AI Agent/
├── client/                 # React app
│   └── src/ { pages, components, hooks, store, services, utils }
├── server/
│   ├── src/
│   │   ├── config/         # env, db, google, llm
│   │   ├── models/         # Mongoose schemas
│   │   ├── routes/  controllers/  middleware/
│   │   ├── services/       # agentService, llmService, googleService, cryptoService
│   │   ├── tools/          # sendEmail.js, createEvent.js, ... + index.js (registry)
│   │   ├── jobs/           # Agenda job definitions
│   │   └── sockets/
│   └── tests/
└── docs/SRS.md
```

---

## 9. Development Plan (Milestones)

| Phase | Deliverables | Est. |
|---|---|---|
| 1. Setup & Auth | Repo, client/server scaffold, MongoDB, register/login, JWT | 1 week |
| 2. Chat + LLM | Chat UI, conversations, streaming replies, Q&A only | 1 week |
| 3. Tool framework | Tool registry, agent loop, `get_current_time`, action log | 1 week |
| 4. Google integration | OAuth connect, encrypted tokens, email tools | 1–2 weeks |
| 5. Calendar + confirmation | Calendar tools, confirmation cards (approve/edit/reject) | 1 week |
| 6. Reminders & scheduling | Agenda.js, reminders, recurring tasks, notifications | 1 week |
| 7. Hardening | Rate limits, prompt-injection safeguards, tests, admin page | 1 week |
| 8. Deploy | CI/CD, production env, Google OAuth verification / test users | 3–5 days |

---

## 10. Acceptance Criteria (v1 complete when)
1. A user can register, log in and connect a Google account.
2. A user can ask general questions and get streamed answers.
3. A user can send an email through chat, after a confirmation card, and it arrives.
4. A user can create, reschedule and cancel a Google Calendar event through chat.
5. Reminders fire within 60 s of their time.
6. No write action runs without approval (unless auto-approved by the user).
7. All actions appear in the Activity log with correct status.
8. OAuth tokens are encrypted in the database, and no secrets are in the repository.

---

## 11. Future Enhancements
- Outlook / Microsoft 365, Slack, WhatsApp, Notion, Google Drive integrations
- Voice input/output
- File and PDF understanding (attachments)
- Multi-step plans shown to the user before running
- MCP (Model Context Protocol) support for plug-in tools
- Team workspaces and shared calendars
