import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { BookOpen, Code, FileText } from 'lucide-react';

interface EmptyStateProps {
  onSelectPrompt: (promptText: string) => void;
}

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const firstName = user?.name ? user.name.split(' ')[0] : null;
  const suggestions = [
    { icon: BookOpen, title: t('starter1Title'), description: t('starter1Desc') },
    { icon: Code, title: t('starter3Title'), description: t('starter3Desc') },
    { icon: FileText, title: t('starter4Title'), description: t('starter4Desc') },
  ];

  return (
    <section className="bayan-empty-state mx-auto my-auto w-full max-w-3xl px-4 py-8 text-center" aria-labelledby="empty-state-title">
      <div className="bayan-empty-mark mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl" aria-hidden="true">
        <span className="font-heading text-2xl font-semibold">ب</span>
      </div>
      <h1 id="empty-state-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
        {firstName ? t('greetingTitleNamed', { name: firstName }) : t('greetingTitle')}
      </h1>
      <p className="bayan-empty-description mx-auto mt-2 max-w-lg text-sm leading-7">
        {t('emptyStateDescription')}
      </p>
      <div className="bayan-empty-suggestions mx-auto mt-7 grid w-full max-w-3xl grid-cols-1 gap-2.5 text-start sm:grid-cols-3">
        {suggestions.map(({ icon: Icon, title, description }) => (
          <button
            key={title}
            type="button"
            onClick={() => onSelectPrompt(`${title}: ${description}`)}
            className="bayan-empty-suggestion flex min-h-24 items-start gap-3 rounded-xl border p-3.5 text-start transition-colors"
          >
            <span className="bayan-empty-suggestion-icon mt-0.5 shrink-0"><Icon size={16} strokeWidth={1.8} /></span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold leading-5">{title}</span>
              <span className="bayan-empty-suggestion-description mt-1 line-clamp-2 block text-[11px] leading-5">{description}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
