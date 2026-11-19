# Kriscent Admin

Responsive Next.js App Router frontend for the document insights platform.

## Run locally

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `.env.local` to the NestJS API base URL. The local default is `http://localhost:4000/api`; see `.env.example`.

## Route architecture

- `/login`, `/register` — authentication screens with client-side Zod validation.
- `/dashboard` — workspace overview.
- `/dashboard/documents`, `/dashboard/documents/[id]` — paginated document library, upload, document details, summary, and delete.
- `/dashboard/search` — semantic search interface.
- `/admin`, `/admin/documents`, `/admin/users`, `/admin/analytics` — administration views.

Shared workspace navigation, design tokens, buttons, dialogs, badges, tables, empty/error states, loading skeletons, and document widgets live under `components/`. App Router route groups separate authentication screens from the workspace shell without changing the public URLs.

## Authentication

The browser calls same-origin Next.js handlers under `/api/auth`. Those handlers proxy to NestJS using `NEXT_PUBLIC_API_URL`; the login handler keeps the backend JWT in an `HttpOnly`, `SameSite=Lax` cookie (also `Secure` in production) and never returns it to client JavaScript. Axios uses credentials for same-origin requests. No token or password is stored in browser storage.

The workspace layout validates the cookie through `GET /auth/profile`; the admin layout checks the verified profile role. These frontend checks are for navigation and UX only: NestJS guards must continue to verify every protected API request and role independently. The BFF avoids browser-to-backend CORS; if the frontend is later changed to call NestJS directly, configure the backend to allow the exact frontend origin with credentials.

## Documents

The browser uses same-origin `/api/documents` Next.js handlers. These handlers read the HttpOnly session cookie and forward the bearer token server-side to the NestJS document endpoints; the token is never returned to browser JavaScript. The library reads the real paginated API response, and the upload dialog accepts multiple PDF/TXT files up to 5 MB each, with per-file validation, progress, duplicate-content detection, retry, and processing states. The backend remains authoritative for file validation, owner-scoped duplicate detection, access control, and storage. Files are stored under random names with restrictive filesystem permissions. Document metadata, processing status, AI summary, and deletion are loaded from the API; no demo documents are displayed.

Semantic search is available through the same authenticated BFF at `GET /api/documents/search?q=...`. It forwards the session token server-side and displays only validated, ranked results. The backend requires a configured MongoDB Atlas Vector Search index; backend configuration or search errors are surfaced in the UI.

## Administration

The admin pages and `/api/admin` proxy handlers independently verify the session profile's `ADMIN` role before forwarding requests. Statistics, users, and documents are loaded from the admin APIs; document deletion and summary regeneration require confirmation and are sent to the backend with the user's JWT so backend RBAC remains authoritative. Audit-log data is not fabricated: the supplied API list does not include an audit-log endpoint or response contract, so the analytics page reports that it is unavailable until one is provided.
