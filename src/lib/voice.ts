/**
 * Voice announcement utility using the Web Speech API.
 * Announces ticket calls in English or Bengali.
 */

import type { Locale } from './i18n';

let lastAnnouncementTime = 0;
const DEBOUNCE_MS = 3000; // Don't re-announce the same ticket within 3s

/**
 * Announce a ticket call using text-to-speech.
 * Debounces identical calls to prevent overlapping announcements.
 */
export function announceTicket(options: {
  serial: string;          // e.g. "A-005"
  queueName: string;       // e.g. "Reception"
  locale?: Locale;         // 'en' or 'bn'
  customerName?: string;   // optional customer name
}): void {
  const now = Date.now();
  const cacheKey = `${options.serial}-${options.queueName}`;
  if (now - lastAnnouncementTime < DEBOUNCE_MS) return;
  lastAnnouncementTime = now;

  const locale = options.locale ?? 'en';

  // Build announcement text
  let text: string;
  if (locale === 'bn') {
    // Bengali: "টিকেট এ-জিরো-জিরো-৫, অনুগ্রহ করে রিসেপশন এ যান"
    const bnSerial = options.serial
      .replace(/-/g, ', ')
      .replace(/0/g, 'জিরো')
      .replace(/1/g, 'এক')
      .replace(/2/g, 'দুই')
      .replace(/3/g, 'তিন')
      .replace(/4/g, 'চার')
      .replace(/5/g, 'পাঁচ')
      .replace(/6/g, 'ছয়')
      .replace(/7/g, 'সাত')
      .replace(/8/g, 'আট')
      .replace(/9/g, 'নয়');
    text = `টিকেট ${bnSerial}, অনুগ্রহ করে ${options.queueName} কাউন্টারে যান`;
  } else {
    // English: "Ticket A zero zero 5, please proceed to Reception"
    const enSerial = options.serial
      .replace(/-/g, ', ')
      .replace(/0/g, 'zero')
      .replace(/1/g, 'one')
      .replace(/2/g, 'two')
      .replace(/3/g, 'three')
      .replace(/4/g, 'four')
      .replace(/5/g, 'five')
      .replace(/6/g, 'six')
      .replace(/7/g, 'seven')
      .replace(/8/g, 'eight')
      .replace(/9/g, 'nine');
    text = `Ticket ${enSerial}, please proceed to ${options.queueName}`;
    if (options.customerName) {
      text = `Ticket ${enSerial}, ${options.customerName}, please proceed to ${options.queueName}`;
    }
  }

  speak(text, locale);
}

/**
 * Low-level speak function using Web Speech API.
 */
function speak(text: string, locale: Locale): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to find a matching voice
    const langCode = locale === 'bn' ? 'bn' : 'en';
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(
      (v) => v.lang.toLowerCase().startsWith(langCode)
    );
    if (match) {
      utterance.voice = match;
    }
    utterance.lang = locale === 'bn' ? 'bn-BD' : 'en-US';

    window.speechSynthesis.speak(utterance);
  } catch {
    // Silently fail — TTS is not critical
  }
}

/**
 * Pre-load voices (browsers load them asynchronously).
 * Call this once on app mount.
 */
export function preloadVoices(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }
}