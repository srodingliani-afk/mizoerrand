# ZoRûn — Mizoram Hyperlocal Mobility & Essential Services OS

**ZoRûn** is a bilingual (**Mizo + English**) server-driven Progressive Web App (PWA) and hybrid operations platform engineered for all **11 Mizoram District Capitals** (*Aizawl, Lunglei, Champhai, Serchhip, Kolasib, Lawngtlai, Mamit, Siaha, Saitual, Khawzawl, Hnahthial*).

---

## Key Features

- **Hyperlocal Errands, Runner & Fleet Dispatch**
  - Four vehicle & effort tiers: On-Foot Runner (`<1.5 km` / stair access), 2-Wheeler Express, Local Auto/Taxi Cab, and Pickup Cargo.
  - **Kailawn (Staircase / Slope) Accessibility Toggle**: Transparent effort tiers (`0–15`, `15–40`, `40+` steps) factored into all-inclusive fares.
  - **Landmark-First Addressing & Live GPS**: `Veng / Locality`, `YMA Section`, `Nearest Landmark (Biak In / Tuikhur / Kawn)`, live GPS watch with reverse geocoding, and interactive Google Map pin picker.
  - **15-Second Voice Note Booking (*"Hmet la Sawi Rawh"*)**: Browser `MediaRecorder` Mizo voice instructions stored via Google Drive (`ZoRun/VoiceNotes`).
- **Inter-District Sumo Parcel Bridge & Proxy Shopping**
  - Outer-district customers can request Aizawl Runners to buy items from local markets (Bara Bazar, Millennium Centre), attach receipt photos (`ZoRun/Receipts`), and dispatch via district Sumo counters.
- **En Hmasak Phawt (Check-Before-Pay) Marketplace**
  - Gate inspection before escrow release, hygiene category exclusions, monthly return caps, and `₹3` transit micro-insurance sachet.
- **Managed Home Workforce (*Awmpui* & Family Drivers)**
  - Vetted staff directory, digital contracts, attendance check-in/out, leave management, bank payroll disbursement, and Worker SOS.
- **24×7 Rapid Emergency SOS**
  - 12 emergency categories across medical, utility, and monsoon/roadside incidents with 2-tap confirmation guard, sliding-window rate limiting (`429`), and 60-second `node-cron` SLA monitoring.
- **Admin & Backend Web Consoles (`/admin`, `/admin/dev-studio`, `/backend`)**
  - Protected behind 2FA PIN authentication with live Firebase, double-entry ledger integrity, Google Drive folder health, Maps Routes v2 telemetry, SDUI remote config toggles, and SSE real-time dispatch.

---

## Architecture & Tech Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, `vite-plugin-pwa`, IndexedDB offline cache, `@vis.gl/react-google-maps` |
| **Backend API** | Node.js, Express, TypeScript (`server.ts`), modular routers (`server/modules/*`), `zod` validation, `node-cron`, Server-Sent Events |
| **Auth & Real-Time** | Firebase Authentication (Google Sign-In + RBAC), Cloud Firestore (district-scoped rules in `firestore.rules`) |
| **Media Storage** | Google Drive API v3 (`ZoRun/VoiceNotes`, `ZoRun/Receipts`, private `ZoRun/KYC`) with magic-byte validation & local fallback |
| **Maps & Routing** | Google Maps Routes API v2 (`computeRouteMatrix`), Geocoding API v4, Places Autocomplete, terrain Haversine fallback |
| **Accounting & Store** | Balanced Double-Entry Journal engine (`ledgerService.ts`) with 18% GST splits; `StorageAdapter` (Local atomic JSON + optional PostgreSQL `pg` pool) |

---

## Getting Started

### Prerequisites

- **Node.js** `20+` (or **Bun**)
- Optional API credentials for full cloud integration (all local flows run smoothly offline with built-in fallbacks):
  - Google Maps API key (`GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY`)
  - Firebase web config (`firebase-applet-config.json`)
  - Google Drive OAuth client scopes configured on sign-in

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in the values you use:

```bash
cp .env.example .env
```

Key variables in `.env.example`:
- `ZORUN_REGION=asia-south1`
- `SUPER_ADMIN_2FA_PIN=` (optional preset 2FA PIN for `/admin` and `/backend`)
- `GOOGLE_MAPS_API_KEY=` / `VITE_GOOGLE_MAPS_API_KEY=`
- `SQL_HOST=`, `SQL_PORT=5432`, `SQL_USER=`, `SQL_PASSWORD=`, `SQL_DB_NAME=` (optional PostgreSQL persistence; falls back to atomic `.data/zorun-db.json` when omitted)

### 3. Run Locally

```bash
npm run dev
```

The Express server and Vite dev middleware launch on `http://localhost:3000`.

### 4. Type-Check, Test & Build

```bash
npm run lint
npm test
npx eslint firestore.rules
npm run build
```

---

## Application Routes

- `/` — Customer Super-App (Errands & Fleet, En Hmasak Bazar, Awmpui & Drivers, 24×7 SOS, Profile)
- `/partner` — Runner & Fleet Driver Portal
- `/staff` — Awmpui & Family Driver Portal
- `/merchant` — Merchant Shop Portal
- `/technician` — 24×7 SOS Responder Portal
- `/apply` — Public Worker & Driver KYC Registration
- `/admin` — Operations Command Center *(2FA PIN protected)*
- `/admin/dev-studio` — Remote SDUI Config & Plugin Studio *(2FA PIN protected)*
- `/backend` — Live System Telemetry & API Inspector *(2FA PIN protected)*

---

## Security & Firebase Notes

- **Firestore Security Rules**: `firestore.rules` enforces default-deny, `email_verified` requirements, RBAC anti-escalation, coordinate bounds for Mizoram (`lat` `21.0–25.5`, `lng` `91.5–94.0`), and terminal order/SOS locking. Review `firestore.rules` in Firebase Console before broad production rollout.
- **Phone OTP Authentication**: Google Sign-In works immediately out of the box; to support Mizo Phone Number OTP sign-in, enable the **Phone** sign-in method in Firebase Console.
- **Client Secrets Hygiene**: Private keys (`GOOGLE_MAPS_API_KEY`, `SQL_PASSWORD`, `RAZORPAY_WEBHOOK_SECRET`, `SUPER_ADMIN_2FA_PIN`) remain strictly server-side; Google OAuth & Firebase ID tokens are kept only in client memory.

---

## License

This project is licensed under the [MIT License](LICENSE).
