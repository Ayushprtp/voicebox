/**
 * UI layout constants for safe area padding.
 *
 * NOTE: These constants compensate for the Tauri webview's overlay title bar
 * and are only meaningful in Tauri. In web mode the components that consume
 * them gate them behind `usePlatform().metadata.isTauri` and apply no padding.
 */

const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

/**
 * Top safe area padding for the Tauri root — height of the drag-region bar.
 * Only applied in Tauri builds (see AppFrame.tsx, App.tsx loading screen).
 * On macOS this accounts for the overlay titlebar (48px).
 * On Windows the native title bar is outside the webview, so we still need a
 * smaller padding for the window-frame area.
 */
export const TOP_SAFE_AREA_PADDING = isWindows ? 'pt-8' : 'pt-12';

/**
 * Bottom safe area padding to keep content above the audio player.
 * On mobile, also reserves space for the bottom-nav.
 * Corresponds to Tailwind's pb-32 (8rem / 128px) on desktop and
 * pb-48 (12rem / 192px) on mobile (player ~64px + nav 64px + buffer).
 */
export const BOTTOM_SAFE_AREA_PADDING = 'pb-48 sm:pb-32';

/**
 * Height of the mobile bottom-nav bar (icon + label, two-row).
 * Used by FloatingGenerateBox and audio player to reserve space.
 */
export const MOBILE_NAV_HEIGHT = 'h-16'; // 64px
export const MOBILE_NAV_PADDING = 'pb-16'; // 64px

