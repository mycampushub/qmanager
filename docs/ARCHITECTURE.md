# QueueFlow Architecture

## Overview
QueueFlow is a multi-tenant SaaS queue management system. The architecture follows a 3-tier user hierarchy with row-level tenant isolation.

## Authentication Flow
1. User submits email/password to `/api/auth/login`
2. Server verifies credentials against bcrypt hash
3. Server issues JWT (HS256, 24h expiry) with userId, tenantId, role, type
4. Client stores token in localStorage
5. All authenticated requests include `Authorization: Bearer <token>`
6. `withAuth()` wrapper validates JWT, checks account active, enforces RBAC

## Ticket State Machine
```
WAITING → SERVING (call) → COMPLETED (complete)
                     ↘ SKIPPED (skip) → re-enters WAITING queue
                     ↘ CANCELLED (cancel) → wallet refund
```

## Multi-Tenant Isolation
- Every tenant-scoped table includes `tenant_id`
- All queries filter by tenant_id
- Master tenants can manage multiple sub-tenants
- Platform admins have global access

## Real-Time Updates
- Client polls `/api/tenants/:id/poll` every 3 seconds
- Response contains minimal data: queue id, now_serving_serial, current_serial
- Client detects changes by comparing JSON snapshots
- Events emitted: TICKET_CALLED, TICKET_CREATED, QUEUE_UPDATE

## Billing Model
- Pay-per-entry: 100 cents deducted per ticket created
- Wallet balance tracked per tenant
- Automatic refund on ticket cancellation
- Platform admin can top up wallet via payments API

## Security
- JWT with 24h expiry
- bcryptjs (12 rounds) for password hashing
- CSRF protection via X-CSRF-Token header (64-char hex validation)
- Rate limiting (in-memory, per IP)
- Security headers via middleware
- RBAC: PLATFORM_ADMIN, MASTER_TENANT_ADMIN, MANAGER, AGENT