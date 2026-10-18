import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function InstallAppPrompt() {
  const { currentLang } = useLanguage();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIos) setShowIosInstructions(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setShowIosInstructions(false);
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setShowIosInstructions((visible) => !visible);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (dismissed || (!installPrompt && !showIosInstructions)) return null;

  const isArabic = currentLang === 'ar';
  return (
    <aside className="bayan-install-prompt" aria-label={isArabic ? 'تثبيت تطبيق Cintra' : 'Install Cintra'}>
      <img src="/cintra-mark.png" alt="" aria-hidden="true" />
      <div>
        <p>{isArabic ? 'ثبّت Cintra على هاتفك' : 'Install Cintra on your phone'}</p>
        <span>
          {showIosInstructions
            ? (isArabic ? 'اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية».' : 'Tap Share, then Add to Home Screen.')
            : (isArabic ? 'افتح Cintra كتطبيق من شاشتك الرئيسية.' : 'Open Cintra like an app from your home screen.')}
        </span>
      </div>
      {installPrompt && (
        <button type="button" className="bayan-install-action" onClick={() => void install()}>
          <Download size={15} aria-hidden="true" />
          {isArabic ? 'تثبيت' : 'Install'}
        </button>
      )}
      <button
        type="button"
        className="bayan-install-dismiss"
        onClick={() => setDismissed(true)}
        aria-label={isArabic ? 'إغلاق' : 'Dismiss'}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
