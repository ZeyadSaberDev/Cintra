import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';

interface GuestBannerProps {
  onSignUp: () => void;
}

export function GuestBanner({ onSignUp }: GuestBannerProps) {
  const { user } = useAuth();
  const { t, isRtl } = useLanguage();

  if (!user || !user.isGuest) return null;

  return (
    <div className="w-full bg-neutral-100/90 border-b border-[#e5e5e5] px-4 py-2 flex items-center justify-between text-xs text-neutral-800 transition-all select-none">
      <div className="flex items-center gap-2 truncate">
        <Sparkles size={14} className="text-neutral-900 shrink-0" />
        <span className="truncate">{t('guestBannerText')}</span>
      </div>

      <button
        type="button"
        onClick={onSignUp}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-neutral-900 text-white rounded-lg text-xs font-medium hover:bg-neutral-800 transition-colors shadow-2xs ml-3 rtl:ml-0 rtl:mr-3 cursor-pointer"
      >
        <span>{t('guestBannerCta')}</span>
        {isRtl ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
      </button>
    </div>
  );
}
