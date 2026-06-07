import { Link, useMatchRoute } from '@tanstack/react-router';
import { AudioLines, Box, Captions, type LucideIcon, Mic, Settings, Volume2, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/cn';

interface Tab {
  id: string;
  path: string;
  icon: LucideIcon;
  labelKey: string;
}

const tabs: Tab[] = [
  { id: 'main', path: '/', icon: Volume2, labelKey: 'nav.generate' },
  { id: 'stories', path: '/stories', icon: AudioLines, labelKey: 'nav.stories' },
  { id: 'captures', path: '/captures', icon: Captions, labelKey: 'nav.captures' },
  { id: 'voices', path: '/voices', icon: Mic, labelKey: 'nav.voices' },
  { id: 'effects', path: '/effects', icon: Wand2, labelKey: 'nav.effects' },
  { id: 'models', path: '/models', icon: Box, labelKey: 'nav.models' },
  { id: 'settings', path: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

/**
 * Mobile-only bottom navigation bar. Renders a 5-item primary nav with a
 * "More" overflow for the remaining 2 items. Hidden on `sm:` because the
 * desktop <Sidebar /> handles navigation there.
 */
export function MobileNav() {
  const { t } = useTranslation();
  const matchRoute = useMatchRoute();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 h-16 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 border-t border-border sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      <ul className="grid grid-cols-7 h-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            tab.path === '/'
              ? matchRoute({ to: '/', fuzzy: false })
              : matchRoute({ to: tab.path, fuzzy: true });
          return (
            <li key={tab.id} className="h-full">
              <Link
                to={tab.path}
                aria-label={t(tab.labelKey)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors touch-manipulation active:scale-95',
                  isActive ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-none truncate max-w-full px-0.5">
                  {t(tab.labelKey)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
