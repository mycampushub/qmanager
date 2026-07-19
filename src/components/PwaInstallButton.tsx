'use client';

import { useState } from 'react';
import { Download, CheckCircle2, Smartphone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface PwaInstallButtonProps {
  canInstall: boolean;
  isInstalled: boolean;
  isSupported: boolean;
  promptInstall: () => Promise<boolean>;
  /** Render as a sidebar menu item instead of a standalone button */
  variant?: 'sidebar' | 'button';
}

export function PwaInstallButton({
  canInstall,
  isInstalled,
  isSupported,
  promptInstall,
  variant = 'sidebar',
}: PwaInstallButtonProps) {
  const [installing, setInstalling] = useState(false);

  // Don't render at all if not supported (e.g. desktop browsers without PWA)
  if (!isSupported) return null;

  // Already installed — show subtle confirmation
  if (isInstalled) {
    if (variant === 'sidebar') {
      return (
        <div className="flex items-center gap-3 px-3 py-2.5 text-emerald-600 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>App Installed</span>
        </div>
      );
    }
    return null; // Don't show button if already installed
  }

  // Can install — show the install button
  if (canInstall) {
    const handleInstall = async () => {
      setInstalling(true);
      try {
        const accepted = await promptInstall();
        if (accepted) {
          toast.success('QueueFlow installed! You can now open it from your home screen.');
        }
      } catch {
        toast.error('Installation failed. Please try again.');
      } finally {
        setInstalling(false);
      }
    };

    if (variant === 'sidebar') {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-10"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {installing ? 'Installing...' : 'Install App'}
        </Button>
      );
    }

    // Button variant
    return (
      <Button
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={handleInstall}
        disabled={installing}
      >
        {installing ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {installing ? 'Installing...' : 'Install App'}
      </Button>
    );
  }

  // Supported but no prompt yet — show a subtle hint (sidebar only)
  if (variant === 'sidebar') {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground text-sm">
        <Smartphone className="w-4 h-4 shrink-0" />
        <span className="text-xs">Add to Home Screen from browser menu</span>
      </div>
    );
  }

  return null;
}