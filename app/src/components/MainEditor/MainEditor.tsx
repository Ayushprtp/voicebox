import { Plus, Sparkles, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FloatingGenerateBox } from '@/components/Generation/FloatingGenerateBox';
import { HistoryTable } from '@/components/History/HistoryTable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ProfileList } from '@/components/VoiceProfiles/ProfileList';

import { useImportProfile } from '@/lib/hooks/useProfiles';
import { cn } from '@/lib/utils/cn';
import { usePlayerStore } from '@/stores/playerStore';
import { useUIStore } from '@/stores/uiStore';

type MobilePane = 'profiles' | 'history';

export function MainEditor() {
  const { t } = useTranslation();
  const audioUrl = usePlayerStore((state) => state.audioUrl);
  const isPlayerVisible = !!audioUrl;
  const scrollRef = useRef<HTMLDivElement>(null);
  const setDialogOpen = useUIStore((state) => state.setProfileDialogOpen);
  const importProfile = useImportProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>('profiles');
  const { toast } = useToast();

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.voicebox.zip')) {
        toast({
          title: t('main.import.invalidTitle'),
          description: t('main.import.invalidDescription'),
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
      setImportDialogOpen(true);
    }
  };

  const handleImportConfirm = () => {
    if (selectedFile) {
      importProfile.mutate(selectedFile, {
        onSuccess: () => {
          setImportDialogOpen(false);
          setSelectedFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          toast({
            title: t('main.import.successTitle'),
            description: t('main.import.successDescription'),
          });
        },
        onError: (error) => {
          toast({
            title: t('main.import.failedTitle'),
            description: error.message,
            variant: 'destructive',
          });
        },
      });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden relative">
      {/* Desktop header — hidden on mobile (mobile uses the top tab switcher + FAB below) */}
      <div className="hidden sm:flex items-center justify-between gap-2 mb-4 px-1 shrink-0">
        <h2 className="text-2xl font-bold">Voicebox</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleImportClick}>
            <Upload className="mr-2 h-4 w-4" />
            {t('main.importVoice')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".voicebox.zip"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button onClick={() => setDialogOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('main.createVoice')}
          </Button>
        </div>
      </div>

      {/* Mobile-only sub-header: pane switcher + actions */}
      <div className="flex sm:hidden items-center gap-2 mb-3 shrink-0">
        <div className="flex-1 grid grid-cols-2 gap-1 p-1 bg-muted rounded-full">
          <button
            type="button"
            onClick={() => setMobilePane('profiles')}
            className={cn(
              'h-8 rounded-full text-sm font-medium transition-colors touch-manipulation',
              mobilePane === 'profiles' ? 'bg-background shadow' : 'text-muted-foreground',
            )}
          >
            {t('main.pane.profiles')}
          </button>
          <button
            type="button"
            onClick={() => setMobilePane('history')}
            className={cn(
              'h-8 rounded-full text-sm font-medium transition-colors touch-manipulation',
              mobilePane === 'history' ? 'bg-background shadow' : 'text-muted-foreground',
            )}
          >
            {t('main.pane.history')}
          </button>
        </div>
        <Button
          size="icon"
          className="h-9 w-9 rounded-full shrink-0"
          onClick={() => setDialogOpen(true)}
          aria-label={t('main.createVoice')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile panes (one shown at a time) */}
      <div className="flex-1 min-h-0 overflow-hidden sm:hidden">
        {mobilePane === 'profiles' ? (
          <div className="h-full overflow-y-auto pb-64">
            <ProfileList />
          </div>
        ) : (
          <div className="h-full">
            <HistoryTable />
          </div>
        )}
      </div>

      {/* Desktop 2-col layout */}
      <div className="hidden sm:grid grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden relative">
        <div className="flex flex-col min-h-0 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent z-0 pointer-events-none" />
          <div
            ref={scrollRef}
            className={cn('flex-1 min-h-0 overflow-y-auto pt-2 pb-4', isPlayerVisible && 'lg:pb-32')}
          >
            <div className="flex flex-col gap-6">
              <div className="shrink-0 flex flex-col">
                <ProfileList />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col min-h-0 overflow-hidden">
          <HistoryTable />
        </div>
      </div>

      <FloatingGenerateBox isPlayerOpen={!!audioUrl} />

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('main.import.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('main.import.dialogDescription', { name: selectedFile?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={importProfile.isPending || !selectedFile}
            >
              {importProfile.isPending ? t('main.import.importing') : t('main.import.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
