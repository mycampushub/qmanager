/**
 * Lightweight i18n system for QueueFlow.
 * Stores locale in localStorage under key 'qms_locale', defaults to 'en'.
 */

export type Locale = 'en' | 'bn';

// ─── English strings ───────────────────────────────────────────
const en: Record<string, string> = {
  // Queue
  'queue.title': 'Queue Management',
  'queue.create': 'Create Queue',
  'queue.edit': 'Edit Queue',
  'queue.delete': 'Delete Queue',
  'queue.name': 'Queue Name',
  'queue.prefix': 'Prefix',
  'queue.active': 'Active',
  'queue.inactive': 'Inactive',
  'queue.noQueues': 'No queues found',

  // Ticket
  'ticket.title': 'Ticket Management',
  'ticket.join': 'Join Queue',
  'ticket.call': 'Call Next',
  'ticket.complete': 'Complete',
  'ticket.skip': 'Skip',
  'ticket.cancel': 'Cancel',
  'ticket.serial': 'Ticket #',
  'ticket.customerName': 'Customer Name',
  'ticket.customerPhone': 'Phone Number',
  'ticket.status': 'Status',
  'ticket.noTickets': 'No tickets in queue',
  'ticket.nowServing': 'Now Serving',

  // Time
  'time.estimatedWait': 'Estimated Wait',
  'time.avgServiceTime': 'Avg Service Time',
  'time.minutes': 'minutes',
  'time.seconds': 'seconds',
  'time.today': 'Today',
  'time.waiting': 'Waiting',

  // Status labels
  'status.WAITING': 'Waiting',
  'status.SERVING': 'Serving',
  'status.COMPLETED': 'Completed',
  'status.SKIPPED': 'Skipped',
  'status.CANCELLED': 'Cancelled',
  'status.SCHEDULED': 'Scheduled',
  'status.CHECKED_IN': 'Checked In',
  'status.NO_SHOW': 'No Show',

  // Common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading...',
  'common.error': 'Something went wrong',
  'common.success': 'Success',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.noData': 'No data available',
  'common.language': 'Language',
  'common.bengali': 'বাংলা',
  'common.english': 'English',

  // Feedback
  'feedback.title': 'Feedback',
  'feedback.rating': 'Rating',
  'feedback.comment': 'Comment',
  'feedback.submit': 'Submit Feedback',

  // Appointment
  'appointment.title': 'Appointments',
  'appointment.schedule': 'Schedule Appointment',
  'appointment.date': 'Date',
  'appointment.time': 'Time',
  'appointment.checkIn': 'Check In',

  // Analytics
  'analytics.title': 'Analytics',
  'analytics.totalTickets': 'Total Tickets',
  'analytics.completed': 'Completed',
  'analytics.peakHour': 'Peak Hour',
  'analytics.export': 'Export',
};

// ─── Bengali translations ──────────────────────────────────────
const bn: Record<string, string> = {
  // Queue
  'queue.title': 'কিউ ম্যানেজমেন্ট',
  'queue.create': 'কিউ তৈরি করুন',
  'queue.edit': 'কিউ সম্পাদনা করুন',
  'queue.delete': 'কিউ মুছুন',
  'queue.name': 'কিউ নাম',
  'queue.prefix': 'প্রিফিক্স',
  'queue.active': 'সক্রিয়',
  'queue.inactive': 'নিষ্ক্রিয়',
  'queue.noQueues': 'কোনো কিউ পাওয়া যায়নি',

  // Ticket
  'ticket.title': 'টিকেট ম্যানেজমেন্ট',
  'ticket.join': 'কিউতে যোগ দিন',
  'ticket.call': 'পরবর্তী কল করুন',
  'ticket.complete': 'সম্পন্ন',
  'ticket.skip': 'স্কিপ',
  'ticket.cancel': 'বাতিল',
  'ticket.serial': 'টিকেট #',
  'ticket.customerName': 'গ্রাহকের নাম',
  'ticket.customerPhone': 'ফোন নম্বর',
  'ticket.status': 'স্ট্যাটাস',
  'ticket.noTickets': 'কিউতে কোনো টিকেট নেই',
  'ticket.nowServing': 'এখন সেবা দেওয়া হচ্ছে',

  // Time
  'time.estimatedWait': 'আনুমানিক অপেক্ষা',
  'time.avgServiceTime': 'গড় সেবা সময়',
  'time.minutes': 'মিনিট',
  'time.seconds': 'সেকেন্ড',
  'time.today': 'আজ',
  'time.waiting': 'অপেক্ষমান',

  // Status labels
  'status.WAITING': 'অপেক্ষমান',
  'status.SERVING': 'সেবাধীন',
  'status.COMPLETED': 'সম্পন্ন',
  'status.SKIPPED': 'বাদ পড়েছে',
  'status.CANCELLED': 'বাতিল',
  'status.SCHEDULED': 'নির্ধারিত',
  'status.CHECKED_IN': 'চেক-ইন',
  'status.NO_SHOW': 'অনুপস্থিত',

  // Common
  'common.save': 'সংরক্ষণ',
  'common.cancel': 'বাতিল',
  'common.delete': 'মুছুন',
  'common.confirm': 'নিশ্চিত করুন',
  'common.loading': 'লোড হচ্ছে...',
  'common.error': 'কিছু ভুল হয়েছে',
  'common.success': 'সফল',
  'common.search': 'খুঁজুন',
  'common.filter': 'ফিল্টার',
  'common.noData': 'কোনো তথ্য নেই',
  'common.language': 'ভাষা',
  'common.bengali': 'বাংলা',
  'common.english': 'English',

  // Feedback
  'feedback.title': 'ফিডব্যাক',
  'feedback.rating': 'রেটিং',
  'feedback.comment': 'মন্তব্য',
  'feedback.submit': 'ফিডব্যাক জমা দিন',

  // Appointment
  'appointment.title': 'অ্যাপয়েন্টমেন্ট',
  'appointment.schedule': 'অ্যাপয়েন্টমেন্ট নির্ধারণ করুন',
  'appointment.date': 'তারিখ',
  'appointment.time': 'সময়',
  'appointment.checkIn': 'চেক-ইন',

  // Analytics
  'analytics.title': 'বিশ্লেষণ',
  'analytics.totalTickets': 'মোট টিকেট',
  'analytics.completed': 'সম্পন্ন',
  'analytics.peakHour': 'পিক আওয়ার',
  'analytics.export': 'এক্সপোর্ট',
};

const TRANSLATIONS: Record<Locale, Record<string, string>> = { en, bn };

const STORAGE_KEY = 'qms_locale';

/**
 * Look up a translation key for the given locale.
 * Falls back to the English string, then to the key itself.
 */
export function t(key: string, locale?: Locale): string {
  const loc = locale ?? getStoredLocale();
  return TRANSLATIONS[loc]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

/**
 * Read locale from localStorage (client-side only).
 * Returns 'en' when not in browser or key not set.
 */
function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'bn' || stored === 'en') return stored;
  } catch {
    // localStorage may be unavailable (SSR, incognito restrictions)
  }
  return 'en';
}

/**
 * React hook: returns current locale, setter, and translation function.
 * Must be used inside a 'use client' component.
 */
export function useLocale(): {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
} {
  // Using a closure-based approach rather than React state
  // to keep this module lightweight and non-React-dependent.
  // The consuming component should manage reactivity via useState/useEffect.
  const locale = getStoredLocale();

  const setLocale = (l: Locale) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        // ignore
      }
    }
  };

  return {
    locale,
    setLocale,
    t: (key: string) => t(key, locale),
  };
}