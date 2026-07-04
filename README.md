# QueueFlow — Smart Queue Management SaaS

> Zero-friction queue management with QR codes, real-time updates, and edge-native performance. Built with Next.js 16, deployed to Cloudflare Workers.

## 🌟 Features

- **Multi-Tenant Architecture** — 3-tier hierarchy: Platform Admin → Master Tenant (franchise) → Manager/Agent
- **QR Code Join** — Customers scan a QR code or visit a link to join any queue instantly
- **Real-Time Updates** — 3-second polling for live queue position, EWT, and now-serving status
- **TV Display Mode** — Full-screen display for waiting rooms showing all active queues
- **Smart EWT** — Dynamic estimated wait time based on rolling average service times
- **Pay-Per-Entry Billing** — Wallet system with 100 cents/ticket, refund on cancel
- **Customer Loyalty** — 6-tier system: New → Bronze → Silver → Gold → Platinum → Diamond
- **Appointments** — Scheduled time slots with conflict detection and auto-check-in
- **Webhooks** — HMAC-SHA256 signed with SSRF protection and fire-and-forget delivery
- **Analytics** — Per-queue and cross-tenant analytics with CSV/JSON export
- **Feedback & NPS** — Post-service ratings with Net Promoter Score calculation
- **Service Windows** — Configurable operating hours per queue per day
- **Customer Profiles** — Repeat customer recognition by phone number
- **Staff Management** — Role-based access control (MANAGER/AGENT) with CRUD
- **Audit Logging** — Comprehensive action tracking for compliance
- **i18n** — English + Bengali (বাংলা) support
- **PWA** — Service worker, manifest, installable on mobile
- **Push Notifications** — Web Push for real-time customer alerts
- **Branding** — Per-tenant custom colors, logo text, and welcome messages
- **Security** — JWT auth, CSRF protection, rate limiting, security headers

## 🏗️ Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **UI**: Tailwind CSS 4 + shadcn/ui (New York style)
- **State**: Zustand (client) + TanStack Query (server)
- **Database**: SQLite via bun:sqlite (local) / Cloudflare D1 (production)
- **Storage**: Local filesystem (local) / Cloudflare R2 (production)
- **Auth**: JWT (jose) + bcryptjs
- **Animations**: Framer Motion

### Data Model (18 tables)
`platform_admins` · `master_tenants` · `master_tenant_admins` · `tenants` · `users` · `queues` · `tickets` · `usage_ledgers` · `service_logs` · `transactions` · `push_subscriptions` · `audit_logs` · `plan_limits` · `service_windows` · `feedback` · `appointments` · `webhooks` · `customer_profiles`

### Directory Structure
```
src/
├── app/
│   ├── api/              # 37 API route files
│   │   ├── admin/        # Platform admin endpoints
│   │   ├── auth/         # Login, me, change-password
│   │   ├── master-tenant/# Master tenant endpoints
│   │   ├── notifications/# Push subscription & send
│   │   ├── queues/       # Queue CRUD + join
│   │   ├── storage/      # File upload/download
│   │   ├── tenants/      # Tenant management & analytics
│   │   └── tickets/      # Ticket lifecycle
│   ├── dashboard/        # Staff dashboard route
│   ├── page.tsx          # Main SPA entry
│   ├── layout.tsx        # Root layout
│   ├── error.tsx         # Error boundary
│   ├── not-found.tsx     # 404 page
│   └── loading.tsx       # Loading skeleton
├── components/
│   ├── dashboard/        # Extracted dashboard components
│   ├── tabs/             # Settings tab components
│   ├── ui/               # shadcn/ui primitives
│   └── views/            # Page-level view components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities, auth, DB, types
├── stores/               # Zustand store
└── types/                # Type declarations
```

## 🚀 Getting Started

### Prerequisites
- Bun 1.3+
- Node.js 18+

### Installation
```bash
git clone https://github.com/mycampushub/qmanager.git
cd qmanager
bun install
```

### Local Development (SQLite)
```bash
# Initialize the database
bun run scripts/init-db.ts

# Set environment variables
cp .env.example .env.local
# Edit .env.local with your JWT_SECRET

# Start development server
bun run dev
```

### Cloudflare Deployment
```bash
# One-time setup
bun run setup:cf

# Deploy
bun run deploy
```

## 🔐 Authentication

### Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Platform Admin | admin@yourqueueapp.com | *(set in env)* |
| Manager (QuickBite) | manager@quickbiterestaurant.com | *(set in env)* |
| Agent (QuickBite) | agent1@quickbiterestaurant.com | *(set in env)* |
| Master Tenant Admin | hq@cityhealthgroup.com | *(set in env)* |

## 📡 API Endpoints

### Public
- `GET /api/health` — Health check
- `GET /api/tenants` — List active tenants
- `POST /api/tenants` — Register new tenant
- `POST /api/queues/join` — Customer joins queue
- `GET /api/tickets/status?ticketId=xxx` — Check ticket status
- `GET /api/tenants/:id/poll` — Lightweight queue state (3s polling)
- `GET /api/tenants/:id/display` — TV display data

### Authenticated (Staff/Manager)
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Get current user
- Ticket lifecycle: call, complete, skip, cancel
- Queue/Staff/Service Window/Feedback/Appointment CRUD
- Analytics, Wallet, Branding

### Platform Admin
- Tenant management, Master tenant CRUD
- Analytics, Audit log, Payments

## 📄 License

MIT