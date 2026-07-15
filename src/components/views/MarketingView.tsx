'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Menu,
  X,
  QrCode,
  Radio,
  Building2,
  Coins,
  Clock,
  Monitor,
  ArrowRight,
  Check,
  Zap,
  Shield,
  ShieldCheck,
  Users,
  Ticket,
  Bell,
  Smartphone,
  Star,
  ChevronRight,
  ChevronDown,
  Send,
  MessageSquare,
  HelpCircle,
  DollarSign,
  Lock,
  FileText,
  Activity,
  Plus,
  RefreshCw,
  Search,
  Database,
  BarChart3,
  Heart,
  Landmark,
  Building,
  GraduationCap,
  ShoppingCart,
  Stethoscope,
  Wrench,
  Plane,
  FlaskConical,
  TrendingUp,
  Globe,
  Eye,
  LayoutGrid,
  Layers,
  ArrowUpRight,
  Printer,
  Timer,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: 'easeOut' as const },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */
const stats = [
  { label: 'Businesses Served', value: '500+', icon: Building2 },
  { label: 'Tickets Processed', value: '2M+', icon: Ticket },
  { label: 'Platform Uptime', value: '99.9%', icon: Shield },
  { label: 'Avg Response Time', value: '<50ms', icon: Zap },
];

const features = [
  {
    icon: QrCode,
    title: 'QR Code Instant Join',
    desc: 'Customers scan a QR code and join your queue in seconds — no app download required. A true QR queue management experience that eliminates physical touchpoints.',
  },
  {
    icon: Radio,
    title: 'Real-Time Position Tracking',
    desc: 'Live updates keep everyone informed about their place in line. This online queue system provides instant visibility to every waiting customer.',
  },
  {
    icon: Building2,
    title: 'Multi-Branch Queue Management',
    desc: 'Manage every branch from one dashboard. Perfect for franchises and chains that need centralized control over all locations.',
  },
  {
    icon: Coins,
    title: 'Pay-Per-Entry Billing',
    desc: 'The most affordable queue management pricing model available. Only pay for tickets served — no subscriptions, no contracts, no hidden costs.',
  },
  {
    icon: Clock,
    title: 'Smart Wait Time Estimation',
    desc: 'Dynamic calculations adapt to real-time conditions, giving customers accurate wait estimates so they can plan their time wisely.',
  },
  {
    icon: Monitor,
    title: 'TV Display Module',
    desc: 'A full-screen waiting room display that auto-rotates and announces the next customer. Ideal for busy service halls.',
  },
];

const steps = [
  {
    num: 1,
    title: 'Customer Scans a QR Code',
    desc: 'A QR code at your entrance, on a poster, or shared via link lets anyone join your electronic queue management system instantly from their phone.',
    icon: QrCode,
  },
  {
    num: 2,
    title: 'Receives a Digital Ticket',
    desc: 'Their phone shows their live position and estimated wait time — updated in real time. This virtual queue management approach means they can wait from anywhere nearby.',
    icon: Smartphone,
  },
  {
    num: 3,
    title: 'Notified When It\'s Their Turn',
    desc: 'A push notification alerts them so they arrive just in time. The result? You reduce customer waiting frustration and keep your service area uncrowded.',
    icon: Bell,
  },
];

const noItems = [
  'No monthly subscription required',
  'No annual contract or lock-in',
  'No hidden fees or surprises',
  'No per-location charges',
  'No per-counter charges',
  'No per-agent charges',
  'No per-room charges',
  'No ticket expiration',
];

const comparisonRows = [
  { feature: 'Monthly Subscription', traditional: '$29–$499/mo', queueflow: 'None' },
  { feature: 'Annual Contract', traditional: '1–3 year lock-in', queueflow: 'None' },
  { feature: 'Per Branch Pricing', traditional: 'Per location fee', queueflow: 'Unlimited' },
  { feature: 'Per Counter Pricing', traditional: 'Per counter fee', queueflow: 'Unlimited' },
  { feature: 'Per User Pricing', traditional: 'Per agent fee', queueflow: 'Unlimited' },
  { feature: 'Hardware Lock-in', traditional: 'Required', queueflow: 'Cloud & QR' },
  { feature: 'Feature Restrictions', traditional: 'Tiers & paywalls', queueflow: 'Everything Included' },
  { feature: 'Expiring Credits', traditional: 'Monthly reset', queueflow: 'Never' },
  { feature: 'Hidden Charges', traditional: 'Setup & add-ons', queueflow: 'None' },
  { feature: 'Upgrade Fees', traditional: '$50–$200/upgrade', queueflow: 'None' },
  { feature: 'Setup Fees', traditional: '$100–$500', queueflow: 'None' },
  { feature: 'Pay As You Grow', traditional: 'No', queueflow: 'Yes' },
];

const whyChooseUs = [
  {
    icon: Smartphone,
    label: 'Phone-First Design',
    desc: 'Built for the devices your customers already carry.',
  },
  {
    icon: QrCode,
    label: 'QR-Based Entry',
    desc: 'No app installs — scan and go with this QR code queue system.',
  },
  {
    icon: X,
    label: 'No App Installation',
    desc: 'Customers join directly from their mobile browser.',
  },
  {
    icon: Layers,
    label: 'Unlimited Locations',
    desc: 'Multi-branch queue management at no extra cost.',
  },
  {
    icon: LayoutGrid,
    label: 'Unlimited Counters',
    desc: 'Add as many service counters as you need.',
  },
  {
    icon: Radio,
    label: 'Cloud-Based Platform',
    desc: 'This cloud queue management system runs entirely online.',
  },
  {
    icon: Coins,
    label: '300 Free Tickets',
    desc: 'Start risk-free with generous complimentary tickets.',
  },
  {
    icon: Shield,
    label: 'No Contracts',
    desc: 'Cancel anytime — you\'re never locked in.',
  },
  {
    icon: DollarSign,
    label: 'Just $0.01 Per Ticket',
    desc: 'The most affordable queue management model available.',
  },
  {
    icon: Clock,
    label: 'Tickets Never Expire',
    desc: 'Your purchased credits stay in your wallet forever.',
  },
  {
    icon: TrendingUp,
    label: 'Pay As You Grow',
    desc: 'Scale up or down without penalties or commitments.',
  },
  {
    icon: Printer,
    label: 'Eliminate Paper Tickets',
    desc: 'Go fully digital — no more wasteful printed tickets.',
  },
];

const benefits = [
  {
    icon: Zap,
    title: 'Faster Customer Service',
    desc: 'Serve customers faster with smart queue routing and real-time status updates. This customer queue management approach keeps your service flow smooth and predictable.',
  },
  {
    icon: Clock,
    title: 'Shorter Perceived Wait Times',
    desc: 'Accurate wait time estimates and live position tracking reduce customer waiting frustration significantly. People feel in control when they can see their progress.',
  },
  {
    icon: Star,
    title: 'Better Customer Experience',
    desc: 'QR-based entry means zero friction. Your queue management application lets customers join from their phone in seconds and wait comfortably until their turn.',
  },
  {
    icon: Building2,
    title: 'More Organized Operations',
    desc: 'Multi-queue support, agent assignments, and service windows keep everything running smoothly. A proper queue management platform eliminates chaos from your service floor.',
  },
  {
    icon: Users,
    title: 'Improve Staff Productivity',
    desc: 'Agents focus on serving customers, not managing crowds. One-click call next, complete, and skip actions streamline every interaction at the counter.',
  },
  {
    icon: Eye,
    title: 'Gain Real-Time Operational Insights',
    desc: 'Live dashboards show queue lengths, wait times, agent performance, and service trends — all the data you need to optimize your daily operations.',
  },
];

const industries = [
  { icon: Heart, name: 'Healthcare & Hospitals', color: 'bg-rose-50 text-rose-600', desc: 'Patient queue management for OPD, labs, and pharmacy counters' },
  { icon: Landmark, name: 'Banks & Financial', color: 'bg-amber-50 text-amber-600', desc: 'Streamline teller queues and customer service operations' },
  { icon: Building, name: 'Government Offices', color: 'bg-slate-100 text-slate-600', desc: 'Reduce wait times for public services and civic operations' },
  { icon: GraduationCap, name: 'Education', color: 'bg-violet-50 text-violet-600', desc: 'Manage admissions, registration, and counseling queues' },
  { icon: ShoppingCart, name: 'Retail & Commerce', color: 'bg-orange-50 text-orange-600', desc: 'Customer service desks and return counter management' },
  { icon: Stethoscope, name: 'Clinics & Diagnostics', color: 'bg-teal-50 text-teal-600', desc: 'Walk-in consultations, sample collection, and report pickup' },
  { icon: Radio, name: 'Telecom Services', color: 'bg-cyan-50 text-cyan-600', desc: 'Customer support and SIM registration queue flow' },
  { icon: Wrench, name: 'Service Centers', color: 'bg-gray-100 text-gray-600', desc: 'Auto repair, electronics, and maintenance job queues' },
  { icon: Building2, name: 'Municipal Services', color: 'bg-emerald-50 text-emerald-600', desc: 'Utility payments, permits, and civic document processing' },
  { icon: Shield, name: 'Immigration & Passport', color: 'bg-sky-50 text-sky-600', desc: 'Visa processing and passport application queues' },
  { icon: Plane, name: 'Airports & Travel', color: 'bg-fuchsia-50 text-fuchsia-600', desc: 'Check-in counters, boarding gates, and customer service' },
  { icon: FlaskConical, name: 'Diagnostic Labs', color: 'bg-purple-50 text-purple-600', desc: 'Sample collection and report delivery queue tracking' },
];

const infrastructureSteps = [
  { icon: Plus, label: 'Create Ticket' },
  { icon: RefreshCw, label: 'Update Queue Status' },
  { icon: Search, label: 'Read Queue Position' },
  { icon: Bell, label: 'Call Next Customer' },
  { icon: Database, label: 'Store Logs' },
  { icon: BarChart3, label: 'Read Dashboard' },
  { icon: QrCode, label: 'QR Code Lookup' },
];

const securityFeatures = [
  {
    icon: Lock,
    title: 'End-to-End Encryption',
    desc: 'All data encrypted in transit and at rest with industry-standard security protocols.',
  },
  {
    icon: Users,
    title: 'Role-Based Access Control',
    desc: 'Granular permissions ensure staff only see and do what their role allows.',
  },
  {
    icon: FileText,
    title: 'Comprehensive Audit Logs',
    desc: 'Every action is logged and auditable for full compliance and accountability.',
  },
  {
    icon: Activity,
    title: 'High Availability',
    desc: 'Our globally distributed network ensures 99.9% uptime with automatic failover.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Authentication',
    desc: 'Multi-factor authentication with session management and automatic timeout protection.',
  },
];

const faqs = [
  {
    q: 'How does QueueFlow\'s queue management system work?',
    a: 'Customers scan a QR code or visit your unique link, select a service queue, and receive a digital ticket. They can track their position in real time and receive push notifications when their turn approaches — no app download required. Your staff manages everything from a simple dashboard where they call, serve, or skip tickets with one click.',
  },
  {
    q: 'What is virtual queue management and how is it different from traditional queuing?',
    a: 'Virtual queue management replaces physical lines with a digital system. Instead of standing in a crowded waiting area, customers join remotely via their phone, get a ticket number, and wait comfortably elsewhere. They receive real-time updates and are notified when it\'s their turn. This approach lets customers wait from anywhere while you maintain orderly service flow.',
  },
  {
    q: 'Is there a free trial available?',
    a: 'Yes! You get started immediately with 300 free tickets, 2 queues, and 3 staff accounts — no credit card required. Experience the full power of our digital queue management platform before deciding to grow. Top up your wallet anytime with pay-per-ticket billing.',
  },
  {
    q: 'Can I manage every branch from one dashboard?',
    a: 'Absolutely. Our multi-branch queue management lets you oversee all your locations from a single centralized dashboard. Create queues, assign staff, view analytics, and manage operations across every branch without switching between accounts. It\'s designed for franchises, chains, and enterprise queue management.',
  },
  {
    q: 'How does the QR code queue system work for walk-in customers?',
    a: 'Place a QR code at your entrance, on posters, or share it digitally. Customers scan it with their phone camera, select their service type, and instantly receive a digital ticket. This QR queue management approach requires no app installation — it works directly in the mobile browser. Walk-in customers can also be added manually by your staff at the counter.',
  },
  {
    q: 'Can I eliminate paper tickets completely?',
    a: 'Yes. QueueFlow is designed as a fully digital queue ticket system. Every aspect — from ticket creation to customer notifications to status tracking — happens electronically. You can eliminate paper tickets entirely, saving printing costs and reducing waste while providing a more professional customer experience.',
  },
  {
    q: 'What happens when my wallet balance runs low?',
    a: 'You receive a low-balance warning notification well in advance. If your balance reaches zero, new ticket creation is paused until you top up. Existing tickets in the queue continue to be served normally. Top up any time — your credits never expire.',
  },
  {
    q: 'Is my data secure with this queue management solution?',
    a: 'Absolutely. All data is encrypted in transit and at rest using industry-standard protocols. We implement role-based access control, multi-factor authentication, and comprehensive audit logging. Your customer data stays protected within our secure infrastructure, which runs on a globally distributed network with 99.9% uptime.',
  },
  {
    q: 'How can this online queue system help reduce customer waiting frustration?',
    a: 'By letting customers wait from anywhere instead of standing in line. Real-time position tracking and accurate wait estimates give people a sense of control. Push notifications mean they arrive just in time — no more guessing or anxiety. Studies show that perceived wait time drops significantly when customers can track their progress digitally.',
  },
  {
    q: 'Does this support enterprise queue management for large organizations?',
    a: 'Yes. Our platform is built for scale — from single-location clinics to nationwide government services. Enterprise queue management features include multi-branch oversight, detailed analytics, custom branding, role-based permissions, API access, and dedicated support. Whether you have 5 or 500 locations, the system handles it seamlessly.',
  },
];

const pricing = [
  {
    name: 'Free',
    price: '0',
    period: '/mo',
    badge: null,
    features: ['2 queues', '3 staff members', '50 tickets/day', 'Basic analytics', 'QR code generation', 'Email support'],
    cta: 'Start Free Trial',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '999',
    period: '/mo',
    badge: 'Recommended',
    features: [
      '10 queues',
      '15 staff members',
      '500 tickets/day',
      'Custom branding',
      'Advanced analytics',
      'Smart wait time algorithm',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '4,999',
    period: '/mo',
    badge: null,
    features: [
      'Unlimited queues',
      'Unlimited staff',
      'Unlimited tickets',
      'Custom branding & white-label',
      'Full API access',
      'Multi-branch hierarchy',
      'Dedicated account manager',
      'Priority 24/7 support',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const navLinks = ['Features', 'How It Works', 'Compare', 'Industries', 'Pricing', 'Security', 'FAQ', 'Contact'];

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function MarketingView() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ============================================================ */}
      {/*  NAV BAR                                                      */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2 active:scale-95 transition-transform">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">
              Queue<span className="text-emerald-600">Flow</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
            {navLinks.map((item) => (
              <button
                key={item}
                onClick={() => scrollTo(item.toLowerCase().replace(/ /g, '-'))}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-emerald-600"
              >
                {item}
              </button>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-gray-600 hover:text-emerald-600"
              onClick={() => window.location.href = '/dashboard'}
            >
              Login
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200"
              onClick={() => useAppStore.getState().setCurrentView('signup')}
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors active:scale-95 transition-transform"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden border-t border-gray-100 bg-white overflow-hidden"
            >
              <div className="flex flex-col gap-1 px-4 py-4">
                {navLinks.map((item) => (
                  <button
                    key={item}
                    onClick={() => scrollTo(item.toLowerCase().replace(/ /g, '-'))}
                    className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    {item}
                  </button>
                ))}
                <Separator className="my-2" />
                <Button
                  variant="ghost"
                  className="justify-start text-gray-600 hover:text-emerald-600"
                  onClick={() => { setMobileOpen(false); window.location.href = '/dashboard'; }}
                >
                  Login
                </Button>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => { setMobileOpen(false); useAppStore.getState().setCurrentView('signup'); }}
                >
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">
        {/* ============================================================ */}
        {/*  HERO                                                         */}
        {/* ============================================================ */}
        <section
          id="hero"
          className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400"
        >
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-teal-300/20 blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Text */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="text-center lg:text-left"
              >
                <motion.div variants={fadeUp}>
                  <Badge className="mb-6 bg-white/20 text-white border-white/30 hover:bg-white/30 backdrop-blur-sm px-4 py-1.5 text-sm">
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                    Trusted by 500+ Businesses Worldwide
                  </Badge>
                </motion.div>

                <motion.h1
                  variants={fadeUp}
                  className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-tight"
                >
                  Eliminate Waiting Lines with{' '}
                  <span className="underline decoration-emerald-300/60 decoration-4 underline-offset-4">
                    Smart Queue Management
                  </span>
                </motion.h1>

                <motion.p
                  variants={fadeUp}
                  className="mx-auto mt-6 max-w-xl text-lg text-emerald-50/90 sm:text-xl lg:mx-0"
                >
                  A digital queue management platform that lets your customers wait
                  comfortably from anywhere and arrive just in time. Set up in under 2 minutes
                  with zero hardware needed.
                </motion.p>

                <motion.div
                  variants={fadeUp}
                  className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
                >
                  <Button
                    size="lg"
                    className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg shadow-emerald-900/20 font-semibold text-base px-8 py-6"
                    onClick={() => useAppStore.getState().setCurrentView('signup')}
                  >
                    Start Free — No Card Required
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/40 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm font-semibold text-base px-8 py-6"
                    onClick={() => scrollTo('how-it-works')}
                  >
                    See How It Works
                  </Button>
                </motion.div>
              </motion.div>

              {/* Phone mockup */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
                className="flex justify-center lg:justify-end"
              >
                <div className="relative">
                  {/* Glow */}
                  <div className="absolute inset-0 rounded-[2.5rem] bg-emerald-400/30 blur-2xl scale-110" />

                  {/* Phone frame */}
                  <div className="relative w-[280px] sm:w-[300px] rounded-[2.5rem] border-4 border-gray-800 bg-gray-900 p-3 shadow-2xl">
                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-28 rounded-b-2xl bg-gray-800" />

                    {/* Screen */}
                    <div className="mt-2 rounded-[2rem] bg-white overflow-hidden">
                      {/* Status bar */}
                      <div className="flex items-center justify-between px-6 pt-4 pb-2">
                        <span className="text-xs font-medium text-gray-500">9:41</span>
                        <div className="flex gap-1">
                          <div className="h-2.5 w-2.5 rounded-sm bg-gray-300" />
                          <div className="h-2.5 w-2.5 rounded-sm bg-gray-300" />
                          <div className="h-3 w-5 rounded-sm bg-gray-300" />
                        </div>
                      </div>

                      {/* Ticket content */}
                      <div className="px-5 pb-6 pt-2">
                        <div className="text-center">
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 mb-3">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            In Queue
                          </div>
                          <p className="text-xs text-gray-400 mb-1">Your Position</p>
                          <p className="text-5xl font-extrabold text-gray-900">#7</p>
                          <p className="text-sm text-gray-500 mt-1">of 12 in line</p>
                        </div>

                        <div className="mt-5 rounded-xl bg-emerald-50 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-gray-500">Estimated Wait</span>
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs">
                              ~14 min
                            </Badge>
                          </div>
                          <div className="w-full h-2 rounded-full bg-emerald-100 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-emerald-500"
                              initial={{ width: '0%' }}
                              animate={{ width: '42%' }}
                              transition={{ duration: 1.5, delay: 1, ease: 'easeOut' }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-2">You're next after 6 people</p>
                        </div>

                        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                          <div>
                            <p className="text-xs text-gray-400">Serving Now</p>
                            <p className="text-sm font-bold text-gray-900">Ticket #1</p>
                          </div>
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                            <Bell className="h-4 w-4 text-emerald-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  STATS BAR                                                    */}
        {/* ============================================================ */}
        <section className="border-b border-gray-100 bg-gray-50/60" aria-label="Platform statistics">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-gray-200">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.5 }}
                  custom={i}
                  variants={fadeUp}
                  className="flex flex-col items-center gap-1.5 py-8 px-4"
                >
                  <stat.icon className="h-5 w-5 text-emerald-600" />
                  <span className="text-2xl font-bold text-gray-900 sm:text-3xl">{stat.value}</span>
                  <span className="text-sm text-gray-500">{stat.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  HOW IT WORKS                                                 */}
        {/* ============================================================ */}
        <section id="how-it-works" style={{ scrollMarginTop: '5rem' }} className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.div variants={fadeUp}>
                <Badge variant="secondary" className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-xs font-medium">
                  <Timer className="mr-1.5 h-3 w-3" />
                  Simple 3-Step Process
                </Badge>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                How This Queue Management System Works
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                From scan to service in three simple steps. No training needed — for your team or your customers.
              </motion.p>
            </motion.div>

            <div className="mt-16 grid gap-8 md:grid-cols-3 md:gap-12">
              {steps.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i}
                  variants={fadeUp}
                  className="relative flex flex-col items-center text-center"
                >
                  {/* Connector line (desktop) */}
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-px border-t-2 border-dashed border-emerald-200" />
                  )}

                  {/* Number circle */}
                  <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white text-xl font-bold shadow-lg shadow-emerald-200">
                    {step.num}
                  </div>

                  <h3 className="mt-6 text-lg font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-500">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  COMPARISON TABLE                                             */}
        {/* ============================================================ */}
        <section
          id="compare"
          style={{ scrollMarginTop: '5rem' }}
          className="bg-gray-50/60 py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.div variants={fadeUp}>
                <Badge variant="secondary" className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-xs font-medium">
                  <ArrowUpRight className="mr-1.5 h-3 w-3" />
                  Side-by-Side Comparison
                </Badge>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Traditional Queue Ticket Software vs. Our Platform
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Most queue ticket software charges for everything. This queue management platform takes a radically different approach — you only pay for what you use.
              </motion.p>
            </motion.div>

            {/* Desktop Table (md+) */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mt-12 hidden md:block"
            >
              <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-500 w-1/3">Feature</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-gray-500 w-1/3">Traditional Queue Software</th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-emerald-600 w-1/3">QueueFlow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, i) => (
                      <tr
                        key={row.feature}
                        className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 border-t border-gray-100">
                          {row.feature}
                        </td>
                        <td className="px-6 py-4 text-center border-t border-gray-100">
                          <span className="text-sm">
                            <span className="text-red-500 font-semibold mr-1.5">&#10060;</span>
                            <span className="text-gray-500">{row.traditional}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center border-t border-gray-100">
                          {row.feature === 'Pay As You Grow' ? (
                            <span className="text-sm">
                              <span className="text-emerald-600 font-semibold mr-1.5">&#9989;</span>
                              <span className="text-emerald-600 font-semibold">{row.queueflow}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-gray-900 font-medium">{row.queueflow}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Mobile Cards (below md) */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mt-8 flex flex-col gap-3 md:hidden"
            >
              {comparisonRows.map((row, i) => (
                <motion.div key={row.feature} variants={fadeUp} custom={i}>
                  <Card className="border-gray-200">
                    <CardContent className="p-4">
                      <p className="text-sm font-semibold text-gray-900 mb-3">{row.feature}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-red-50 px-3 py-2">
                          <p className="text-xs text-gray-500 mb-1">Traditional</p>
                          <p className="text-xs">
                            <span className="text-red-500 font-semibold mr-1">&#10060;</span>
                            <span className="text-gray-600">{row.traditional}</span>
                          </p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 px-3 py-2">
                          <p className="text-xs text-emerald-600 mb-1 font-semibold">QueueFlow</p>
                          <p className="text-xs text-emerald-700 font-medium">
                            {row.feature === 'Pay As You Grow' && (
                              <span className="text-emerald-600 font-semibold mr-1">&#9989;</span>
                            )}
                            {row.queueflow}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  CORE VALUE PROPOSITION                                       */}
        {/* ============================================================ */}
        <section
          id="value-proposition"
          style={{ scrollMarginTop: '5rem' }}
          className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-emerald-900 py-20 sm:py-28"
        >
          <div className="pointer-events-none absolute -top-40 -right-40 h-[400px] w-[400px] rounded-full bg-emerald-600/10 blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-3xl text-center"
            >
              <motion.div variants={fadeUp}>
                <Badge className="mb-6 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 text-sm">
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Revolutionary Pricing Model
                </Badge>
              </motion.div>

              <motion.h2
                variants={fadeUp}
                className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
              >
                The World&apos;s Fairest{' '}
                <span className="text-emerald-400">Queue Management</span>{' '}
                Pricing
              </motion.h2>

              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
                Why pay for seats, counters, or locations when you only need to pay for customers served?
                This affordable queue management model is designed to grow with your business.
              </motion.p>

              <motion.div
                variants={stagger}
                className="mt-10 grid gap-3 sm:grid-cols-2 max-w-2xl mx-auto"
              >
                {noItems.map((item, i) => (
                  <motion.div
                    key={item}
                    variants={fadeUp}
                    custom={i}
                    className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3 backdrop-blur-sm"
                  >
                    <X className="h-5 w-5 flex-shrink-0 text-red-500" />
                    <span className="text-sm text-gray-300">{item}</span>
                  </motion.div>
                ))}
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="mt-12 flex flex-col items-center gap-4"
              >
                <div className="flex items-center gap-3">
                  <Check className="h-8 w-8 text-emerald-400" />
                  <span className="text-3xl font-extrabold text-white sm:text-4xl">
                    Just $0.01 per ticket
                  </span>
                  <Check className="h-8 w-8 text-emerald-400" />
                </div>
                <p className="text-lg text-gray-400">
                  300 free tickets to start. Pay only when you grow. Credits never expire.
                </p>
                <Button
                  size="lg"
                  className="mt-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-900/30 font-semibold text-base px-8 py-6"
                  onClick={() => useAppStore.getState().setCurrentView('signup')}
                >
                  Start Free — No Card Required
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  WHY CHOOSE US                                                */}
        {/* ============================================================ */}
        <section
          id="why-choose-us"
          style={{ scrollMarginTop: '5rem' }}
          className="py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.div variants={fadeUp}>
                <Badge variant="secondary" className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-xs font-medium">
                  <Check className="mr-1.5 h-3 w-3" />
                  12 Reasons to Switch
                </Badge>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Why Businesses Choose This Queue Management Platform
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Built different from the ground up. Every feature designed to simplify your waiting line management.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mt-16 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6"
            >
              {whyChooseUs.map((item, i) => (
                <motion.div
                  key={item.label}
                  variants={fadeUp}
                  custom={i}
                  className="flex flex-col items-center gap-2.5 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 transition-all hover:shadow-md hover:border-emerald-100"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 text-center">{item.label}</span>
                  <span className="text-xs text-gray-400 text-center leading-relaxed">{item.desc}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  BENEFITS                                                     */}
        {/* ============================================================ */}
        <section
          id="benefits"
          style={{ scrollMarginTop: '5rem' }}
          className="bg-gray-50/60 py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Real Results That Transform Your Operations
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Measurable improvements that businesses experience after switching to this queue management solution.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
            >
              {benefits.map((b, i) => (
                <motion.div key={b.title} variants={fadeUp} custom={i} className="flex gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <b.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{b.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{b.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  FEATURES                                                     */}
        {/* ============================================================ */}
        <section id="features" style={{ scrollMarginTop: '5rem' }} className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Everything You Need to Manage Queues
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                From QR code entry to real-time TV displays, this electronic queue management system covers every aspect of modern customer queue management.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {features.map((f) => (
                <motion.div key={f.title} variants={fadeUp}>
                  <Card className="group h-full border-gray-200 bg-white transition-all hover:shadow-lg hover:shadow-emerald-100/50 hover:border-emerald-200">
                    <CardContent className="p-6">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                        <f.icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">{f.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  INDUSTRY SOLUTIONS                                           */}
        {/* ============================================================ */}
        <section
          id="industries"
          style={{ scrollMarginTop: '5rem' }}
          className="bg-gray-50/60 py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.div variants={fadeUp}>
                <Badge variant="secondary" className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-xs font-medium">
                  <Globe className="mr-1.5 h-3 w-3" />
                  12+ Industries Served
                </Badge>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Enterprise Queue Management for Every Industry
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                From healthcare to government services — this queue management solution adapts to your unique workflow and customer flow.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5"
            >
              {industries.map((ind, i) => (
                <motion.div key={ind.name} variants={fadeUp} custom={i}>
                  <Card className="group h-full border-gray-200 bg-white transition-all hover:shadow-lg hover:border-emerald-200">
                    <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-6 text-center">
                      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${ind.color} transition-transform group-hover:scale-110`}>
                        <ind.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{ind.name}</h3>
                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">{ind.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  INFRASTRUCTURE                                               */}
        {/* ============================================================ */}
        <section
          id="infrastructure"
          style={{ scrollMarginTop: '5rem' }}
          className="py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.div variants={fadeUp}>
                <Badge variant="secondary" className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-xs font-medium">
                  <Activity className="mr-1.5 h-3 w-3" />
                  Built for Reliability
                </Badge>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Enterprise-Grade Infrastructure You Can Trust
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Every ticket flows through a robust, globally distributed pipeline designed for speed and reliability.
                This cloud queue management system ensures your operations never skip a beat.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mt-16"
            >
              {/* Desktop horizontal flow */}
              <div className="hidden lg:flex items-center justify-center gap-2">
                {infrastructureSteps.map((step, i) => (
                  <motion.div key={step.label} variants={fadeUp} custom={i} className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm min-w-[120px]">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <step.icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium text-gray-700 text-center leading-tight">{step.label}</span>
                    </div>
                    {i < infrastructureSteps.length - 1 && (
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Mobile vertical flow */}
              <div className="flex flex-col gap-3 lg:hidden">
                {infrastructureSteps.map((step, i) => (
                  <motion.div key={step.label} variants={fadeUp} custom={i} className="flex items-center gap-3">
                    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm flex-1">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <step.icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{step.label}</span>
                    </div>
                    {i < infrastructureSteps.length - 1 && (
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-emerald-400 rotate-90 sm:rotate-0" />
                    )}
                  </motion.div>
                ))}
              </div>

              <motion.p
                variants={fadeUp}
                className="mt-10 text-center text-sm text-gray-500"
              >
                Edge-deployed across a global network for sub-50ms response times — no matter where your customers are.
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  SECURITY                                                     */}
        {/* ============================================================ */}
        <section
          id="security"
          style={{ scrollMarginTop: '5rem' }}
          className="bg-gray-50/60 py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.div variants={fadeUp}>
                <Badge variant="secondary" className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-xs font-medium">
                  <Lock className="mr-1.5 h-3 w-3" />
                  Your Data, Protected
                </Badge>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Bank-Grade Security for Every Queue Management Application
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Your data and your customers&apos; data are protected at every layer of this queue management system.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
            >
              {securityFeatures.map((feat, i) => (
                <motion.div key={feat.title} variants={fadeUp} custom={i}>
                  <Card className="h-full border-gray-200 bg-white text-center transition-all hover:shadow-md hover:border-emerald-200">
                    <CardContent className="flex flex-col items-center gap-4 p-6">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <feat.icon className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{feat.title}</h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{feat.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  PRICING                                                      */}
        {/* ============================================================ */}
        <section id="pricing" style={{ scrollMarginTop: '5rem' }} className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Growth Plans for Every Business Size
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Start free with pay-per-ticket billing, or choose a plan for predictable costs. No credit card required.
              </motion.p>
            </motion.div>

            <div className="mt-16 grid gap-8 lg:grid-cols-3">
              {pricing.map((tier, i) => (
                <motion.div
                  key={tier.name}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i}
                  variants={fadeUp}
                >
                  <Card
                    className={`relative h-full flex flex-col ${
                      tier.highlighted
                        ? 'border-2 border-emerald-600 shadow-xl shadow-emerald-100/60 scale-[1.02]'
                        : 'border-gray-200'
                    }`}
                  >
                    {tier.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-emerald-600 text-white px-3 py-1 shadow-sm">{tier.badge}</Badge>
                      </div>
                    )}

                    <CardContent className="flex flex-1 flex-col p-6 sm:p-8">
                      <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
                      <div className="mt-4 flex items-baseline">
                        <span className="text-sm font-medium text-gray-500">&#2547;</span>
                        <span className="text-4xl font-extrabold text-gray-900">{tier.price}</span>
                        {tier.period && (
                          <span className="ml-1 text-sm text-gray-500">{tier.period}</span>
                        )}
                      </div>

                      <Separator className="my-6" />

                      <ul className="flex-1 space-y-3">
                        {tier.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                              <Check className="h-3 w-3 text-emerald-600" />
                            </div>
                            <span className="text-sm text-gray-600">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        className={`mt-8 w-full font-semibold py-5 ${
                          tier.highlighted
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200'
                            : 'bg-gray-900 text-white hover:bg-gray-800'
                        }`}
                        onClick={() => tier.cta === 'Contact Sales' ? scrollTo('contact') : useAppStore.getState().setCurrentView('signup')}
                      >
                        {tier.cta}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  FAQ                                                          */}
        {/* ============================================================ */}
        <section id="faq" style={{ scrollMarginTop: '5rem' }} className="bg-gray-50/60 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Frequently Asked Questions
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Everything you need to know about this queue management system.
              </motion.p>
            </motion.div>

            <div className="mt-12 flex flex-col gap-3">
              {faqs.map((faq, i) => (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  custom={i}
                  variants={fadeUp}
                >
                  <Card className="border-gray-200">
                    <button
                      className="flex w-full items-center justify-between px-6 py-5 text-left"
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      aria-expanded={openFaq === i}
                    >
                      <div className="flex items-center gap-3 pr-4">
                        <HelpCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                        <span className="font-semibold text-gray-900 text-sm sm:text-base">{faq.q}</span>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 ${
                          openFaq === i ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    <AnimatePresence mode="wait" initial={false}>
                      {openFaq === i && (
                        <motion.div
                          key={`faq-${i}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                        >
                          <div className="px-6 pb-5 pl-14">
                            <p className="text-sm leading-relaxed text-gray-600">{faq.a}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  CTA SECTION                                                  */}
        {/* ============================================================ */}
        <section className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Ready to Transform Your Waiting Line Management?
              </h2>
              <p className="mt-4 text-lg text-emerald-50/90 max-w-2xl mx-auto">
                Join hundreds of businesses that use this queue management platform to reduce customer waiting
                frustration and deliver a superior service experience. Get started in under 2 minutes.
              </p>
            </motion.div>

            {/* Login & Signup Cards */}
            <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2 max-w-md mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Card
                  className="group h-full border-2 border-white/20 bg-white/10 backdrop-blur-md transition-all duration-300 hover:border-white/40 hover:bg-white/15 hover:shadow-xl hover:shadow-emerald-900/10 cursor-pointer"
                  onClick={() => useAppStore.getState().setCurrentView('signup')}
                >
                  <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-100 transition-transform duration-300 group-hover:scale-110">
                      <Zap className="h-7 w-7" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Create Free Account</h3>
                    <p className="text-sm text-emerald-100/80">
                      Start managing your queues in minutes. 300 free tickets included.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card
                  className="group h-full border-2 border-white/20 bg-white/10 backdrop-blur-md transition-all duration-300 hover:border-white/40 hover:bg-white/15 hover:shadow-xl hover:shadow-emerald-900/10 cursor-pointer"
                  onClick={() => window.location.href = '/dashboard'}
                >
                  <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-100 transition-transform duration-300 group-hover:scale-110">
                      <Shield className="h-7 w-7" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Login to Dashboard</h3>
                    <p className="text-sm text-emerald-100/80">
                      Sign in to manage your queues, branches, and team.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  CONTACT                                                      */}
        {/* ============================================================ */}
        <section id="contact" style={{ scrollMarginTop: '5rem' }} className="py-20 sm:py-28">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Get in Touch
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
                Have a question or want a personalized demo of our queue management solution? We&apos;d love to hear from you.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <Card className="mt-10 border-gray-200">
                <CardContent className="p-6 sm:p-8">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
                        toast.error('Please fill in all fields');
                        return;
                      }
                      setContactSubmitting(true);
                      await new Promise((resolve) => setTimeout(resolve, 800));
                      setContactSubmitting(false);
                      toast.success('Thank you! We\'ll get back to you soon.');
                      setContactName('');
                      setContactEmail('');
                      setContactMessage('');
                    }}
                    className="flex flex-col gap-5"
                  >
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <label htmlFor="contact-name" className="text-sm font-medium text-gray-700">Name</label>
                        <Input
                          id="contact-name"
                          placeholder="Your name"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          required
                          className="h-11"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label htmlFor="contact-email" className="text-sm font-medium text-gray-700">Email</label>
                        <Input
                          id="contact-email"
                          type="email"
                          placeholder="you@example.com"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          required
                          className="h-11"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="contact-message" className="text-sm font-medium text-gray-700">Message</label>
                      <Textarea
                        id="contact-message"
                        placeholder="Tell us about your queue management needs..."
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        required
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={contactSubmitting}
                      className="w-full h-12 font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {contactSubmitting ? (
                        <>
                          <Send className="mr-2 h-4 w-4 animate-pulse" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>
      </main>

      {/* ============================================================ */}
      {/*  FOOTER                                                       */}
      {/* ============================================================ */}
      <footer className="mt-auto border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand column */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <span className="text-lg font-bold text-gray-900">
                  Queue<span className="text-emerald-600">Flow</span>
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
                A smart queue management system that helps businesses eliminate paper tickets, reduce waiting times,
                and deliver a better customer experience. Trusted across 12+ industries worldwide.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Platform</h4>
              <ul className="flex flex-col gap-2.5">
                {['Features', 'How It Works', 'Pricing', 'Compare', 'Industries', 'Security'].map((item) => (
                  <li key={item}>
                    <button
                      onClick={() => scrollTo(item.toLowerCase().replace(/ /g, '-'))}
                      className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Solutions */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Solutions</h4>
              <ul className="flex flex-col gap-2.5">
                {['Healthcare', 'Banking & Finance', 'Government', 'Education', 'Retail', 'Enterprise'].map((item) => (
                  <li key={item}>
                    <span className="text-sm text-gray-500">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Support</h4>
              <ul className="flex flex-col gap-2.5">
                <li>
                  <button
                    onClick={() => scrollTo('faq')}
                    className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
                  >
                    FAQ
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollTo('contact')}
                    className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
                  >
                    Contact Us
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => window.location.href = '/dashboard'}
                    className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
                  >
                    Dashboard Login
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <Separator className="my-8" />

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <p className="text-sm text-gray-400">
              &copy; {new Date().getFullYear()} QueueFlow. All rights reserved. A modern queue management platform for businesses worldwide.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                <span>Secure</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Globe className="h-3.5 w-3.5 text-emerald-500" />
                <span>Global</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Zap className="h-3.5 w-3.5 text-emerald-500" />
                <span>Fast</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}