import { EffectsDetail } from './EffectsDetail';
import { EffectsList } from './EffectsList';
import { useEffectsStore } from '@/stores/effectsStore';
import { cn } from '@/lib/utils/cn';

export function EffectsTab() {
  const mobileView = useEffectsStore((s) => s.mobileView);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden sm:-mx-8">
      <div className="flex-1 min-h-0 sm:flex sm:gap-6 sm:overflow-hidden">
        {/* Left - Presets list (mobile: shown when mobileView === 'list') */}
        <div
          className={cn(
            'flex flex-col min-h-0 sm:w-full sm:max-w-[360px] sm:shrink-0',
            mobileView === 'list' ? 'flex' : 'hidden sm:flex',
          )}
        >
          <EffectsList />
        </div>

        {/* Right - Detail / editor (mobile: shown when mobileView === 'detail') */}
        <div
          className={cn(
            'flex-1 min-h-0 flex-col sm:pr-8',
            mobileView === 'detail' ? 'flex' : 'hidden sm:flex',
          )}
        >
          <EffectsDetail />
        </div>
      </div>
    </div>
  );
}
