'use client';

import { useState } from 'react';

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
  'queue.select': 'Select Queue',
  'queue.overview': 'Queue Overview',
  'queue.status': 'Queue Status',

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
  'ticket.currentlyServing': 'Currently Serving',
  'ticket.noServing': 'No ticket currently being served',
  'ticket.callNextHint': 'Click "CALL NEXT" to serve the next customer',
  'ticket.walkIn': 'Walk-in',
  'ticket.served': 'Served',
  'ticket.skipped': 'Skipped',
  'ticket.waiting': 'Waiting',
  'ticket.noWaiting': 'No tickets waiting',
  'ticket.noSkipped': 'No skipped tickets',
  'ticket.noServed': 'No served tickets yet',
  'ticket.loadMore': 'Load More',
  'ticket.loading': 'Loading...',

  // Time
  'time.estimatedWait': 'Estimated Wait',
  'time.avgServiceTime': 'Avg Service Time',
  'time.minutes': 'minutes',
  'time.seconds': 'seconds',
  'time.today': 'Today',
  'time.waiting': 'Waiting',
  'time.estWait': 'Est. Wait',

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
  'common.refresh': 'Refresh',
  'common.add': 'Add',
  'common.notes': 'Notes',
  'common.date': 'Date',
  'common.noTickets': 'No Tickets',

  // Display / TV
  'display.nowServing': 'Now Serving',
  'display.waitingTickets': 'Waiting Tickets',
  'display.nextUp': 'Next up',
  'display.completed': 'Completed',
  'display.scanToJoin': 'Scan to Join',
  'display.pleaseReady': 'Please have your documents ready when your number is called. Thank you for your patience.',
  'display.noQueues': 'No active queues',

  // Voice
  'voice.ticketCalled': 'Ticket {serial}, please proceed to {queue}',
  'voice.bn.ticketCalled': 'টিকেট {serial}, অনুগ্রহ করে {queue} এ যান',

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

  // Walk-in
  'walkin.customerName': 'Customer Name *',
  'walkin.phone': 'Phone (optional)',
  'walkin.notes': 'Notes (optional)',
  'walkin.notesPlaceholder': 'Add a note about this customer (purpose, preference, etc.)',
  'walkin.addAndPrint': 'Add & Print',
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
  'queue.select': 'কিউ নির্বাচন করুন',
  'queue.overview': 'কিউ ওভারভিউ',
  'queue.status': 'কিউ স্ট্যাটাস',

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
  'ticket.currentlyServing': 'বর্তমানে সেবা দেওয়া হচ্ছে',
  'ticket.noServing': 'বর্তমানে কোনো টিকেট সেবা দেওয়া হচ্ছে না',
  'ticket.callNextHint': 'পরবর্তী গ্রাহককে সেবা দিতে "কল নেক্সট" ক্লিক করুন',
  'ticket.walkIn': 'ওয়াক-ইন',
  'ticket.served': 'সম্পন্ন',
  'ticket.skipped': 'বাদ পড়েছে',
  'ticket.waiting': 'অপেক্ষমান',
  'ticket.noWaiting': 'কোনো টিকেট অপেক্ষমান নেই',
  'ticket.noSkipped': 'কোনো স্কিপড টিকেট নেই',
  'ticket.noServed': 'এখনও কোনো সেবা হয়নি',
  'ticket.loadMore': 'আরও লোড করুন',
  'ticket.loading': 'লোড হচ্ছে...',

  // Time
  'time.estimatedWait': 'আনুমানিক অপেক্ষা',
  'time.avgServiceTime': 'গড় সেবা সময়',
  'time.minutes': 'মিনিট',
  'time.seconds': 'সেকেন্ড',
  'time.today': 'আজ',
  'time.waiting': 'অপেক্ষমান',
  'time.estWait': 'আনুমানিক অপেক্ষা',

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
  'common.refresh': 'রিফ্রেশ',
  'common.add': 'যোগ করুন',
  'common.notes': 'নোটস',
  'common.date': 'তারিখ',
  'common.noTickets': 'কোনো টিকেট নেই',

  // Display / TV
  'display.nowServing': 'এখন সেবা দেওয়া হচ্ছে',
  'display.waitingTickets': 'অপেক্ষমান টিকেট',
  'display.nextUp': 'পরবর্তী',
  'display.completed': 'সম্পন্ন',
  'display.scanToJoin': 'যোগ দিতে স্ক্যান করুন',
  'display.pleaseReady': 'আপনার নম্বর ডাকা হলে দয়া করে আপনার নথিপত্র প্রস্তুত রাখুন। আপনার ধৈর্যের জন্য ধন্যবাদ।',
  'display.noQueues': 'কোনো সক্রিয় কিউ নেই',

  // Voice
  'voice.ticketCalled': 'টিকেট {serial}, অনুগ্রহ করে {queue} এ যান',
  'voice.bn.ticketCalled': 'টিকেট {serial}, অনুগ্রহ করে {queue} এ যান',

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

  // Walk-in
  'walkin.customerName': 'গ্রাহকের নাম *',
  'walkin.phone': 'ফোন (ঐচ্ছিক)',
  'walkin.notes': 'নোটস (ঐচ্ছিক)',
  'walkin.notesPlaceholder': 'এই গ্রাহক সম্পর্কে একটি নোট যোগ করুন (উদ্দেশ্য, পছন্দ ইত্যাদি)',
  'walkin.addAndPrint': 'যোগ করুন ও প্রিন্ট করুন',
};

const TRANSLATIONS: Record<Locale, Record<string, string>> = { en, bn };

const STORAGE_KEY = 'qms_locale';

/**
 * Look up a translation key for the given locale.
 * Falls back to the English string, then to the key itself.
 */
export function t(key: string, locale?: Locale): string {
  const loc = locale ?? 'en';
  return TRANSLATIONS[loc]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

/**
 * Read locale from localStorage (client-side only).
 * Returns 'en' when not in browser or key not set.
 */
export function getStoredLocale(): Locale {
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
 * Uses useState for reactivity — changing locale triggers re-render.
 * Must be used inside a 'use client' component.
 */
export function useLocale(): {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
} {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  const setLocale = (l: Locale) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        // ignore
      }
    }
    setLocaleState(l);
  };

  const translate = (key: string) => t(key, locale);

  return {
    locale,
    setLocale,
    t: translate,
  };
}