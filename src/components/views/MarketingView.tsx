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
  visible: { transition: { staggerChildren: 0.1 } },
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */
const stats = [
  { label: 'Businesses', value: '500+', icon: Building2 },
  { label: 'Tickets Served', value: '2M+', icon: Ticket },
  { label: 'Uptime', value: '99.9%', icon: Shield },
  { label: 'Avg Response', value: '50ms', icon: Zap },
];

const features = [
  {
    icon: QrCode,
    title: 'QR Code Instant Join',
    desc: 'Customers scan a QR code and join the queue in seconds — no app download required.',
  },
  {
    icon: Radio,
    title: 'Real-Time Updates',
    desc: 'Live position tracking via WebSocket keeps everyone informed, every second.',
  },
  {
    icon: Building2,
    title: 'Multi-Location Support',
    desc: 'Master tenant hierarchy makes managing franchises and chains effortless.',
  },
  {
    icon: Coins,
    title: 'Pay-Per-Entry Billing',
    desc: 'Only pay for what you use. No hidden fees, no long-term contracts.',
  },
  {
    icon: Clock,
    title: 'Smart EWT',
    desc: 'Dynamic estimated wait time calculation adapts to real-time conditions.',
  },
  {
    icon: Monitor,
    title: 'TV Display',
    desc: 'Full-screen waiting-room display that auto-rotates and calls next customers.',
  },
];

const steps = [
  {
    num: 1,
    title: 'Customer Scans QR Code',
    desc: 'A QR code at your entrance or shared digitally lets anyone join instantly.',
    icon: QrCode,
  },
  {
    num: 2,
    title: 'Gets Digital Ticket with Live Updates',
    desc: 'Their phone shows position in line and estimated wait — updated in real time.',
    icon: Smartphone,
  },
  {
    num: 3,
    title: 'Notified When It\'s Their Turn',
    desc: 'Push notification alerts them so they arrive just in time to be served.',
    icon: Bell,
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
      'Smart EWT algorithm',
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
      'Master tenant hierarchy',
      'Dedicated account manager',
      'Priority 24/7 support',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const faqs = [
  {
    q: 'How does the queue system work?',
    a: 'Customers scan a QR code or visit your unique QueueFlow link, select a queue, and receive a digital ticket. They can track their position in real time and receive notifications when their turn approaches — no app download required.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes! Our Free plan lets you get started immediately with 2 queues, 3 staff members, and 50 tickets per day — no credit card required. Upgrade anytime as your business grows.',
  },
  {
    q: 'Can I customize the display?',
    a: 'Absolutely. Pro and Enterprise plans include custom branding — change colors, logos, welcome messages, and display layouts. The TV display module can be fully tailored to match your business identity.',
  },
  {
    q: 'What happens when I run out of wallet balance?',
    a: 'You will receive a low-balance warning notification. If your balance reaches zero, new tickets will be paused until you top up your wallet. Existing tickets in the queue will continue to be served normally.',
  },
  {
    q: 'Can I manage multiple branches?',
    a: 'Yes. Pro plans support up to 3 locations, and Enterprise offers unlimited branches with a master tenant hierarchy — perfect for franchises and multi-location businesses. Manage everything from a single dashboard.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. All data is encrypted in transit and at rest. We use JWT-based authentication with role-based access control, CSRF protection, and comprehensive audit logging. Your customer data never leaves our secure infrastructure.',
  },
];

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
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">
              Queue<span className="text-emerald-600">Flow</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
            {['Features', 'How It Works', 'Pricing', 'FAQ', 'Contact'].map((item) => (
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
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-gray-600 hover:text-emerald-600"
              onClick={() => window.location.href = '/dashboard'}
            >
              Login
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200"
              onClick={() => scrollTo('pricing')}
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-gray-100 bg-white"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {['Features', 'How It Works', 'Pricing', 'FAQ', 'Contact'].map((item) => (
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
                onClick={() => { setMobileOpen(false); scrollTo('pricing'); }}
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </header>

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
                  Trusted by 500+ businesses
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
                A zero-friction, QR-based queue system that lets your customers wait
                comfortably and arrive just in time. Set up in 2 minutes.
              </motion.p>

              <motion.div
                variants={fadeUp}
                className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
              >
                <Button
                  size="lg"
                  className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg shadow-emerald-900/20 font-semibold text-base px-8 py-6"
                  onClick={() => scrollTo('pricing')}
                >
                  Get Started Free
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
      <section className="border-b border-gray-100 bg-gray-50/60">
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
              From QR code entry to TV display, QueueFlow covers every aspect of modern queue management.
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
      {/*  HOW IT WORKS                                                 */}
      {/* ============================================================ */}
      <section id="how-it-works" style={{ scrollMarginTop: '5rem' }} className="bg-gray-50/60 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="mx-auto max-w-2xl text-center"
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              How It Works
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
              Three simple steps from scan to service.
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
              Simple, Transparent Pricing
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-lg text-gray-500">
              Start free, scale as you grow. No credit card required.
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
                      <span className="text-sm font-medium text-gray-500">৳</span>
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
                      onClick={() => tier.cta === 'Contact Sales' ? scrollTo('contact') : (window.location.href = '/dashboard?signup=true')}
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
              Everything you need to know about QueueFlow.
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
                    <div className="flex items-center gap-3">
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
              Have a question or want a demo? We'd love to hear from you.
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
                    // Simulate submission delay
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
                      placeholder="Tell us how we can help..."
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
              Ready to Transform Your Queue?
            </h2>
            <p className="mt-4 text-lg text-emerald-50/90">
              Join hundreds of businesses that have already eliminated chaotic waiting lines.
              Get started in under 2 minutes.
            </p>
          </motion.div>

          {/* Login Card */}
          <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-1 max-w-sm mx-auto">
            <motion.div variants={fadeUp}>
              <Card
                className="group h-full border-2 border-white/20 bg-white/10 backdrop-blur-md transition-all duration-300 hover:border-white/40 hover:bg-white/15 hover:shadow-xl hover:shadow-emerald-900/10 cursor-pointer"
                onClick={() => window.location.href = '/dashboard'}
              >
                <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-100 transition-transform duration-300 group-hover:scale-110">
                    <Shield className="h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Login</h3>
                  <p className="text-sm text-emerald-100/80">
                    Sign in to manage your queues, branches, or platform.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER                                                       */}
      {/* ============================================================ */}
      <footer className="mt-auto border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            {/* Logo & copyright */}
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <span className="text-lg font-bold text-gray-900">
                  Queue<span className="text-emerald-600">Flow</span>
                </span>
              </div>
              <p className="text-sm text-gray-400">
                &copy; {new Date().getFullYear()} QueueFlow. All rights reserved.
              </p>
            </div>

            {/* Navigation links */}
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer navigation">
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
              >
                Dashboard
              </button>
              <button
                onClick={() => scrollTo('faq')}
                className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
              >
                FAQ
              </button>
              <button
                onClick={() => scrollTo('contact')}
                className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
              >
                Contact
              </button>
            </nav>

            {/* Social-like icons */}
            <div className="flex items-center gap-4">
              <Users className="h-4 w-4 text-gray-400" />
              <Shield className="h-4 w-4 text-gray-400" />
              <Zap className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}