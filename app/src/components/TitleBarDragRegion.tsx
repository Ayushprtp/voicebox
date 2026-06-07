import { usePlatform } from '@/platform/PlatformContext';

export function TitleBarDragRegion() {
  const platform = usePlatform();
  if (!platform.metadata.isTauri) return null;

  const isWindows = navigator.userAgent.includes('Windows');
  if (isWindows) return null;

  return <div data-tauri-drag-region className="fixed top-0 left-0 right-0 h-12 z-[9999]" />;
}
