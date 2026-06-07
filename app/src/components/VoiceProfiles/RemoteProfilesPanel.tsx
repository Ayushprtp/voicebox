import { CloudOff, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { RemoteProfileLink } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { useProfiles } from '@/lib/hooks/useProfiles';

const REMOTE_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Panel that surfaces the remote-voice-profile sync surface (OmniVoice upstream).
 *
 * Two-way sync is asymmetric in practice:
 * - Push: upload a local cloned profile's first sample to the upstream and
 *   remember the link. This works today.
 * - Pull: the upstream's GET endpoint returns metadata only (no audio bytes),
 *   so pulling a remote-only profile is not implementable. The UI surfaces a
 *   note explaining this rather than exposing a button that will 501.
 */
export function RemoteProfilesPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: profiles } = useProfiles();

  // List of local profiles linked to a remote
  const linkedQuery = useQuery({
    queryKey: ['remoteProfiles'],
    queryFn: () => apiClient.listRemoteProfiles(),
  });

  // Form state for the push form
  const [pushProfileId, setPushProfileId] = useState<string>('');
  const [pushRemoteId, setPushRemoteId] = useState<string>('');
  const [pushOverwrite, setPushOverwrite] = useState(false);

  // Filter candidate local profiles to cloned ones that have an audio sample
  // and aren't already linked to a remote.
  const linkedIds = new Set((linkedQuery.data?.items ?? []).map((i) => i.local_profile_id));
  const candidates = (profiles ?? []).filter(
    (p) => p.voice_type !== 'preset' && (p.sample_count ?? 0) > 0 && !linkedIds.has(p.id),
  );

  const pushMutation = useMutation({
    mutationFn: (vars: { localId: string; remoteId: string; overwrite: boolean }) =>
      apiClient.pushLocalToRemote({
        local_profile_id: vars.localId,
        remote_profile_id: vars.remoteId,
        overwrite: vars.overwrite,
      }),
    onSuccess: (res, vars) => {
      toast({ title: t('profiles.remote.successPush', { name: vars.remoteId }) });
      void qc.invalidateQueries({ queryKey: ['remoteProfiles'] });
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      setPushProfileId('');
      setPushRemoteId('');
      setPushOverwrite(false);
      void res;
    },
    onError: (err: Error) => {
      toast({
        title: t('profiles.remote.errorPushFailed', { message: err.message }),
        variant: 'destructive',
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (remoteId: string) => apiClient.unlinkRemoteProfile(remoteId),
    onSuccess: (res, remoteId) => {
      toast({ title: t('profiles.remote.successUnlink', { name: remoteId }) });
      void qc.invalidateQueries({ queryKey: ['remoteProfiles'] });
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      void res;
    },
    onError: (err: Error) => {
      toast({
        title: t('profiles.remote.errorUnlinkFailed', { message: err.message }),
        variant: 'destructive',
      });
    },
  });

  const repushMutation = useMutation({
    mutationFn: (item: RemoteProfileLink) =>
      apiClient.pushLocalToRemote({
        local_profile_id: item.local_profile_id,
        remote_profile_id: item.remote_profile_id,
        overwrite: true,
      }),
    onSuccess: (_res, item) => {
      toast({ title: t('profiles.remote.successPush', { name: item.remote_profile_id }) });
      void qc.invalidateQueries({ queryKey: ['remoteProfiles'] });
    },
    onError: (err: Error) => {
      toast({
        title: t('profiles.remote.errorPushFailed', { message: err.message }),
        variant: 'destructive',
      });
    },
  });

  const handlePush = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushProfileId || !pushRemoteId) return;
    if (!REMOTE_ID_REGEX.test(pushRemoteId)) {
      toast({
        title: t('profiles.remote.errorPushFailed', {
          message: 'remote profile name must match [a-zA-Z0-9_-]{1,64}',
        }),
        variant: 'destructive',
      });
      return;
    }
    pushMutation.mutate({ localId: pushProfileId, remoteId: pushRemoteId, overwrite: pushOverwrite });
  };

  const linked = linkedQuery.data?.items ?? [];

  return (
    <div className="space-y-4 pt-3">
        {/* Synced list */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('profiles.remote.syncedSection')}
          </div>
          {linkedQuery.isLoading ? null : linked.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              {t('profiles.remote.syncedEmpty')}
            </p>
          ) : (
            <ul className="space-y-1">
              {linked.map((item) => (
                <li
                  key={item.remote_profile_id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{item.local_profile_name}</span>
                    <span className="text-muted-foreground">
                      → <code className="text-[10px]">{item.remote_profile_id}</code>
                      {item.language && (
                        <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-[10px] uppercase">
                          {item.language}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={repushMutation.isPending}
                      onClick={() => repushMutation.mutate(item)}
                      title={t('profiles.remote.repushButton') as string}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      disabled={unlinkMutation.isPending}
                      onClick={() => unlinkMutation.mutate(item.remote_profile_id)}
                      title={t('profiles.remote.unlinkButton') as string}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Push form */}
        <form onSubmit={handlePush} className="space-y-2 border-t pt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('profiles.remote.pushSection')}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('profiles.remote.pushHelp')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-[11px]">{t('profiles.remote.localProfileLabel')}</Label>
              <select
                value={pushProfileId}
                onChange={(e) => setPushProfileId(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                required
              >
                <option value="">—</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sample_count} sample{p.sample_count === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t('profiles.remote.remoteIdLabel')}</Label>
              <Input
                value={pushRemoteId}
                onChange={(e) => setPushRemoteId(e.target.value)}
                placeholder={t('profiles.remote.remoteIdPlaceholder') as string}
                className="h-8 text-xs"
                pattern="^[a-zA-Z0-9_-]{1,64}$"
                required
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                size="sm"
                className="h-8 w-full sm:w-auto"
                disabled={pushMutation.isPending || !pushProfileId || !pushRemoteId}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {pushMutation.isPending
                  ? (t('profiles.remote.pushing') as string)
                  : (t('profiles.remote.pushButton') as string)}
              </Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Checkbox
              checked={pushOverwrite}
              onCheckedChange={(v) => setPushOverwrite(v === true)}
            />
            {t('profiles.remote.overwriteLabel')}
          </label>
        </form>

        {/* Note about pull */}
        <div className="flex items-start gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{t('profiles.remote.pullUnsupported')}</p>
        </div>
    </div>
  );
}
