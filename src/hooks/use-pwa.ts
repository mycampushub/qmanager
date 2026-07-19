// =============================================================================
// usePwa — Auth-gated PWA controller
//
// This hook ONLY activates PWA capabilities (manifest, service worker, install
// prompt) for authenticated users. Public visitors (join queue, marketing) never
// get the service worker registered and never see the install prompt.
//
// Strategy:
//   1. On mount, if authenticated → inject <link rel="manifest"> + register SW
//   2. Capture `beforeinstallprompt` → expose via `canInstall` / `promptInstall`
//   3. On logout → unregister SW + remove manifest link
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UsePwaReturn {
  /** Whether the browser supports PWA install */
  isSupported: boolean;
  /** Whether an install prompt is available to show */
  canInstall: boolean;
  /** Whether the app is currently installed (running as PWA) */
  isInstalled: boolean;
  /** Trigger the native install prompt. Returns true if user accepted. */
  promptInstall: () => Promise<boolean>;
  /** Manually check/update install status */
  refreshInstallStatus: () => void;
}

export function usePwa(isAuthenticated: boolean): UsePwaReturn {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  // Detect PWA support
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      ('serviceWorker' in navigator || (navigator as unknown as { standalone?: boolean }).standalone !== undefined);

    setIsSupported(supported);
  }, []);

  // Check if already installed
  const checkInstalled = useCallback(() => {
    const installed =
      // iOS Safari
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      // Chrome/Edge on desktop
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;

    setIsInstalled(installed);
  }, []);

  useEffect(() => {
    checkInstalled();
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = () => checkInstalled();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [checkInstalled]);

  // ─── Capture beforeinstallprompt ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent default mini-infobar
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detect when app is installed (dismiss any pending prompt)
    const installedHandler = () => {
      setCanInstall(false);
      deferredPromptRef.current = null;
      checkInstalled();
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [checkInstalled]);

  // ─── Auth-gated: inject manifest + register SW ───────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      // User logged out or is public — clean up everything
      cleanupPwa();
      return;
    }

    // 1. Inject manifest link
    injectManifest();

    // 2. Inject apple touch icon
    injectAppleIcon();

    // 3. Inject apple web app meta tags
    injectAppleMeta();

    // 4. Register service worker
    registerSw();

    // Cleanup on unmount or auth change
    return () => {
      // Don't clean up on re-render, only on logout (handled above)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return false;

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      deferredPromptRef.current = null;
      setCanInstall(false);

      if (outcome === 'accepted') {
        checkInstalled();
        return true;
      }
    } catch {
      // User may have dismissed via browser UI
    }

    return false;
  }, [checkInstalled]);

  return {
    isSupported,
    canInstall,
    isInstalled,
    promptInstall,
    refreshInstallStatus: checkInstalled,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const MANIFEST_ID = 'pwa-manifest-link';
const APPLE_ICON_ID = 'pwa-apple-icon';
const APPLE_META_CAPABLE_ID = 'pwa-apple-capable';
const APPLE_META_STATUSBAR_ID = 'pwa-apple-statusbar';

function injectManifest() {
  if (document.getElementById(MANIFEST_ID)) return;
  const link = document.createElement('link');
  link.id = MANIFEST_ID;
  link.rel = 'manifest';
  link.href = '/manifest.json';
  document.head.appendChild(link);
}

function injectAppleIcon() {
  if (document.getElementById(APPLE_ICON_ID)) return;
  const link = document.createElement('link');
  link.id = APPLE_ICON_ID;
  link.rel = 'apple-touch-icon';
  link.href = '/icons/icon-512.png';
  document.head.appendChild(link);
}

function injectAppleMeta() {
  // apple-mobile-web-app-capable
  if (!document.getElementById(APPLE_META_CAPABLE_ID)) {
    const meta = document.createElement('meta');
    meta.id = APPLE_META_CAPABLE_ID;
    meta.name = 'apple-mobile-web-app-capable';
    meta.content = 'yes';
    document.head.appendChild(meta);
  }

  // apple-mobile-web-app-status-bar-style
  if (!document.getElementById(APPLE_META_STATUSBAR_ID)) {
    const meta = document.createElement('meta');
    meta.id = APPLE_META_STATUSBAR_ID;
    meta.name = 'apple-mobile-web-app-status-bar-style';
    meta.content = 'default';
    document.head.appendChild(meta);
  }

  // apple-mobile-web-app-title
  if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-title';
    meta.content = 'QueueFlow';
    document.head.appendChild(meta);
  }
}

function removeElement(id: string) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

async function registerSw() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    // Listen for updates
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // New version activated — could notify user
          console.log('[PWA] New service worker activated');
        }
      });
    });

    console.log('[PWA] Service worker registered');
  } catch (err) {
    console.warn('[PWA] Service worker registration failed:', err);
  }
}

function cleanupPwa() {
  // Remove manifest link (prevents install prompt from appearing)
  removeElement(MANIFEST_ID);
  // Remove apple meta tags
  removeElement(APPLE_ICON_ID);
  removeElement(APPLE_META_CAPABLE_ID);
  removeElement(APPLE_META_STATUSBAR_ID);

  // Remove apple-mobile-web-app-title
  const titleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (titleMeta) titleMeta.remove();

  // Unregister service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration('/sw.js').then((reg) => {
      if (reg) {
        reg.unregister().then(() => {
          console.log('[PWA] Service worker unregistered (logged out)');
        });
      }
    });
  }
}