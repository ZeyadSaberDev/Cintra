# Cintra

Cintra is a bilingual AI workspace for conversation, web research, image creation, document analysis, and agent workflows.

## Backend architecture

- **Authentication:** email/password accounts, guests, hashed passwords, and revocable sessions are managed by Cintra. Passwords use salted `scrypt`; session tokens are stored as SHA-256 hashes and sent in `HttpOnly` cookies. New local accounts are treated as email-verified. SMTP is optional and is needed only for email-code sign-in and password-reset delivery.
- **Database:** application records, accounts, settings, and sessions are stored in a central SQLite database at `LOCAL_DATA_DIR/cintra.sqlite` (or `LOCAL_DB_PATH`). Every device connected to the same server sees the same account data.
- **Files:** uploads are stored below `LOCAL_DATA_DIR/files` and referenced by non-public `local://` IDs. File downloads and deletions are authorized by the server.
- **AI:** FreeLLMAPI is the default OpenAI-compatible provider (`https://freellmapi-zeyad.up.railway.app/v1`). Provider credentials remain server-side. When no model override or admin route is selected, chat defaults to the provider's `auto`/Fusion router. The public model list contains four built-in Cintra aliases and any additional models explicitly published by an administrator under a `Cintra`-prefixed public name. Custom public IDs are separate from upstream model IDs; inactive or disabled routes are not listed or accepted. Every chat-completion request receives the same Cintra identity and provider-disclosure policy in its system instructions. Web searches requested explicitly or by selecting Cintra Research require user confirmation before `/v1/search` is called; declining proceeds without search. General questions about recent dates, prices, weather, or versions do not trigger search by themselves. Long prompts alone do not enable slow thinking mode; explicit complex requests can still use it when enabled.
- **File handling:** image compression runs in a browser worker to keep the chat responsive, file batches upload in parallel, and image previews decode asynchronously.
- **Admin API changes:** provider connections and model settings added through the admin dashboard are encrypted and stored in SQLite. They are applied immediately and reloaded at server startup. In **Models → Service API routing**, an administrator can assign separate API connections to image generation, web search, text-to-speech, transcription, and embeddings. Unassigned capabilities use API priority order. These services call the configured base URL's `/v1/images/generations`, `/v1/search`, `/v1/audio/speech`, `/v1/audio/transcriptions`, and `/v1/embeddings` endpoints. The default image model is `cf/black-forest-labs/flux-1-schnell`; Cloudflare image models receive the minimal `{ model, prompt }` payload.
- **Images and workflows:** image generation supports aspect ratio and style options, and displays a clearly marked estimated progress indicator while the provider processes the request. Home shortcuts switch to Cintra Creative, Cintra Core, or Cintra Research as appropriate and open their dedicated image, writing/editing, and web-research workspaces; the Research selection and explicit search intent show the web-search indicator. Generated code fences are kept out of chat bubbles and shown as downloadable file cards; they can also be opened in a syntax-highlighted editor with fullscreen and live HTML preview in a sandboxed iframe with restrictive content security policy. Mobile workspaces switch between chat and artifact preview tabs; the sidebar opens as a drawer and the model selector stays centered in the header. Chat only follows new tokens while the reader remains at the bottom; scrolling up preserves the current reading position. The React Flow workflow canvas executes validated, connected input, web-search, AI-agent, PDF-content, and output nodes through `/api/agent/workflow/run`; graphs are saved in the current browser, and results can be exported as a formatted PDF with Arabic text rendered right-to-left. Authenticated speech generation, recorded-audio transcription, and `auto`-model embeddings are available through server-side routes and can use independently configured API connections. Audio recording is uploaded from the browser to the server for transcription.
- **Appearance:** the workspace, sign-in screens, and admin area support light, dark, and system-matched themes. Workspace preferences are applied immediately and retained locally; signed-in theme changes are also saved with the account.
- **Administration:** administrator access is held in the same local database and is granted only by `ADMIN_EMAIL` bootstrap or the trusted `npm run admin:grant` command. Admin sessions use the local authentication database.

### Fresh local data

The local backend starts with a fresh database. Appwrite users, conversations, uploaded files, and settings are **not migrated**. Users must create new accounts. FreeLLMAPI remains an external service, and its account may still apply usage limits or quota.

### Deployment requirements

Set `LOCAL_DATA_DIR` to a persistent disk mount (Render is configured with `/var/data`). Run **one server instance** against that SQLite database and storage directory. Keep `ADMIN_SESSION_SECRET` unchanged across deployments: it encrypts saved API keys, so rotating it makes existing saved provider credentials unreadable. Ephemeral storage or multiple app instances with separate local disks will not provide shared, durable data. Set up off-site snapshots through the hosting provider; the app does not currently automate database backups.

## Environment

Copy `.env.example` to `.env` and configure the server-only values:

| Variable | Purpose |
|---|---|
| `LOCAL_DATA_DIR` | Persistent directory containing the SQLite database and uploaded files; use `/var/data` on the configured Render disk |
| `LOCAL_DB_PATH` | Optional absolute SQLite path; defaults to `LOCAL_DATA_DIR/cintra.sqlite` |
| `APP_URL` | Local development origin or the deployed public HTTPS origin |
| `ADMIN_ACCESS_KEY` | Random secret of at least 32 characters to confirm protected admin actions |
| `ADMIN_SESSION_SECRET` | Independent random secret used to sign email-code challenges |
| `ADMIN_EMAIL` | Optional initial administrator email; set before the account signs up, or grant an existing account with the CLI |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional SMTP configuration for email sign-in codes and password-reset links |
| `FREELLMAPI_API_KEY` | FreeLLMAPI server-side bearer token; do not put it in frontend environment variables |
| `FREELLMAPI_BASE_URL` | OpenAI-compatible API base URL; defaults to `https://freellmapi-zeyad.up.railway.app/v1` |
| `FREELLMAPI_DEFAULT_MODEL`, `FREELLMAPI_MODELS` | Optional default (defaults to `auto`/Fusion) and comma-separated model IDs for initial provider setup |
| `FREELLMAPI_TTS_MODEL`, `FREELLMAPI_STT_MODEL` | Optional speech model IDs; default to `google/gemini-2.5-flash-tts` and `groq/whisper-large-v3` |
| `CLEANAPIS_IMAGE_*`, `GOOGLE_TTS_API_KEY` | Optional image-generation override and legacy Google voice-catalog configuration |
| `STRIPE_*` | Optional billing integration |

Create separate random values for the two admin secrets, for example by running `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` twice. Never commit `.env` or share private API keys in client code or chat. If a provider key has been exposed, rotate it with that provider.

## Local development

Use Node.js 24 or newer:

```powershell
Copy-Item .env.example .env
npm ci
npm run setup
npm run dev
```

Before starting the server, set `ADMIN_ACCESS_KEY` and `ADMIN_SESSION_SECRET` in `.env`. For local development, `APP_URL=http://localhost:3000` is accepted. On production, configure `APP_URL` as the public HTTPS origin.

To bootstrap a first admin at signup, set `ADMIN_EMAIL` to that account's email before starting the server. Alternatively, create the account first, then run this command on the server with the same `LOCAL_DATA_DIR`:

```powershell
npm run admin:grant -- admin@example.com
```

`npm run grant -- <email-or-account-id>` is also available as an alias. Treat access to these commands and the persistent data directory as privileged.

## FreeLLMAPI

Set `FREELLMAPI_API_KEY` in the server environment and keep the base URL at `https://freellmapi-zeyad.up.railway.app/v1`. In an existing deployment, the administrator **APIs** page can update the provider key/base URL, test the connection, and synchronize model IDs. The token must remain server-side. Chat requests that explicitly ask for web research or refer to time-sensitive information are searched through `POST /v1/search`; selecting Cintra Research always enables search. Search results are passed to the model as untrusted reference material, and a failed or unconfigured search is not presented as verified research.

## Build and tests

```powershell
npm run lint
npm test
npm run build
```
