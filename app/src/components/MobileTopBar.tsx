import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface MobileTopBarProps {
  /** Title displayed on mobile, hidden on sm+ */
  title: string;
  /** Right-side actions (buttons) — visible at all sizes */
  actions?: ReactNode;
  /** Optional back button / leading slot */
  leading?: ReactNode;
  className?: string;
}

/**
 * Sticky top bar for mobile viewports (&lt; 640px). Hidden on `sm:` so it
 * never duplicates the page's desktop header. Pages compose this at the
 * top of their scroll container — fixed position keeps it visible while
 * the rest of the page scrolls.
 */
export function MobileTopBar({ title, actions, leading, className }: MobileTopBarProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-30 -mx-2 sm:hidden flex items-center gap-2 px-3 h-14',
        'bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70 border-b border-border',
        className,
      )}
    >
      {leading}
      <h1 className="text-base font-semibold truncate flex-1 min-w-0">{title}</h1>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}
