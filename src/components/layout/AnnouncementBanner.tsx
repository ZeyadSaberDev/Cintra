import { useCallback, useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

type Announcement = {
  id: string;
  message: string;
  expiresAt: string;
};

export function AnnouncementBanner() {
  const { currentLang } = useLanguage();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const refreshAnnouncement = useCallback(async () => {
    try {
      const response = await fetch('/api/announcements/active', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Announcement request failed with status ${response.status}.`);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('announcement' in result)) {
        throw new Error('Announcement response has an invalid shape.');
      }
      const active = result.announcement;
      if (active === null) {
        setAnnouncement(null);
      } else if (
        active
        && typeof active === 'object'
        && 'id' in active
        && typeof active.id === 'string'
        && 'message' in active
        && typeof active.message === 'string'
        && 'expiresAt' in active
        && typeof active.expiresAt === 'string'
      ) {
        setAnnouncement({ id: active.id, message: active.message, expiresAt: active.expiresAt });
      } else {
        throw new Error('Announcement response has an invalid shape.');
      }
    } catch (error) {
      console.error('Could not load the current announcement:', error);
    }
  }, []);

  useEffect(() => {
    void refreshAnnouncement();
    const interval = window.setInterval(() => void refreshAnnouncement(), 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshAnnouncement();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshAnnouncement]);

  useEffect(() => {
    if (!announcement) return;
    const expiresAt = new Date(announcement.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      console.error('The current announcement has an invalid expiration date.');
      setAnnouncement(null);
      return;
    }
    const expiryTimer = window.setTimeout(() => setAnnouncement(null), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(expiryTimer);
  }, [announcement]);

  if (!announcement || new Date(announcement.expiresAt).getTime() <= Date.now() || dismissedId === announcement.id) {
    return null;
  }

  return (
    <aside className="bayan-announcement" role="status" aria-live="polite">
      <Info size={18} aria-hidden="true" />
      <p>{announcement.message}</p>
      <button
        type="button"
        onClick={() => setDismissedId(announcement.id)}
        aria-label={currentLang === 'ar' ? 'إغلاق الإشعار' : 'Dismiss announcement'}
      >
        <X size={17} aria-hidden="true" />
      </button>
    </aside>
  );
}
