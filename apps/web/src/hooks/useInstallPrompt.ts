import { useCallback, useEffect, useState } from 'react';

/**
 * Captures the browser's install prompt so the app can offer its own "Install" button.
 *
 * `beforeinstallprompt` fires early and only once. If nothing calls `preventDefault()` on it the
 * browser shows its own mini-infobar and the event is gone — so an Install button that shows up
 * later has nothing to trigger. Catching it at module load and stashing it is what makes an
 * explicit, user-initiated install possible at any point in the session.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level so the event is never missed, even if it fires before React mounts.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function broadcast() {
  for (const fn of listeners) fn(Boolean(deferredPrompt));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    // Stop the browser's own prompt so ours can control the timing and wording.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    broadcast();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes it here instead of via matchMedia.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(Boolean(deferredPrompt));
  const [installed, setInstalled] = useState(isStandalone());
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    listeners.add(setAvailable);
    const onInstalled = () => {
      deferredPrompt = null;
      setInstalled(true);
      setAvailable(false);
    };
    window.addEventListener('appinstalled', onInstalled);
    // display-mode can change when the user installs, without a reload.
    const mq = window.matchMedia('(display-mode: standalone)');
    const onModeChange = () => setInstalled(mq.matches);
    mq.addEventListener?.('change', onModeChange);
    return () => {
      listeners.delete(setAvailable);
      window.removeEventListener('appinstalled', onInstalled);
      mq.removeEventListener?.('change', onModeChange);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      // A prompt can only be used once.
      if (outcome === 'accepted') deferredPrompt = null;
      setAvailable(Boolean(deferredPrompt));
      return outcome;
    } finally {
      setInstalling(false);
    }
  }, []);

  return { available, installed, installing, install };
}
