export type TicketStatus = 'WAITING' | 'SERVING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
type UserRole = 'MANAGER' | 'AGENT';
type PlanTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export type AppView = 'marketing' | 'join' | 'dashboard' | 'display' | 'admin' | 'masterTenant' | 'signup';
// NOTE: 'kiosk' was removed — end users join only via QR code / direct link (?tenant=xxx)

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  logoText: string;
  welcomeMessage: string;
}

export interface Tenant {
  id: string;
  name: string;
  masterTenantId: string | null;
  planTier: PlanTier;
  walletBalance: number;
  brandingConfig: string | null;
  welcomeMessage: string | null;
  isActive: boolean;
  createdAt: string;
  masterTenant?: { id: string; corporateName: string } | null;
  _queues?: Queue[];
  _queueCount?: number;
  _activeTickets?: number;
}

export interface Queue {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  defaultServiceTimeSec: number;
  prefix: string;
  currentSerial: number;
  nowServingSerial: number;
  isActive: boolean;
  _waitingCount?: number;
  _servingCount?: number;
  _activeTickets?: number;
  _avgServiceTime?: number;
  _ewt?: number; // Estimated Wait Time in seconds
}

export interface Ticket {
  id: string;
  tenantId: string;
  queueId: string;
  serialNumber: number;
  status: TicketStatus;
  customerName: string;
  customerPhone: string | null;
  deviceId: string | null;
  notes: string | null;
  createdAt: string;
  servedAt: string | null;
  completedAt: string | null;
  cancelledAt?: string | null;
  skippedAt?: string | null;
  servedByAgent?: string | null;
  skipCount?: number;
  queue?: Queue;
  tenant?: Tenant;
  _formattedSerial?: string;
  _peopleAhead?: number;
  _ewt?: number;
  _position?: number;
}

export interface StaffUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  type?: 'staff' | 'platform_admin';
  isActive: boolean;
  tenant?: Tenant;
}

export interface UsageLedger {
  id: string;
  tenantId: string;
  ticketId: string;
  costCents: number;
  createdAt: string;
}

export interface AnalyticsData {
  totalTickets: number;
  completedToday: number;
  skippedToday: number;
  avgWaitTimeSec: number;
  avgServiceTimeSec: number;
  peakHour: string;
  queueStats: Array<{
    queueId: string;
    queueName: string;
    prefix: string;
    waiting: number;
    serving: number;
    completed: number;
    avgServiceTime: number;
    ewt: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: 'JOINED' | 'CALLED' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
    customerName: string;
    ticketSerial: string;
    queueName: string;
    timestamp: string;
  }>;
}

// ─── Database Row Types (mirrors schema.sql) ───────────────
export interface PlatformAdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface MasterTenantRow {
  id: string;
  corporate_name: string;
  billing_status: string;
  created_at: string;
  updated_at: string;
}

export interface MasterTenantAdminRow {
  id: string;
  master_tenant_id: string;
  email: string;
  name: string;
  password_hash: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface TenantRow {
  id: string;
  name: string;
  master_tenant_id: string | null;
  plan_tier: string;
  wallet_balance: number;
  branding_config: string | null;
  welcome_message: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface QueueRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  default_service_time_sec: number;
  prefix: string;
  current_serial: number;
  now_serving_serial: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface TicketRow {
  id: string;
  tenant_id: string;
  queue_id: string;
  serial_number: number;
  status: string;
  customer_name: string;
  customer_phone: string | null;
  device_id: string | null;
  notes: string | null;
  served_by_agent: string | null;
  skip_count: number;
  created_at: string;
  served_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  skipped_at: string | null;
}

export interface UsageLedgerRow {
  id: string;
  tenant_id: string;
  ticket_id: string;
  cost_cents: number;
  created_at: string;
}

export interface ServiceLogRow {
  id: string;
  tenant_id: string;
  queue_id: string;
  agent_id: string | null;
  ticket_id: string;
  duration_seconds: number | null;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  tenant_id: string;
  type: string;
  amount_cents: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  tenant_id: string;
  ticket_id: string | null;
  endpoint: string;
  keys_json: string;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_type: string;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface PlanLimitRow {
  id: string;
  plan_tier: string;
  max_queues: number;
  max_staff: number;
  max_tickets_per_day: number;
  price_monthly_cents: number;
}

export interface ServiceWindowRow {
  id: string;
  tenant_id: string;
  queue_id: string | null;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface FeedbackRow {
  id: string;
  tenant_id: string;
  ticket_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface AppointmentRow {
  id: string;
  tenant_id: string;
  queue_id: string;
  customer_name: string;
  customer_phone: string | null;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  notes: string | null;
  ticket_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  events: string;
  secret: string;
  is_active: number;
  success_count: number;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerProfileRow {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  total_visits: number;
  total_tickets: number;
  completed_tickets: number;
  avg_service_time: number | null;
  last_visit_at: string | null;
  created_at: string;
  updated_at: string;
}
