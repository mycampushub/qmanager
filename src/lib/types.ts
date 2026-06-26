export type TicketStatus = 'WAITING' | 'SERVING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
export type UserRole = 'MANAGER' | 'AGENT';
export type PlanTier = 'FREE' | 'PRO' | 'ENTERPRISE';
export type AppView = 'marketing' | 'join' | 'dashboard' | 'display' | 'admin' | 'masterTenant' | 'kiosk';

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

export interface ServiceLog {
  id: string;
  tenantId: string;
  agentId: string | null;
  ticketId: string;
  durationSeconds: number | null;
  createdAt: string;
}

export interface AuthResponse {
  user: StaffUser;
  token: string;
  csrfToken?: string;
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

export interface JoinQueueRequest {
  tenantId: string;
  queueId: string;
  customerName: string;
  customerPhone?: string;
}

export interface TicketActionRequest {
  ticketId: string;
  agentId?: string;
}

// WebSocket events
export interface WSEvent {
  type: 'TICKET_CREATED' | 'TICKET_CALLED' | 'TICKET_COMPLETED' | 'TICKET_SKIPPED' | 'TICKET_CANCELLED' | 'QUEUE_UPDATE';
  tenantId: string;
  queueId?: string;
  payload: Record<string, unknown>;
}