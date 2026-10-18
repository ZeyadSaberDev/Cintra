import React, { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, FileText, Globe2, PenLine, Search, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export type HomeTaskMode = 'write' | 'search';

interface HomeTaskDialogProps {
  mode: HomeTaskMode;
  onClose: () => void;
  onSubmit: (request: string, webSearchConsent?: boolean) => void;
}

export function HomeTaskDialog({ mode, onClose, onSubmit }: HomeTaskDialogProps) {
  const { currentLang } = useLanguage();
  const isArabic = currentLang === 'ar';
  const [task, setTask] = useState<'write' | 'edit' | 'proofread' | 'summarize' | 'translate'>('write');
  const [request, setRequest] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [searchConfirmationOpen, setSearchConfirmationOpen] = useState(false);
  const isSearch = mode === 'search';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = request.trim();
    if (!value) return;
    if (isSearch) {
      setSearchConfirmationOpen(true);
      return;
    }
    const taskInstructions = {
      write: isArabic ? 'اكتب محتوى جديداً' : 'Write new content',
      edit: isArabic ? 'حرّر النص مع الحفاظ على معناه' : 'Edit the text while preserving its meaning',
      proofread: isArabic ? 'راجع النص لغوياً وصحح الأخطاء' : 'Proofread and correct the text',
      summarize: isArabic ? 'لخّص النص مع إبقاء أهم النقاط' : 'Summarize the text and retain its key points',
      translate: isArabic ? 'ترجم النص ترجمة طبيعية ودقيقة' : 'Translate the text naturally and accurately',
    }[task];
    const details = [
      `${taskInstructions}${isArabic ? '،' : ','}`,
      audience.trim() ? `${isArabic ? 'الجمهور المستهدف' : 'Target audience'}: ${audience.trim()}` : '',
      tone.trim() ? `${isArabic ? 'النبرة والأسلوب' : 'Tone and style'}: ${tone.trim()}` : '',
      `${isArabic ? 'المطلوب' : 'Request'}:\n${value}`,
    ].filter(Boolean).join('\n\n');
    onSubmit(details);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-neutral-950/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="home-task-title" dir={isArabic ? 'rtl' : 'ltr'} className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-neutral-100 bg-gradient-to-br from-neutral-50 to-white px-5 py-4 sm:px-6">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isSearch ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
            {isSearch ? <Globe2 size={19} /> : <PenLine size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="home-task-title" className="text-base font-semibold text-neutral-900">
              {isSearch ? (isArabic ? 'مساحة البحث على الويب' : 'Web research workspace') : (isArabic ? 'مساحة الكتابة والتحرير' : 'Writing and editing workspace')}
            </h2>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              {isSearch
                ? (isArabic ? 'اكتب سؤالك، ثم أكّد قبل بدء البحث واستهلاك الكريدت.' : 'Enter a question, then confirm before searching and using credits.')
                : (isArabic ? 'حدد نوع المهمة، ثم اكتب المحتوى أو التعليمات التي تريدها.' : 'Choose a task, then describe what you want written or changed.')}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={isArabic ? 'إغلاق' : 'Close'} className="rounded-xl p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800">
            <X size={17} />
          </button>
        </header>

        <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
          {isSearch ? (
            searchConfirmationOpen ? (
              <p role="alert" className="rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                {isArabic
                  ? 'يتطلب هذا السؤال البحث في الويب لجلب معلومات محدثة. هل تريد تفعيل البحث؟ (ملاحظة: هذا الإجراء سيستهلك من الكريدت الخاص بك).'
                  : 'This question needs a web search for current information. Search now? Note: this will use your search credits.'}
              </p>
            ) : (
              <label className="block text-xs font-semibold text-neutral-700">
                {isArabic ? 'ما الذي تريد البحث عنه؟' : 'What would you like to find?'}
                <textarea autoFocus required minLength={3} maxLength={20000} rows={5} value={request} onChange={(event) => setRequest(event.target.value)} placeholder={isArabic ? 'اكتب سؤالك أو الموضوع بالتفصيل…' : 'Enter a question or topic…'} className="mt-2 w-full resize-y rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100" />
              </label>
            )
          ) : (
            <>
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-neutral-700">{isArabic ? 'نوع المهمة' : 'Task type'}</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {([
                    ['write', isArabic ? 'كتابة' : 'Write'],
                    ['edit', isArabic ? 'تحرير' : 'Edit'],
                    ['proofread', isArabic ? 'تدقيق' : 'Proofread'],
                    ['summarize', isArabic ? 'تلخيص' : 'Summarize'],
                    ['translate', isArabic ? 'ترجمة' : 'Translate'],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={task === value} onClick={() => setTask(value)} className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${task === value ? 'border-sky-300 bg-sky-50 text-sky-800 ring-2 ring-sky-100' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-neutral-700">
                  {isArabic ? 'الجمهور المستهدف (اختياري)' : 'Audience (optional)'}
                  <input value={audience} maxLength={160} onChange={(event) => setAudience(event.target.value)} placeholder={isArabic ? 'مثال: عملاء جدد' : 'e.g. new customers'} className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs font-normal outline-none focus:border-sky-400 focus:bg-white" />
                </label>
                <label className="text-xs font-semibold text-neutral-700">
                  {isArabic ? 'النبرة والأسلوب (اختياري)' : 'Tone and style (optional)'}
                  <input value={tone} maxLength={160} onChange={(event) => setTone(event.target.value)} placeholder={isArabic ? 'مثال: رسمي ومختصر' : 'e.g. friendly and concise'} className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs font-normal outline-none focus:border-sky-400 focus:bg-white" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-neutral-700">
                {task === 'write' ? (isArabic ? 'صف ما تريد كتابته' : 'Describe what to write') : (isArabic ? 'أدخل النص أو التعليمات' : 'Add your text or instructions')}
                <textarea autoFocus required minLength={3} maxLength={20000} rows={5} value={request} onChange={(event) => setRequest(event.target.value)} placeholder={isArabic ? 'اكتب الفكرة أو ألصق النص الذي تريد العمل عليه…' : 'Describe your idea or paste the text you want to work on…'} className="mt-2 w-full resize-y rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100" />
              </label>
            </>
          )}
          <footer className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
            {isSearch && searchConfirmationOpen ? (
              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => onSubmit(request.trim(), false)} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50">
                  {isArabic ? 'لا، أجب دون بحث' : 'No, answer without search'}
                </button>
                <button type="button" onClick={() => onSubmit(request.trim(), true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700">
                  {isArabic ? 'نعم، ابحث في الويب' : 'Yes, search the web'}
                </button>
              </div>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400">
                  {isSearch ? <Search size={13} /> : <FileText size={13} />}
                  {isSearch ? (isArabic ? 'سيُستخدم Cintra Research' : 'Uses Cintra Research') : (isArabic ? 'يمكنك طلب PDF في التعليمات' : 'You can request a PDF in your instructions')}
                </span>
                <button type="submit" disabled={request.trim().length < 3} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${isSearch ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700'}`}>
                  {isArabic ? 'متابعة' : 'Continue'}
                  {isArabic ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                </button>
              </>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}
