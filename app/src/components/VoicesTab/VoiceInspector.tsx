import { zodResolver } from '@hookform/resolvers/zod';
import { Edit2, Mic, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { EffectsChainEditor } from '@/components/Effects/EffectsChainEditor';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { SampleList } from '@/components/VoiceProfiles/SampleList';
import { apiClient } from '@/lib/api/client';
import type { EffectConfig } from '@/lib/api/types';
import { LANGUAGE_CODES, LANGUAGE_OPTIONS, type LanguageCode } from '@/lib/constants/languages';
import { BOTTOM_SAFE_AREA_PADDING } from '@/lib/constants/ui';
import {
  useDeleteAvatar,
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
} from '@/lib/hooks/useProfiles';
import { cn } from '@/lib/utils/cn';
import { usePlayerStore } from '@/stores/playerStore';
import { useServerStore } from '@/stores/serverStore';
import { useUIStore } from '@/stores/uiStore';

function makeProfileSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t('profileForm.validation.nameRequired')).max(100),
    description: z.string().max(500).optional(),
    language: z.enum(LANGUAGE_CODES as [LanguageCode, ...LanguageCode[]]),
  });
}

type ProfileFormValues = {
  name: string;
  description?: string;
  language: LanguageCode;
};

interface VoiceInspectorProps {
  profileId: string;
}

export function VoiceInspector({ profileId }: VoiceInspectorProps) {
  const { t } = useTranslation();
  const { data: profile } = useProfile(profileId);
  const audioUrl = usePlayerStore((state) => state.audioUrl);
  const isPlayerVisible = !!audioUrl;
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const serverUrl = useServerStore((state) => state.serverUrl);
  const setSelectedVoiceId = useUIStore((state) => state.setSelectedVoiceId);
  const { toast } = useToast();

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [effectsChain, setEffectsChain] = useState<EffectConfig[]>([]);
  const [effectsDirty, setEffectsDirty] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(makeProfileSchema(t)),
    defaultValues: {
      name: '',
      description: '',
      language: 'en',
    },
  });

  // Populate form when the profile ID changes (not on every refetch),
  // so user edits aren't clobbered by background refetches.
  const profileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (profile && profile.id !== profileIdRef.current) {
      profileIdRef.current = profile.id;
      form.reset({
        name: profile.name,
        description: profile.description || '',
        language: profile.language as LanguageCode,
      });
      setEffectsChain(profile.effects_chain ?? []);
      setEffectsDirty(false);
    }
  }, [profile, form]);

  // Avatar preview
  useEffect(() => {
    if (profile?.avatar_path) {
      setAvatarPreview(`${serverUrl}/profiles/${profile.id}/avatar`);
    } else {
      setAvatarPreview(null);
    }
    setAvatarError(false);
  }, [profile, serverUrl]);

  // Escape closes the inspector. Bound on keydown capture so it fires
  // regardless of which child element has focus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedVoiceId(null);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [setSelectedVoiceId]);

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('profileForm.toast.invalidFile'),
        description: t('voiceInspector.toast.invalidImageFormat'),
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('profileForm.toast.fileTooLarge'),
        description: t('profileForm.toast.imageTooLargeDescription'),
        variant: 'destructive',
      });
      return;
    }
    uploadAvatar.mutate(
      { profileId, file },
      {
        onSuccess: () => {
          setAvatarPreview(URL.createObjectURL(file));
          toast({ title: t('voiceInspector.toast.avatarUpdated') });
        },
        onError: (err) => {
          toast({
            title: t('profileForm.toast.avatarUploadFailed'),
            description: err instanceof Error ? err.message : t('common.unknownError'),
            variant: 'destructive',
          });
        },
      },
    );
  }

  async function handleRemoveAvatar() {
    if (profile?.avatar_path) {
      try {
        await deleteAvatar.mutateAsync(profileId);
        toast({ title: t('profileForm.toast.avatarRemoved') });
      } catch (err) {
        toast({
          title: t('profileForm.toast.avatarRemoveFailed'),
          description: err instanceof Error ? err.message : t('common.unknownError'),
          variant: 'destructive',
        });
      }
    }
    setAvatarPreview(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  }

  async function onSubmit(data: ProfileFormValues) {
    try {
      await updateProfile.mutateAsync({
        profileId,
        data: {
          name: data.name,
          description: data.description,
          language: data.language,
        },
      });

      if (effectsDirty) {
        try {
          await apiClient.updateProfileEffects(
            profileId,
            effectsChain.length > 0 ? effectsChain : null,
          );
          setEffectsDirty(false);
        } catch (fxError) {
          toast({
            title: t('profileForm.toast.effectsUpdateFailed'),
            description:
              fxError instanceof Error
                ? fxError.message
                : t('profileForm.toast.effectsUpdateFailedFallback'),
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: t('profileForm.toast.voiceUpdated'),
        description: t('voiceInspector.toast.savedDescription', { name: data.name }),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('profileForm.toast.saveFailed'),
        variant: 'destructive',
      });
    }
  }

  function handleDiscard() {
    const dirty = form.formState.isDirty || effectsDirty;
    if (dirty) {
      if (profile) {
        form.reset({
          name: profile.name,
          description: profile.description || '',
          language: profile.language as LanguageCode,
        });
        setEffectsChain(profile.effects_chain ?? []);
        setEffectsDirty(false);
      }
    } else {
      setSelectedVoiceId(null);
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t('voiceInspector.loading')}
      </div>
    );
  }

  const isDirty = form.formState.isDirty || effectsDirty;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background sm:bg-card">
      {/* Mobile-only close bar — sits outside the <form> below so the X
          button can never be intercepted by form submit / validation. */}
      <div className="flex sm:hidden shrink-0 items-center justify-between gap-2 px-2 h-14 border-b bg-background sticky top-0 z-20">
        <div className="flex items-center gap-2 pl-2 min-w-0 flex-1">
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/70 rounded px-1.5 py-0.5 shrink-0">
            {t('voiceInspector.editingBadge', { defaultValue: 'Edit' })}
          </span>
          <span className="text-sm font-semibold text-foreground truncate">
            {profile?.name ?? ''}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 touch-manipulation rounded-full bg-muted/40 hover:bg-muted/70"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSelectedVoiceId(null);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t('common.close') as string}
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className={cn('flex-1 overflow-y-auto overscroll-contain', isPlayerVisible && BOTTOM_SAFE_AREA_PADDING)}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-0">
            {/* Avatar */}
            <div className="flex justify-center pt-5 pb-3">
              <div className="relative group">
                <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden border-2 border-border">
                  {avatarPreview && !avatarError ? (
                    <img
                      src={avatarPreview}
                      alt={profile.name}
                      className="h-full w-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <Mic className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label={t('voiceInspector.changeAvatar') as string}
                  className="absolute inset-0 rounded-full bg-accent/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  <Edit2 className="h-5 w-5 text-accent-foreground" />
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={deleteAvatar.isPending}
                    aria-label={t('voiceInspector.removeAvatar') as string}
                    className="absolute -bottom-1 -right-1 h-6 w-6 sm:bottom-0 sm:right-0 sm:h-5 sm:w-5 rounded-full bg-background text-muted-foreground flex items-center justify-center hover:bg-background hover:text-foreground transition-colors shadow-sm border border-border/60 touch-manipulation"
                  >
                    <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  </button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
            </div>

            {/* Fields */}
            <div className="space-y-3 px-3 sm:px-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profileForm.fields.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('profileForm.fields.namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('voiceInspector.fields.description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('profileForm.fields.descriptionPlaceholder')}
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('profileForm.fields.language')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Effects */}
              <div className="space-y-2">
                <FormLabel>{t('profileForm.fields.defaultEffects')}</FormLabel>
                <p className="text-xs text-muted-foreground">
                  {t('voiceInspector.defaultEffectsHint')}
                </p>
                <EffectsChainEditor
                  value={effectsChain}
                  onChange={(chain) => {
                    setEffectsChain(chain);
                    setEffectsDirty(true);
                  }}
                  compact
                />
              </div>

              {/* Save / Discard — sticky on mobile so it's always visible while editing */}
              <div
                className={cn(
                  'sticky bottom-0 z-10 -mx-3 sm:mx-0 px-3 sm:px-0 py-3 sm:py-0 sm:relative sm:bg-transparent sm:border-0 sm:mt-6',
                  'bg-background/95 backdrop-blur-sm border-t border-border/60',
                )}
              >
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDiscard}
                    disabled={updateProfile.isPending}
                    className="h-12 sm:h-10 px-4 text-sm font-medium touch-manipulation shrink-0"
                  >
                    {isDirty ? t('profileForm.actions.discard') : t('common.close')}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-12 sm:h-10 text-base font-semibold touch-manipulation"
                    disabled={!isDirty || updateProfile.isPending}
                  >
                    {updateProfile.isPending
                      ? t('profileForm.actions.saving')
                      : t('profileForm.actions.saveChanges')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Samples */}
            <div className="px-3 sm:px-5 pb-5">
              <SampleList profileId={profileId} />
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
