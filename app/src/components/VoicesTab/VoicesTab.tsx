import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Cloud, Mic, Plus, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { MultiSelect } from '@/components/ui/multi-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ProfileForm } from '@/components/VoiceProfiles/ProfileForm';
import { RemoteProfilesPanel } from '@/components/VoiceProfiles/RemoteProfilesPanel';
import { apiClient } from '@/lib/api/client';
import type { VoiceProfileResponse } from '@/lib/api/types';
import { BOTTOM_SAFE_AREA_PADDING } from '@/lib/constants/ui';
import { useProfiles } from '@/lib/hooks/useProfiles';
import { cn } from '@/lib/utils/cn';
import { usePlayerStore } from '@/stores/playerStore';
import { useServerStore } from '@/stores/serverStore';
import { useUIStore } from '@/stores/uiStore';
import { VoiceInspector } from './VoiceInspector';

export function VoicesTab() {
  const { t } = useTranslation();
  const { data: profiles, isLoading } = useProfiles();
  const queryClient = useQueryClient();
  const setDialogOpen = useUIStore((state) => state.setProfileDialogOpen);
  const selectedVoiceId = useUIStore((state) => state.selectedVoiceId);
  const setSelectedVoiceId = useUIStore((state) => state.setSelectedVoiceId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioUrl = usePlayerStore((state) => state.audioUrl);
  const isPlayerVisible = !!audioUrl;
  const [search, setSearch] = useState('');

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.language.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  // Auto-select first profile on desktop only. On mobile, the inspector
  // is a full-screen bottom sheet — opening it on landing would block the
  // list and surprise the user. Mobile users tap a card to open the sheet.
  useEffect(() => {
    if (!profiles || profiles.length === 0) return;
    if (typeof window === 'undefined') return;
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    if (!isDesktop) return;
    if (!selectedVoiceId) {
      setSelectedVoiceId(profiles[0].id);
    }
    // Clear selection if selected profile was deleted
    if (selectedVoiceId && !profiles.find((p) => p.id === selectedVoiceId)) {
      setSelectedVoiceId(profiles[0].id);
    }
  }, [profiles, selectedVoiceId, setSelectedVoiceId]);

  // Get channel assignments for each profile
  const { data: channelAssignments } = useQuery({
    queryKey: ['profile-channels'],
    queryFn: async () => {
      if (!profiles) return {};
      const assignments: Record<string, string[]> = {};
      for (const profile of profiles) {
        try {
          const result = await apiClient.getProfileChannels(profile.id);
          assignments[profile.id] = result.channel_ids;
        } catch {
          assignments[profile.id] = [];
        }
      }
      return assignments;
    },
    enabled: !!profiles,
  });

  // Get all channels
  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => apiClient.listChannels(),
  });

  const handleChannelChange = async (profileId: string, channelIds: string[]) => {
    try {
      await apiClient.setProfileChannels(profileId, channelIds);
      queryClient.invalidateQueries({ queryKey: ['profile-channels'] });
    } catch (error) {
      console.error('Failed to update channels:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t('voicesTab.loading')}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-0 overflow-hidden sm:-mx-8">
      {/* Left: Table / card list */}
      <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
        {/* Fixed Header */}
        <div className="px-4 sm:px-8 pt-2 sm:pt-0 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
            <h1 className="text-xl sm:text-2xl font-bold">{t('voicesTab.title')}</h1>
            <div className="flex-1" />
            <div className="relative w-full sm:w-[240px] order-last sm:order-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('voicesTab.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-8 pr-8 text-sm rounded-full focus-visible:ring-0 focus-visible:ring-offset-0 w-full"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t('common.close') as string}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-muted/60 flex items-center justify-center text-muted-foreground touch-manipulation"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button onClick={() => setDialogOpen(true)} className="h-10">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t('voicesTab.newVoice')}</span>
              <span className="sm:hidden sr-only">{t('voicesTab.newVoice')}</span>
            </Button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          ref={scrollRef}
          className={cn(
            'flex-1 overflow-y-auto overflow-x-auto relative z-0',
            isPlayerVisible && BOTTOM_SAFE_AREA_PADDING,
          )}
        >
          {/* Desktop: full table */}
          <div className="hidden sm:block">
            <Table className="table-fixed min-w-[700px] [&_td:first-child]:pl-8 [&_th:first-child]:pl-8">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">{t('voicesTab.columns.name')}</TableHead>
                  <TableHead className="w-[10%]">{t('voicesTab.columns.language')}</TableHead>
                  <TableHead className="w-[10%]">{t('voicesTab.columns.generations')}</TableHead>
                  <TableHead className="w-[8%]">{t('voicesTab.columns.samples')}</TableHead>
                  <TableHead className="w-[8%]">{t('voicesTab.columns.effects')}</TableHead>
                  <TableHead className="w-[24%]">{t('voicesTab.columns.channels')}</TableHead>
                  <TableHead className="w-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((profile) => (
                  <VoiceRow
                    key={profile.id}
                    profile={profile}
                    isSelected={selectedVoiceId === profile.id}
                    onSelect={() => setSelectedVoiceId(profile.id)}
                    channelIds={channelAssignments?.[profile.id] || []}
                    channels={channels || []}
                    onChannelChange={(channelIds) => handleChannelChange(profile.id, channelIds)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: card list */}
          <ul className="sm:hidden space-y-2 px-3">
            {filteredProfiles.length === 0 ? (
              <li className="text-center text-muted-foreground py-12 text-sm">
                {search.trim()
                  ? t('voicesTab.noResults', { defaultValue: 'No voices match your search.' })
                  : t('voicesTab.emptyMobile', {
                      defaultValue: 'No voices yet. Tap the + button to create one.',
                    })}
              </li>
            ) : (
              filteredProfiles.map((profile) => (
                <VoiceCard
                  key={profile.id}
                  profile={profile}
                  isSelected={selectedVoiceId === profile.id}
                  onSelect={() => setSelectedVoiceId(profile.id)}
                  channelIds={channelAssignments?.[profile.id] || []}
                  channels={channels || []}
                  onChannelChange={(channelIds) => handleChannelChange(profile.id, channelIds)}
                />
              ))
            )}
          </ul>

          {/* Advanced options — Remote Profiles (OmniVoice upstream) */}
          <div className="px-3 sm:px-8 pt-6 pb-2">
            <CollapsibleSection
              title={t('profiles.remote.title')}
              description={t('profiles.remote.description')}
              icon={<Cloud className="h-4 w-4 text-muted-foreground shrink-0" />}
              defaultOpen={false}
            >
              <RemoteProfilesPanel />
            </CollapsibleSection>
          </div>
        </div>
      </div>

      {/* Right: Inspector — bottom sheet on mobile, side panel on desktop */}
      {selectedVoiceId && (
        <>
          <button
            type="button"
            aria-label="Close inspector"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedVoiceId(null);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed inset-0 z-40 bg-black/60 sm:hidden animate-in fade-in-0 touch-manipulation"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl sm:relative sm:inset-auto sm:z-auto sm:w-[340px] sm:shrink-0 sm:border-l sm:border-t-0 sm:rounded-t-none sm:max-h-none sm:shadow-none sm:bg-card sm:animate-none animate-in slide-in-from-bottom duration-200">
            {/* Drag handle — tap to dismiss. */}
            <button
              type="button"
              aria-label="Dismiss inspector"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedVoiceId(null);
              }}
              className="sm:hidden flex justify-center items-center pt-2 pb-3 shrink-0 w-full touch-manipulation"
            >
              <span className="h-1.5 w-14 rounded-full bg-muted-foreground/40" />
            </button>
            <VoiceInspector key={selectedVoiceId} profileId={selectedVoiceId} />
          </div>
        </>
      )}

      <ProfileForm />
    </div>
  );
}

interface VoiceRowProps {
  profile: VoiceProfileResponse;
  isSelected: boolean;
  onSelect: () => void;
  channelIds: string[];
  channels: Array<{ id: string; name: string; is_default: boolean }>;
  onChannelChange: (channelIds: string[]) => void;
}

function VoiceRow({
  profile,
  isSelected,
  onSelect,
  channelIds,
  channels,
  onChannelChange,
}: VoiceRowProps) {
  const { t } = useTranslation();
  const serverUrl = useServerStore((state) => state.serverUrl);
  const [avatarError, setAvatarError] = useState(false);
  const avatarUrl = profile.avatar_path ? `${serverUrl}/profiles/${profile.id}/avatar` : null;

  const enabledEffects = profile.effects_chain?.filter((e) => e.enabled) ?? [];
  const effectsSummary = enabledEffects.map((e) => e.type).join(' → ');

  return (
    <TableRow
      className={cn('cursor-pointer', isSelected ? 'bg-muted/50' : 'hover:bg-muted/50')}
      onClick={onSelect}
    >
      <TableCell>
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={t('voicesTab.avatarAlt', { name: profile.name })}
                className="h-full w-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <Mic className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{profile.name}</div>
            {profile.description && (
              <div className="text-sm text-muted-foreground truncate">{profile.description}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>{profile.language}</TableCell>
      <TableCell>{profile.generation_count}</TableCell>
      <TableCell>{profile.sample_count}</TableCell>
      <TableCell>
        {enabledEffects.length > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-accent"
            title={effectsSummary}
          >
            <Sparkles className="h-3 w-3 fill-accent" />
            {enabledEffects.length}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <MultiSelect
          options={channels.map((ch) => ({
            value: ch.id,
            label: ch.is_default ? t('voicesTab.channelDefaultLabel', { name: ch.name }) : ch.name,
          }))}
          value={channelIds}
          onChange={onChannelChange}
          placeholder={t('voicesTab.selectChannels')}
          className="w-full"
        />
      </TableCell>
      <TableCell />
    </TableRow>
  );
}

interface VoiceCardProps {
  profile: VoiceProfileResponse;
  isSelected: boolean;
  onSelect: () => void;
  channelIds: string[];
  channels: Array<{ id: string; name: string; is_default: boolean }>;
  onChannelChange: (channelIds: string[]) => void;
}

/** Compact card view of a voice profile, used in the mobile-only list. */
function VoiceCard({
  profile,
  isSelected,
  onSelect,
  channelIds,
  channels,
  onChannelChange,
}: VoiceCardProps) {
  const { t } = useTranslation();
  const serverUrl = useServerStore((state) => state.serverUrl);
  const [avatarError, setAvatarError] = useState(false);
  const avatarUrl = profile.avatar_path ? `${serverUrl}/profiles/${profile.id}/avatar` : null;
  const [channelsOpen, setChannelsOpen] = useState(false);

  const enabledEffects = profile.effects_chain?.filter((e) => e.enabled) ?? [];

  return (
    <li
      className={cn(
        'rounded-lg border bg-card overflow-hidden',
        isSelected && 'ring-1 ring-accent',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-3 p-3 text-left touch-manipulation active:bg-muted/30"
      >
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {avatarUrl && !avatarError ? (
            <img
              src={avatarUrl}
              alt={t('voicesTab.avatarAlt', { name: profile.name })}
              className="h-full w-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <Mic className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{profile.name}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="uppercase font-mono">{profile.language}</span>
            <span>·</span>
            <span>
              {profile.generation_count} {t('voicesTab.columns.generations').toLowerCase()}
            </span>
            <span>·</span>
            <span>
              {profile.sample_count} {t('voicesTab.columns.samples').toLowerCase()}
            </span>
            {enabledEffects.length > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-accent">
                  <Sparkles className="h-3 w-3 fill-accent" />
                  {enabledEffects.length}
                </span>
              </>
            )}
          </div>
        </div>
      </button>
      <div className="border-t px-3 py-2">
        <button
          type="button"
          onClick={() => setChannelsOpen((o) => !o)}
          aria-expanded={channelsOpen}
          className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground touch-manipulation"
        >
          <span>
            {t('voicesTab.columns.channels')}{' '}
            {channelIds.length > 0 && (
              <span className="ml-1 text-foreground">({channelIds.length})</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              channelsOpen && 'rotate-180',
              !channelsOpen && '-rotate-90',
            )}
          />
        </button>
        {channelsOpen && (
          <div className="pt-2" onClick={(e) => e.stopPropagation()}>
            <MultiSelect
              options={channels.map((ch) => ({
                value: ch.id,
                label: ch.is_default
                  ? t('voicesTab.channelDefaultLabel', { name: ch.name })
                  : ch.name,
              }))}
              value={channelIds}
              onChange={onChannelChange}
              placeholder={t('voicesTab.selectChannels')}
              className="w-full"
            />
          </div>
        )}
      </div>
    </li>
  );
}
