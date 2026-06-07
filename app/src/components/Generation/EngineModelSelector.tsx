import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import { FormControl } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api/client';
import type { VoiceProfileResponse } from '@/lib/api/types';
import { getLanguageOptionsForEngine } from '@/lib/constants/languages';
import type { GenerationFormValues } from '@/lib/hooks/useGenerationForm';

/**
 * Engine/model options and their display metadata.
 * Adding a new engine means adding one entry here AND in BACKEND_MODEL_NAME.
 */
type EngineOption = {
  value: string;
  label: string;
  engine: string;
  /** Backend `model_name` from /models/status used to detect download state. */
  backendModelName?: string;
  /** Group: 'local' = weights on disk, 'remote' = upstream API. */
  group: 'local' | 'remote';
  /**
   * Underlying model identifier (HF repo / upstream root) shown as secondary
   * text in the dropdown. Local engines map to a HuggingFace repo id; remote
   * engines map to whatever the upstream's /v1/models reports as `root`.
   */
  underlyingModel?: string;
};

const ENGINE_OPTIONS: readonly EngineOption[] = [
  // ── Local models (weights must be downloaded to appear) ─────────────
  { value: 'qwen:1.7B', label: 'Qwen3-TTS 1.7B (Cloning)', engine: 'qwen', backendModelName: 'qwen-tts-1.7B', group: 'local', underlyingModel: 'Qwen/Qwen3-TTS-12Hz-1.7B-Base' },
  { value: 'qwen:0.6B', label: 'Qwen3-TTS 0.6B (Cloning, fast)', engine: 'qwen', backendModelName: 'qwen-tts-0.6B', group: 'local', underlyingModel: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base' },
  { value: 'qwen_custom_voice:1.7B', label: 'Qwen CustomVoice 1.7B', engine: 'qwen_custom_voice', backendModelName: 'qwen-custom-voice-1.7B', group: 'local', underlyingModel: 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice' },
  { value: 'qwen_custom_voice:0.6B', label: 'Qwen CustomVoice 0.6B', engine: 'qwen_custom_voice', backendModelName: 'qwen-custom-voice-0.6B', group: 'local', underlyingModel: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice' },
  { value: 'luxtts', label: 'LuxTTS (CPU-friendly)', engine: 'luxtts', backendModelName: 'luxtts', group: 'local', underlyingModel: 'YatharthS/LuxTTS' },
  { value: 'chatterbox', label: 'Chatterbox Multilingual', engine: 'chatterbox', backendModelName: 'chatterbox-tts', group: 'local', underlyingModel: 'ResembleAI/chatterbox' },
  { value: 'chatterbox_turbo', label: 'Chatterbox Turbo (English, tags)', engine: 'chatterbox_turbo', backendModelName: 'chatterbox-turbo', group: 'local', underlyingModel: 'ResembleAI/chatterbox-turbo' },
  { value: 'tada:1B', label: 'TADA 1B (English)', engine: 'tada', backendModelName: 'tada-1b', group: 'local', underlyingModel: 'HumeAI/tada-1b' },
  { value: 'tada:3B', label: 'TADA 3B Multilingual', engine: 'tada', backendModelName: 'tada-3b-ml', group: 'local', underlyingModel: 'HumeAI/tada-3b-ml' },
  { value: 'kokoro', label: 'Kokoro 82M (CPU realtime)', engine: 'kokoro', backendModelName: 'kokoro', group: 'local', underlyingModel: 'hexgrad/Kokoro-82M' },
  // ── Remote models (no local download; all run on the same upstream
  //    `k2-fsa/OmniVoice` per /v1/models — the size labels are quality presets,
  //    not different model families). ──────────────────────────────────
  { value: 'remote_tts:tts-1', label: 'Remote TTS tts-1 (fast)', engine: 'remote_tts', group: 'remote', underlyingModel: 'k2-fsa/OmniVoice' },
  { value: 'remote_tts:tts-1-hd', label: 'Remote TTS tts-1-hd (high quality)', engine: 'remote_tts', group: 'remote', underlyingModel: 'k2-fsa/OmniVoice' },
  { value: 'remote_tts:omnivoice', label: 'Remote TTS Omnivoice (default)', engine: 'remote_tts', group: 'remote', underlyingModel: 'k2-fsa/OmniVoice' },
  { value: 'remote_tts_clone', label: 'Remote TTS Clone (reference audio)', engine: 'remote_tts_clone', group: 'remote', underlyingModel: 'k2-fsa/OmniVoice (clone endpoint)' },
] as const;

const ENGINE_DESCRIPTIONS: Record<string, string> = {
  qwen: 'Multi-language cloning, two sizes',
  qwen_custom_voice: '9 preset voices, instruct control',
  luxtts: 'Fast, English-focused',
  chatterbox: '23 languages, incl. Hebrew',
  chatterbox_turbo: 'English, [laugh] [cough] tags',
  tada: 'HumeAI, 700s+ coherent audio',
  kokoro: '82M params, CPU realtime, 8 langs',
  remote_tts: 'Remote API, no local download',
  remote_tts_clone: 'Reference-audio cloning via upstream',
};

/** Engines that only support English and should force language to 'en' on select. */
const ENGLISH_ONLY_ENGINES = new Set(['luxtts', 'chatterbox_turbo']);

/** Engines that support cloned (reference audio) profiles. */
const CLONING_ENGINES = new Set(['qwen', 'luxtts', 'chatterbox', 'chatterbox_turbo', 'tada', 'remote_tts_clone']);

function isProfileCompatibleWithEngine(
  profile: VoiceProfileResponse,
  engine: string,
): boolean {
  const voiceType = profile.voice_type || 'cloned';
  if (voiceType === 'preset') return profile.preset_engine === engine;
  if (voiceType === 'cloned') return CLONING_ENGINES.has(engine);
  return true; // designed — future
}

function getSelectValue(engine: string, modelSize?: string): string {
  if (engine === 'qwen') return `qwen:${modelSize || '1.7B'}`;
  if (engine === 'qwen_custom_voice') return `qwen_custom_voice:${modelSize || '1.7B'}`;
  if (engine === 'tada') return `tada:${modelSize || '1B'}`;
  if (engine === 'remote_tts') return `remote_tts:${modelSize || 'tts-1'}`;
  return engine;
}

export function applyEngineSelection(form: UseFormReturn<GenerationFormValues>, value: string) {
  if (value.startsWith('qwen_custom_voice:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'qwen_custom_voice');
    form.setValue('modelSize', modelSize as '1.7B' | '0.6B');
    const currentLang = form.getValues('language');
    const available = getLanguageOptionsForEngine('qwen_custom_voice');
    if (!available.some((l) => l.value === currentLang)) {
      form.setValue('language', available[0]?.value ?? 'en');
    }
  } else if (value.startsWith('qwen:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'qwen');
    form.setValue('modelSize', modelSize as '1.7B' | '0.6B');
    const currentLang = form.getValues('language');
    const available = getLanguageOptionsForEngine('qwen');
    if (!available.some((l) => l.value === currentLang)) {
      form.setValue('language', available[0]?.value ?? 'en');
    }
  } else if (value.startsWith('tada:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'tada');
    form.setValue('modelSize', modelSize as '1B' | '3B');
    if (modelSize === '1B') {
      form.setValue('language', 'en');
    } else {
      const currentLang = form.getValues('language');
      const available = getLanguageOptionsForEngine('tada');
      if (!available.some((l) => l.value === currentLang)) {
        form.setValue('language', available[0]?.value ?? 'en');
      }
    }
  } else if (value.startsWith('remote_tts:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'remote_tts');
    form.setValue('modelSize', modelSize as 'tts-1' | 'tts-1-hd' | 'omnivoice');
    const currentLang = form.getValues('language');
    const available = getLanguageOptionsForEngine('remote_tts');
    if (!available.some((l) => l.value === currentLang)) {
      form.setValue('language', available[0]?.value ?? 'en');
    }
  } else {
    form.setValue('engine', value as GenerationFormValues['engine']);
    form.setValue('modelSize', undefined as unknown as '1.7B' | '0.6B');
    if (ENGLISH_ONLY_ENGINES.has(value)) {
      form.setValue('language', 'en');
    } else {
      const currentLang = form.getValues('language');
      const available = getLanguageOptionsForEngine(value);
      if (!available.some((l) => l.value === currentLang)) {
        form.setValue('language', available[0]?.value ?? 'en');
      }
    }
  }
}

interface EngineModelSelectorProps {
  form: UseFormReturn<GenerationFormValues>;
  compact?: boolean;
  selectedProfile?: VoiceProfileResponse | null;
}

export function EngineModelSelector({ form, compact, selectedProfile }: EngineModelSelectorProps) {
  const engine = form.watch('engine') || 'qwen';
  const modelSize = form.watch('modelSize');
  const selectValue = getSelectValue(engine, modelSize);

  // Pull /models/status so we can hide Local entries whose weights aren't downloaded.
  // Stale-while-revalidate every 30s; cheap endpoint.
  const { data: modelStatus } = useQuery({
    queryKey: ['modelStatus'],
    queryFn: () => apiClient.getModelStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const downloadedSet = useMemo(() => {
    const set = new Set<string>();
    if (modelStatus?.models) {
      for (const m of modelStatus.models) {
        if (m.downloaded) set.add(m.model_name);
      }
    }
    return set;
  }, [modelStatus]);

  const availableOptions = useMemo(() => {
    return ENGINE_OPTIONS.filter((opt) => {
      if (selectedProfile && !isProfileCompatibleWithEngine(selectedProfile, opt.engine)) return false;
      if (opt.group === 'local' && opt.backendModelName && downloadedSet.size > 0 && !downloadedSet.has(opt.backendModelName)) {
        return false;
      }
      return true;
    });
  }, [selectedProfile, downloadedSet]);

  const localOptions = availableOptions.filter((o) => o.group === 'local');
  const remoteOptions = availableOptions.filter((o) => o.group === 'remote');
  const currentEngineAvailable = availableOptions.some((opt) => opt.value === selectValue);

  useEffect(() => {
    if (!currentEngineAvailable && availableOptions.length > 0) {
      applyEngineSelection(form, availableOptions[0].value);
    }
  }, [availableOptions, currentEngineAvailable, form]);

  const itemClass = compact ? 'text-xs text-muted-foreground' : undefined;
  const triggerClass = compact
    ? 'h-8 text-xs bg-card border-border rounded-full hover:bg-background/50 transition-all'
    : undefined;

  const renderOption = (opt: EngineOption) => (
    <SelectItem key={opt.value} value={opt.value} className={itemClass}>
      <div className="flex flex-col gap-1 py-0.5">
        <div className="flex items-center gap-1.5">
          <Badge
            variant={opt.group === 'local' ? 'local' : 'remote'}
            className="px-1.5 py-0 text-[9px] uppercase tracking-wider"
          >
            {opt.group}
          </Badge>
          <span className="font-medium">{opt.label}</span>
        </div>
        {opt.underlyingModel && (
          <span className="text-[10px] text-muted-foreground/80 font-mono pl-0.5">
            {opt.underlyingModel}
          </span>
        )}
      </div>
    </SelectItem>
  );

  const currentOption = ENGINE_OPTIONS.find((o) => o.value === selectValue);

  return (
    <Select value={selectValue} onValueChange={(v) => applyEngineSelection(form, v)}>
      <FormControl>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="Select a model">
            {currentOption ? (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Badge
                    variant={currentOption.group === 'local' ? 'local' : 'remote'}
                    className="shrink-0 px-1.5 py-0 text-[9px] uppercase tracking-wider"
                  >
                    {currentOption.group}
                  </Badge>
                  <span className="truncate">{currentOption.label}</span>
                </div>
                {currentOption.underlyingModel && (
                  <span className="text-[9px] text-muted-foreground/80 font-mono pl-0.5 truncate">
                    {currentOption.underlyingModel}
                  </span>
                )}
              </div>
            ) : null}
          </SelectValue>
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {localOptions.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              Local models{downloadedSet.size > 0 ? ` (${localOptions.length} downloaded)` : ''}
            </SelectLabel>
            {localOptions.map(renderOption)}
          </SelectGroup>
        )}
        {localOptions.length > 0 && remoteOptions.length > 0 && <SelectSeparator />}
        {remoteOptions.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              Remote models
            </SelectLabel>
            {remoteOptions.map(renderOption)}
          </SelectGroup>
        )}
        {availableOptions.length === 0 && (
          <SelectItem value="__none__" disabled>
            No engines available
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

/** Returns a human-readable description for the currently selected engine. */
export function getEngineDescription(engine: string): string {
  return ENGINE_DESCRIPTIONS[engine] ?? '';
}

export { isProfileCompatibleWithEngine };
