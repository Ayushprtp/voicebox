import { FloatingGenerateBox } from '@/components/Generation/FloatingGenerateBox';
import { usePlayerStore } from '@/stores/playerStore';
import { useStoryStore } from '@/stores/storyStore';
import { cn } from '@/lib/utils/cn';
import { StoryContent } from './StoryContent';
import { StoryList } from './StoryList';

export function StoriesTab() {
  const audioUrl = usePlayerStore((state) => state.audioUrl);
  const mobileView = useStoryStore((s) => s.mobileView);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden sm:-mx-8">
      {/* Main content area */}
      <div className="flex-1 min-h-0 sm:flex sm:gap-6 sm:overflow-hidden relative">
        {/* Left Column - Story List */}
        <div
          className={cn(
            'flex flex-col min-h-0 overflow-hidden w-full sm:max-w-[360px] sm:shrink-0',
            mobileView === 'list' ? 'flex' : 'hidden sm:flex',
          )}
        >
          <StoryList />
        </div>

        {/* Right Column - Story Content */}
        <div
          className={cn(
            'flex flex-col min-h-0 overflow-hidden flex-1 sm:pr-8',
            mobileView === 'content' ? 'flex' : 'hidden sm:flex',
          )}
        >
          <StoryContent />
        </div>

        {/* Floating Generate Box - position is managed via storyStore.trackEditorHeight */}
        <FloatingGenerateBox showVoiceSelector isPlayerOpen={!!audioUrl} />
      </div>
    </div>
  );
}
