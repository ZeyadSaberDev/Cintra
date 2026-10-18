import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

type AlertTone = 'error' | 'info';
type AlertMessage = { message: string; tone: AlertTone; language: 'ar' | 'en' } | null;

const AlertContext = createContext<(message: string, tone?: AlertTone, language?: 'ar' | 'en') => void>(() => undefined);

export function useBayanAlert() {
  return useContext(AlertContext);
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertMessage>(null);
  const showAlert = useCallback((message: string, tone: AlertTone = 'error', language: 'ar' | 'en' = 'en') => {
    setAlert({ message, tone, language });
  }, []);
  const dismiss = useCallback(() => setAlert(null), []);

  useEffect(() => {
    if (!alert) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alert, dismiss]);

  return (
    <AlertContext.Provider value={showAlert}>
      {children}
      {alert && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/35 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bayan-alert-title"
            aria-describedby="bayan-alert-message"
            dir="auto"
            className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-3xl border border-neutral-200/80 bg-white p-5 text-start shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
          >
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${alert.tone === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                {alert.tone === 'error' ? <AlertTriangle size={19} /> : <Info size={19} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="bayan-alert-title" className="pt-1 text-sm font-semibold text-neutral-900">
                  {alert.language === 'ar'
                    ? alert.tone === 'error' ? 'تعذر إكمال العملية' : 'تنبيه'
                    : alert.tone === 'error' ? 'Something went wrong' : 'Notice'}
                </h2>
                <p id="bayan-alert-message" className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-600">
                  {alert.message}
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label={alert.language === 'ar' ? 'إغلاق' : 'Close'}
                className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                autoFocus
                onClick={dismiss}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                {alert.language === 'ar' ? 'حسنًا' : 'OK'}
              </button>
            </div>
          </section>
        </div>
      )}
    </AlertContext.Provider>
  );
}
