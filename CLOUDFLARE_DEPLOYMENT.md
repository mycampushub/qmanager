# QueueFlow — Complete Cloudflare Workers Deployment Guide

> Deploy QueueFlow to Cloudflare Workers with D1, R2, and KV bindings using `@opennextjs/cloudflare`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 — Cloudflare Account Setup](#3-step-1--cloudflare-account-setup)
4. [Step 2 — Project Configuration](#4-step-2--project-configuration)
5. [Step 3 — Create Cloudflare Resources](#5-step-3--create-cloudflare-resources)
6. [Step 4 — Configure Environment Variables](#6-step-4--configure-environment-variables)
7. [Step 5 — Apply Database Schema](#7-step-5--apply-database-schema)
8. [Step 6 — Build for Cloudflare](#8-step-6--build-for-cloudflare)
9. [Step 7 — Local Preview with Wrangler](#9-step-7--local-preview-with-wrangler)
10. [Step 8 — Deploy to Production](#10-step-8--deploy-to-production)
11. [Step 9 — Custom Domain Setup](#11-step-9--custom-domain-setup)
12. [Step 10 — Post-Deployment Verification](#12-step-10--post-deployment-verification)
13. [Ongoing Operations](#13-ongoing-operations)
14. [Troubleshooting](#14-troubleshooting)
15. [Cost Estimates](#15-cost-estimates)
16. [Security Checklist](#16-security-checklist)
17. [Quick Reference — All Commands](#17-quick-reference--all-commands)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Network                       │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐  │
│  │   Browser /  │───▶│     Cloudflare Workers            │  │
│  │   Mobile App │    │  (Next.js via @opennextjs/       │  │
│  └──────────────┘    │   cloudflare adapter)             │  │
│                      │                                    │  │
│                      │  ┌─────────┐  ┌──────┐  ┌─────┐ │  │
│                      │  │   D1    │  │  R2  │  │ KV  │ │  │
│                      │  │ Database│  │Storage│  │Cache│ │  │
│                      │  └─────────┘  └──────┘  └─────┘ │  │
│                      └──────────────────────────────────┘  │
│                                                             │
│  ┌──────────────┐                                           │
│  │   Cloudflare │  CDN, DDoS protection, SSL,             │
│  │      CDN     │  page caching for static assets          │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### Binding Map

| Binding | Service | Purpose | Plan |
|---------|---------|---------|------|
| `DB` | **D1** | SQLite database (all app data) | Free: 5GB, 5M reads/day |
| `STORAGE` | **R2** | Object storage (logos, uploads) | Free: 10GB, 10M Class B ops/mo |
| `RATE_LIMIT_KV` | **KV** | Distributed rate limiting | Free: 100K reads/day, 1K writes/day |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Yes** | 256-bit secret for JWT token signing (HS256) |
| `VAPID_PUBLIC_KEY` | No | Web Push notification public key (base64url) |
| `VAPID_PRIVATE_KEY` | No | Web Push notification private key (base64url) |

---

## 2. Prerequisites

### Software (Local Machine)

```bash
# Check versions
node --version      # v18.17+ or v20+
bun --version       # 1.0+ (optional, used in scripts)
npx wrangler --version  # 3.x or 4.x
```

Install Wrangler globally (if not already):

```bash
bun add -g wrangler
# or
npm install -g wrangler
```

### Cloudflare Account

1. Create a free account at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. You need a Cloudflare account with:
   - D1 access (included in free plan)
   - R2 access (included in free plan)
   - KV access (included in free plan)
   - Workers access (100K requests/day free)

### Login to Cloudflare

```bash
npx wrangler login
```

This opens a browser window for OAuth authentication. A success message confirms login.

---

## 3. Step 1 — Cloudflare Account Setup

### Verify Authentication

```bash
npx wrangler whoami
```

Expected output:
```
┌──────────────────────────────────────────┐
│ Name                                     │
│ <your-email@example.com>                 │
│ Account ID                               │
│ <your-account-id>                        │
└──────────────────────────────────────────┘
```

### (Optional) Select Account

If you have multiple accounts:

```bash
npx wrangler whoami
# Note the Account ID, then export it:
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
```

---

## 4. Step 2 — Project Configuration

The project already contains a `wrangler.jsonc` with placeholder IDs. You'll update it with real IDs after creating resources.

### Current `wrangler.jsonc` Structure

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "queueflow",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],

  "d1_databases": [{
    "binding": "DB",
    "database_name": "queueflow-db",
    "database_id": "TODO_REPLACE_WITH_REAL_D1_ID",
    "migrations_dir": "migrations"
  }],

  "r2_buckets": [{
    "binding": "STORAGE",
    "bucket_name": "queueflow-storage"
  }],

  "kv_namespaces": [{
    "binding": "RATE_LIMIT_KV",
    "id": "TODO_REPLACE_WITH_REAL_KV_ID"
  }],

  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
}
```

### Key Configuration Notes

- **`output: "standalone"`** in `next.config.ts` is required by OpenNext
- **`nodejs_compat`** compatibility flag enables Node.js APIs in Workers (needed for `jose`, `bcryptjs`)
- **`serverExternalPackages`** in `next.config.ts` lists `jose` and `bcryptjs` (pure JS, CF-compatible)

---

## 5. Step 3 — Create Cloudflare Resources

Run these commands in order. **Save each output** — you need the IDs for `wrangler.jsonc`.

### 5a. Create D1 Database

```bash
npx wrangler d1 create queueflow-db
```

Output:
```
✅ Successfully created DB 'queueflow-db'

[[d1_databases]]
binding = "DB"
database_name = "queueflow-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"    # ← COPY THIS
```

### 5b. Create R2 Bucket

```bash
npx wrangler r2 bucket create queueflow-storage
```

Output:
```
✅ Created bucket 'queueflow-storage'
```

R2 buckets don't have IDs to track — the bucket name IS the identifier.

### 5c. Create KV Namespace

```bash
npx wrangler kv namespace create "queueflow-rate-limit"
```

Output:
```
✅ Created namespace: queueflow-rate-limit
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"    # ← COPY THIS
```

### 5d. Update `wrangler.jsonc` with Real IDs

Open `wrangler.jsonc` and replace the placeholder values:

```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "queueflow-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // ← Paste D1 ID here
    "migrations_dir": "migrations"
  }],

  "r2_buckets": [{
    "binding": "STORAGE",
    "bucket_name": "queueflow-storage"
    // No ID needed — bucket name is the identifier
  }],

  "kv_namespaces": [{
    "binding": "RATE_LIMIT_KV",
    "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  // ← Paste KV ID here
  }]
}
```

---

## 6. Step 4 — Configure Environment Variables

### Production Secrets (via Wrangler Dashboard or CLI)

#### Option A: Wrangler CLI (Recommended for initial setup)

```bash
# JWT Secret — CRITICAL: Use a strong, unique secret
npx wrangler secret put JWT_SECRET
# It will prompt you to enter the value. Use a cryptographically random string:

# Generate a good one:
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### Option B: Cloudflare Dashboard

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → queueflow → Settings → Variables and Secrets
2. Add `JWT_SECRET` as an encrypted secret

#### Optional: Web Push VAPID Keys

Push notifications are optional. To enable:

```bash
# Generate VAPID keys (run once)
npx wrangler secret put VAPID_PUBLIC_KEY
# Enter the generated public key

npx wrangler secret put VAPID_PRIVATE_KEY
# Enter the generated private key
```

### Local Development (`.env.local`)

Keep `.env.local` for local dev only (NOT committed to git):

```env
JWT_SECRET=local-dev-secret-key-for-queueflow-256bits!!
```

---

## 7. Step 5 — Apply Database Schema

The schema file is `schema.sql` (361 lines, 18 tables + indexes + triggers).

### Apply to Remote D1

```bash
npx wrangler d1 execute queueflow-db --remote --file=./schema.sql
```

### Verify Schema

```bash
npx wrangler d1 execute queueflow-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected output (18 tables):
```
┌─────────────────────────┐
│ name                    │
├─────────────────────────┤
│ agent_activity_log      │
│ appointments            │
│ audit_log               │
│ customer_profiles       │
│ customer_queue_entries  │
│ feedback                │
│ master_tenant_admins    │
│ master_tenants          │
│ notifications           │
│ platform_admins         │
│ push_subscriptions      │
│ queues                  │
│ service_windows         │
│ staff_activity_log      │
│ tenants                 │
│ tickets                 │
│ webhooks                │
│ users                   │
└─────────────────────────┘
```

### Seed Demo Data (Optional)

Demo data is auto-seeded on first login via `ensureDemoData()` in `src/lib/auth.ts`. No manual seeding needed — just log in and the admin + tenant accounts are created automatically.

**Demo Accounts:**

| Role | Email | Password |
|------|-------|----------|
| Platform Admin | admin@yourqueueapp.com | Admin@2024!Secure |
| Master Tenant Admin | hq@cityhealthgroup.com | Manager@2024!Secure |
| QuickBite Manager | manager@quickbiterestaurant.com | Manager@2024!Secure |
| GreenBank Manager | manager@greenbankbranch.com | Manager@2024!Secure |

> ⚠️ **Change all default passwords immediately after first login in production!**

---

## 8. Step 6 — Build for Cloudflare

The `@opennextjs/cloudflare` adapter converts the Next.js build output into a Cloudflare Worker.

### Standard Build

```bash
npx opennextjs-cloudflare build
```

This runs internally:
1. `next build` — Standard Next.js build
2. Adapter transforms — Converts `.next/` output into `.open-next/` with:
   - `.open-next/worker.js` — The Cloudflare Worker entry point
   - `.open-next/assets/` — Static assets for Cloudflare CDN

Expected output:
```
▲ Next.js 16.2.10 (Turbopack)
✓ Compiled successfully
✓ Finished TypeScript
✓ Generating static pages

✨ OpenNext built successfully in .open-next/
```

### Verify Build Output

```bash
ls -la .open-next/
# Should show:
#   worker.js    — Worker entry point
#   assets/      — Static assets directory

ls -la .open-next/assets/ | head -10
# Should show bundled JS/CSS files
```

### If Build Fails

Common issues:
- **TypeScript errors**: Run `npx next build` first to see detailed errors
- **Missing packages**: Run `bun install` or `npm install`
- **Outdated wrangler**: Run `npx wrangler --version` (needs 3.x+)

---

## 9. Step 7 — Local Preview with Wrangler

Test the full Cloudflare stack locally before deploying.

### Start Local Preview

```bash
npx wrangler dev
```

This starts a local Cloudflare Worker with all bindings (D1 local, R2 local, KV local) on `http://localhost:8787` by default.

### Test Endpoints

```bash
# Health check
curl http://localhost:8787/api/health
# → {"status":"ok","timestamp":"..."}

# Homepage
curl -sI http://localhost:8787/
# → HTTP/1.1 200 OK
```

### Important: Local D1 vs Remote D1

- **`wrangler dev`** uses a **local** D1 SQLite file (empty by default)
- You must apply the schema to the local D1 separately:

```bash
npx wrangler d1 execute queueflow-db --local --file=./schema.sql
```

- Or use `--remote` flag to test against the real D1:

```bash
npx wrangler dev --remote
```

> 💡 **Tip**: Use `--remote` to test against your production D1 database locally.

---

## 10. Step 8 — Deploy to Production

### Deploy

```bash
npx opennextjs-cloudflare deploy
```

This is equivalent to:
```bash
npx opennextjs-cloudflare build && npx wrangler deploy
```

### Expected Output

```
✨ Built successfully
Published queueflow (production)
  https://queueflow.<your-subdomain>.workers.dev
```

### Verify Deployment

```bash
# Health check on live site
curl https://queueflow.<your-subdomain>.workers.dev/api/health

# Check homepage
curl -sI https://queueflow.<your-subdomain>.workers.dev/
```

---

## 11. Step 9 — Custom Domain Setup

### Option A: Workers Custom Domain (Recommended)

1. Go to Cloudflare Dashboard → Workers & Pages → queueflow → Settings → Domains & Routes
2. Click "Add" → "Custom Domain"
3. Enter your domain (e.g., `queue.yourdomain.com`)
4. The domain must be on Cloudflare DNS (nameservers pointing to Cloudflare)
5. Cloudflare automatically provisions the SSL certificate

### Option B: Route via Cloudflare DNS

1. Go to your domain's DNS settings in Cloudflare Dashboard
2. Add a DNS record:
   - **Type**: `CNAME`
   - **Name**: `queue` (or your preferred subdomain)
   - **Target**: `queueflow.<your-subdomain>.workers.dev`
   - **Proxy**: Proxied (orange cloud)

### Option C: Cloudflare Pages (Alternative)

You can also deploy via Cloudflare Pages with a Workers backend:
1. Push code to GitHub
2. Connect repo in Cloudflare Pages
3. Build command: `npx opennextjs-cloudflare build`
4. Output directory: `.open-next/assets`

---

## 12. Step 10 — Post-Deployment Verification

### Health Check

```bash
curl -s https://queue.yourdomain.com/api/health | jq
# → { "status": "ok", "timestamp": "..." }
```

### Login Test

```bash
# Platform Admin login
curl -s -X POST https://queue.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourqueueapp.com","password":"Admin@2024!Secure"}' | jq
# → { "token": "eyJhbG...", "user": { ... } }
```

### Dashboard Access

1. Open `https://queue.yourdomain.com` in a browser
2. Click "Get Started Free" or go to Dashboard
3. Log in with the Platform Admin credentials
4. Verify:
   - Dashboard loads with analytics
   - Tenant list is visible
   - Navigation works between sections

### API Endpoints to Verify

```bash
BASE="https://queue.yourdomain.com"

# Get tenant display (public)
curl -s "$BASE/api/tenants/tenant-quickbite/display" | jq

# Queue list (requires auth)
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@quickbiterestaurant.com","password":"Manager@2024!Secure"}' | jq -r '.token')

curl -s "$BASE/api/queues" \
  -H "Authorization: Bearer $TOKEN" | jq '.queues | length'
```

---

## 13. Ongoing Operations

### Applying Schema Changes (Migrations)

D1 supports migrations. Create numbered migration files:

```bash
mkdir -p migrations
```

Create `migrations/0001_add_new_column.sql`:
```sql
ALTER TABLE tenants ADD COLUMN phone TEXT;
```

Apply migration:
```bash
# Local
npx wrangler d1 migrations apply queueflow-db --local

# Remote
npx wrangler d1 migrations apply queueflow-db --remote
```

### Redeploying After Code Changes

```bash
# One command: build + deploy
npx opennextjs-cloudflare deploy
```

### Viewing Logs

```bash
# Real-time logs (tail)
npx wrangler tail

# Filter by status
npx wrangler tail --status error

# Filter by endpoint
npx wrangler tail --search "/api/auth/login"
```

### Database Operations

```bash
# Query remote D1
npx wrangler d1 execute queueflow-db --remote --command="SELECT COUNT(*) as total FROM tickets"

# Backup (dump)
npx wrangler d1 export queueflow-db --remote --output=backup-$(date +%Y%m%d).sql

# Import (restore)
npx wrangler d1 execute queueflow-db --remote --file=backup-20250101.sql
```

### R2 Storage Management

```bash
# List objects
npx wrangler r2 object list queueflow-storage --prefix="logos/"

# Delete object
npx wrangler r2 object delete queueflow-storage logos/tenant-123/uuid.png

# Get object info
npx wrangler r2 object get queueflow-storage logos/tenant-123/uuid.png --file=./downloaded.png
```

### KV Management

```bash
# List keys (for debugging rate limits)
npx wrangler kv key list --namespace-id=<your-kv-id> --prefix="api:"

# Get a key's value
npx wrangler kv get --namespace-id=<your-kv-id> "api:192.168.1.1"

# Delete a key
npx wrangler kv delete --namespace-id=<your-kv-id> "api:192.168.1.1"
```

---

## 14. Troubleshooting

### Build Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module 'bun:sqlite'` | Still using local SQLite code | Ensure `src/lib/db.ts` uses `getCloudflareContext()` |
| `Cannot find name 'KVNamespace'` | Missing type reference | Ensure `src/types/cloudflare.d.ts` has `/// <reference types="@cloudflare/workers-types" />` |
| `Property 'email' does not exist on type 'unknown'` | `Body.json()` returns `unknown` | Ensure `cloudflare.d.ts` overrides `Body.json()` to return `Promise<any>` |
| `Module not found: jose` | Missing dependency | `bun install` or `npm install` |
| `output: "standalone" missing` | Wrong next.config.ts | Ensure `next.config.ts` has `output: "standalone"` |

### Runtime Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `DB is not defined` | D1 binding not configured | Check `wrangler.jsonc` `d1_databases` section |
| `STORAGE is not defined` | R2 binding not configured | Check `wrangler.jsonc` `r2_buckets` section |
| `D1_ERROR: no such table` | Schema not applied | Run `npx wrangler d1 execute queueflow-db --remote --file=./schema.sql` |
| `Invalid or expired token` | JWT_SECRET mismatch | Ensure same `JWT_SECRET` in Wrangler secrets and app |
| `429 Too Many Requests` | Rate limit hit | Check KV namespace is configured; limits reset automatically |
| `Worker exceeded CPU time limit` | Heavy computation in request | Optimize queries; D1 has a 50ms CPU limit per query on free plan |

### D1 Limitations to Be Aware Of

| Limit | Free Plan | Paid ($5/mo) |
|-------|-----------|--------------|
| Database size | 5 GB | 5 GB (can request more) |
| Reads per day | 5 million | 25 billion |
| Writes per day | 100,000 | 500,000 |
| Row size | 1 MB | 1 MB |
| Query size (SQL) | 100 KB | 100 KB |
| `SELECT` result size | 1 MB | 1 MB |
| Storage per DB | 5 GB | 5 GB (can request more) |

### Worker Size Limits

| Resource | Limit |
|----------|-------|
| Worker script size | 10 MB (compressed) after bundling |
| Request body size | 100 MB |
| Subrequest limit | 50 per request |
| CPU time (free) | 10 ms |
| CPU time (paid) | 30 s (Standard) |
| Memory | 128 MB |

---

## 15. Cost Estimates

### Free Tier (No Credit Card Required)

| Service | Free Allowance | Cost |
|---------|---------------|------|
| Workers | 100,000 requests/day | $0 |
| D1 | 5 GB storage, 5M reads/day, 100K writes/day | $0 |
| R2 | 10 GB storage, 10M Class B ops/mo, 1M Class A ops/mo | $0 |
| KV | 100K reads/day, 1K writes/day | $0 |
| **Total** | | **$0/mo** |

### Paid Tier (Unbound Workers — $5/mo)

| Service | Allowance | Cost |
|---------|-----------|------|
| Workers (Unbound) | 10M requests/mo included, $0.30/additional million | $5/mo |
| D1 | 25B reads, 500K writes included, then $0.75/M reads, $1.25/M writes | $5/mo + overages |
| R2 | 10 GB included, $0.015/GB/mo additional | Pay per use |
| KV | 10M reads, 1M writes included | $5/mo included |
| **Total** | Suitable for small-medium production | **~$5-15/mo** |

---

## 16. Security Checklist

- [ ] **JWT_SECRET** — Set as Wrangler encrypted secret (NOT in code)
- [ ] **Change default passwords** — All demo accounts have known passwords
- [ ] **D1 schema applied** — All tables, indexes, triggers created
- [ ] **R2 bucket public access** — Disabled (default); only accessible via Worker
- [ ] **HTTPS enforced** — Automatic via Cloudflare
- [ ] **Security headers** — Set in `middleware.ts` (X-Content-Type-Options, X-Frame-Options, etc.)
- [ ] **CSRF protection** — Enabled for state-changing API routes via `X-CSRF-Token` header
- [ ] **Rate limiting** — KV-backed distributed rate limiting on API routes
- [ ] **Bcrypt password hashing** — 12 salt rounds (industry standard)
- [ ] **JWT expiry** — 24-hour token expiry
- [ ] **Webhook HMAC signatures** — SHA256 signed per-tenant secrets
- [ ] **No `ignoreBuildErrors`** — TypeScript strict mode catches bugs at build time
- [ ] **No sensitive data in logs** — Webhook secrets are masked in API responses
- [ ] **CORS** — `allowedDevOrigins` restricted to known preview domains

---

## 17. Quick Reference — All Commands

```bash
# ═══════════════════════════════════════════════════════════════════
# SETUP (One-time)
# ═══════════════════════════════════════════════════════════════════

# Login to Cloudflare
npx wrangler login

# Create resources
npx wrangler d1 create queueflow-db          # Save the database_id
npx wrangler r2 bucket create queueflow-storage
npx wrangler kv namespace create "queueflow-rate-limit"  # Save the id

# Set secrets
npx wrangler secret put JWT_SECRET

# Apply schema
npx wrangler d1 execute queueflow-db --remote --file=./schema.sql

# ═══════════════════════════════════════════════════════════════════
# LOCAL DEVELOPMENT
# ═══════════════════════════════════════════════════════════════════

# Standard Next.js dev server (local D1 via opennext proxy)
bun run dev

# Wrangler local preview (Cloudflare runtime locally)
npx wrangler dev                # Local bindings
npx wrangler dev --remote       # Remote D1, local R2/KV

# Apply schema to local D1
npx wrangler d1 execute queueflow-db --local --file=./schema.sql

# ═══════════════════════════════════════════════════════════════════
# BUILD & DEPLOY
# ═══════════════════════════════════════════════════════════════════

# Build for Cloudflare
npx opennextjs-cloudflare build

# Deploy to Cloudflare Workers
npx wrangler deploy

# Build + Deploy in one step
npx opennextjs-cloudflare deploy

# ═══════════════════════════════════════════════════════════════════
# OPERATIONS
# ═══════════════════════════════════════════════════════════════════

# View live logs
npx wrangler tail

# Query remote database
npx wrangler d1 execute queueflow-db --remote --command="SELECT COUNT(*) FROM tickets"

# Backup database
npx wrangler d1 export queueflow-db --remote --output=backup.sql

# Run migrations
npx wrangler d1 migrations apply queueflow-db --remote

# Standard Next.js build (TypeScript check)
bun run build
```