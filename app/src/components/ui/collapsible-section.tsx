import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface CollapsibleSectionProps {
  /** Section heading shown in the header. */
  title: ReactNode;
  /** Optional one-line description. */
  description?: ReactNode;
  /** Icon to show in the header. */
  icon?: ReactNode;
  /** Content to show when expanded. */
  children: ReactNode;
  /** Start collapsed. Defaults to true. */
  defaultOpen?: boolean;
  /** When true, syncs with the parent via `open` / `onOpenChange` instead of internal state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional className applied to the outer card. */
  className?: string;
}

/**
 * Lightweight collapsible section used for "Advanced" / power-user groups.
 * Renders as a bordered card with a clickable header that toggles the body.
 * Uses internal state by default; pass `open` + `onOpenChange` to control
 * from a parent (e.g. a `useUIStore`).
 */
export function CollapsibleSection({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleToggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      className={cn(
        'rounded-lg border border-dashed bg-card/40 overflow-hidden',
        className,
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="w-full flex items-start gap-3 p-3 sm:p-4 text-left touch-manipulation hover:bg-muted/40 transition-colors"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 mt-0.5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-0',
            !open && '-rotate-90',
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            <span>{title}</span>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4 border-t">{children}</div>
      )}
    </section>
  );
}
