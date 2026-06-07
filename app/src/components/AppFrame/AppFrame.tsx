import { useRouterState } from '@tanstack/react-router';
import { MobileNav } from '@/components/MobileNav';
import { TitleBarDragRegion } from '@/components/TitleBarDragRegion';
import { AudioKeepAlive } from '@/components/AudioPlayer/AudioKeepAlive';
import { AudioPlayer } from '@/components/AudioPlayer/AudioPlayer';
import { StoryTrackEditor } from '@/components/StoriesTab/StoryTrackEditor';
import { usePlatform } from '@/platform/PlatformContext';
import { cn } from '@/lib/utils/cn';
import { useStoryStore } from '@/stores/storyStore';
import { useStory } from '@/lib/hooks/useStories';

interface AppFrameProps {
  children: React.ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
  const routerState = useRouterState();
  const isStoriesRoute = routerState.location.pathname === '/stories';
  const platform = usePlatform();
  const isTauri = platform.metadata.isTauri;
  const isWindows = isTauri && navigator.userAgent.includes('Windows');
  // In Tauri the webview's overlay title bar overlaps the top of the app; in
  // web mode there is no title bar, so we must not add any top padding.
  const topSafePadding = isTauri ? (isWindows ? 'pt-8' : 'pt-12') : '';

  const selectedStoryId = useStoryStore((state) => state.selectedStoryId);
  const { data: story } = useStory(selectedStoryId);

  // Show track editor when on stories route with a selected story that has items
  const showTrackEditor = isStoriesRoute && selectedStoryId && story && story.items.length > 0;

  return (
    <div
      className={cn('h-screen bg-background flex flex-col overflow-hidden', topSafePadding)}
    >
      <TitleBarDragRegion />
      <AudioKeepAlive />
      {children}
      {showTrackEditor ? (
        <StoryTrackEditor storyId={story.id} items={story.items} />
      ) : (
        <AudioPlayer />
      )}
      <MobileNav />
    </div>
  );
}
