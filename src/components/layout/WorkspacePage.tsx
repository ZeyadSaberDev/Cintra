import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  FileText,
  LoaderCircle,
  Palette,
  RefreshCw,
  Server,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { normalizePublicModelCatalog, type GroupableModel } from '../../lib/modelGrouping';
import { CHAT_ATTACHMENT_FORMATS } from '../../../lib/chat/supportedAttachments';

export type WorkspaceSection = 'stability' | 'documents' | 'models' | 'design';

interface WorkspacePageProps {
  section: WorkspaceSection;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  onBackToChat: () => void;
  onOpenSettings: () => void;
  onStartChat: () => void;
}

interface HealthStatus {
  state: 'loading' | 'ready' | 'error';
  name?: string;
  error?: string;
}

const sectionIcons = {
  stability: Server,
  documents: FileText,
  models: Sparkles,
  design: Palette,
} satisfies Record<WorkspaceSection, React.ComponentType<{ size?: number; className?: string }>>;

export function WorkspacePage({
  section,
  selectedModel,
  onSelectModel,
  onBackToChat,
  onOpenSettings,
  onStartChat,
}: WorkspacePageProps) {
  const { currentLang } = useLanguage();
  const reduceMotion = useReducedMotion();
  const isArabic = currentLang === 'ar';
  const [health, setHealth] = useState<HealthStatus>({ state: 'loading' });
  const [models, setModels] = useState<GroupableModel[]>([]);
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const title = {
    stability: isArabic ? 'الاستقرار والتحقق' : 'Stability & verification',
    documents: isArabic ? 'دعم المستندات' : 'Office document support',
    models: isArabic ? 'قدرات النماذج' : 'AI model capabilities',
    design: isArabic ? 'التجربة والتصميم' : 'Experience & visual design',
  }[section];
  const description = {
    stability: isArabic ? 'تحقق من وصول الواجهة إلى خدمة Cintra الحالية.' : 'Check whether this workspace can reach the Cintra API.',
    documents: isArabic ? 'اعرف أنواع الملفات التي يمكن إرفاقها حالياً.' : 'Review the file formats currently accepted by chat.',
    models: isArabic ? 'النماذج المتاحة مصدرها إعدادات لوحة التحكم.' : 'Available models come from the dashboard configuration.',
    design: isArabic ? 'عدّل المظهر وإعدادات الواجهة من الإعدادات الفعلية.' : 'Adjust the actual theme and interface preferences.',
  }[section];
  const SectionIcon = sectionIcons[section];

  useEffect(() => {
    const controller = new AbortController();
    setHealth({ state: 'loading' });
    fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(isArabic
          ? `فشل فحص الخدمة (HTTP ${response.status}).`
          : `Health check failed (HTTP ${response.status}).`);
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || (data as { status?: unknown }).status !== 'ok') {
          throw new Error(isArabic ? 'استجابة فحص الصحة غير صالحة.' : 'The health response was invalid.');
        }
        setHealth({ state: 'ready', name: typeof (data as { name?: unknown }).name === 'string' ? (data as { name: string }).name : 'Cintra' });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Workspace health check failed:', cause);
        setHealth({
          state: 'error',
          error: cause instanceof Error && cause.message !== 'Failed to fetch'
            ? cause.message
            : isArabic ? 'تعذر الاتصال بخدمة Cintra.' : 'Could not reach the Cintra API.',
        });
      });
    return () => controller.abort();
  }, [retry, isArabic]);

  useEffect(() => {
    const controller = new AbortController();
    setModelState('loading');
    fetch('/api/models', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Model catalog request failed (${response.status}).`);
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !Array.isArray((data as { models?: unknown }).models)) {
          throw new Error('The model catalog response was invalid.');
        }
        setModels(normalizePublicModelCatalog((data as { models: unknown }).models));
        setModelState('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Workspace model catalog failed:', cause);
        setModelState('error');
      });
    return () => controller.abort();
  }, [retry]);

  const labels = {
    loading: isArabic ? 'جارٍ التحقق…' : 'Checking…',
    retry: isArabic ? 'إعادة المحاولة' : 'Retry',
    openChat: isArabic ? 'العودة إلى المحادثة' : 'Return to chat',
    configuredModels: isArabic ? 'النماذج المهيأة' : 'Configured models',
    unknownCapabilities: isArabic ? 'لم تُعلن إعدادات النموذج هذه القدرات.' : 'The model configuration does not declare these capabilities.',
    vision: isArabic ? 'إدخال الصور' : 'Image input',
    tools: isArabic ? 'استدعاء الأدوات' : 'Tool calling',
    structured: isArabic ? 'المخرجات المنظمة' : 'Structured output',
    available: isArabic ? 'معلن' : 'Declared',
    unavailable: isArabic ? 'غير معلن' : 'Not declared',
    supported: isArabic ? 'مدعوم حالياً' : 'Currently supported',
    unsupported: isArabic ? 'غير مدعوم حالياً' : 'Not currently supported',
  };

  return (
    <motion.section
      key={section}
      dir={isArabic ? 'rtl' : 'ltr'}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bayan-bg)] px-4 py-5 text-[var(--bayan-text)] sm:px-8 sm:py-8"
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--bayan-border)] bg-[var(--bayan-surface)] text-[var(--bayan-accent)]">
              <SectionIcon size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
              <p className="mt-1 text-sm leading-6 text-[var(--bayan-muted)]">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--bayan-border)] bg-[var(--bayan-surface)] px-3 text-sm font-medium transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bayan-accent)] dark:hover:bg-white/[0.06]"
          >
            <ArrowLeft size={16} className={isArabic ? 'rotate-180' : undefined} aria-hidden="true" />
            {labels.openChat}
          </button>
        </div>

        {section === 'stability' && (
          <div className="rounded-2xl border border-[var(--bayan-border)] bg-[var(--bayan-surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{isArabic ? 'اتصال الواجهة بالخادم' : 'Frontend-to-server connection'}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--bayan-muted)]">
                  {isArabic ? 'هذا الفحص يطلب نقطة الصحة الفعلية، ولا يمثل تشغيل الاختبارات البرمجية.' : 'This checks the live health endpoint; it does not run the project test suite.'}
                </p>
              </div>
              <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={health.state === 'loading'} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--bayan-border)] px-3 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-white/[0.06]">
                <RefreshCw size={14} aria-hidden="true" />
                {labels.retry}
              </button>
            </div>
            <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-[var(--bayan-border)] px-3 py-3 text-sm" role={health.state === 'error' ? 'alert' : 'status'} aria-live="polite">
              {health.state === 'loading'
                ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />{labels.loading}</>
                : health.state === 'ready'
                  ? <><Check size={16} className="text-emerald-600" aria-hidden="true" />{isArabic ? `الخدمة متاحة: ${health.name}` : `API reachable: ${health.name}`}</>
                  : <><CircleAlert size={16} className="text-rose-600" aria-hidden="true" />{health.error}</>}
            </div>
          </div>
        )}

        {section === 'documents' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--bayan-border)] bg-[var(--bayan-surface)] p-4 sm:p-6">
              <h2 className="font-semibold">{isArabic ? 'المرفقات المقبولة في الدردشة' : 'File types accepted in chat'}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--bayan-muted)]">{isArabic ? 'يستخرج Cintra النص من هذه الملفات عند الإرفاق بالمحادثة؛ تُطبّق حدود الرفع الحالية.' : 'Cintra extracts text from these files when attached to chat; existing upload limits apply.'}</p>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={labels.supported}>
                {CHAT_ATTACHMENT_FORMATS.map(({ label }) => (
                  <li key={label} className="rounded-lg border border-[var(--bayan-border)] bg-[var(--bayan-bg)] px-2.5 py-1.5 text-xs font-medium">{label}</li>
                ))}
              </ul>
              <div className="mt-5 border-t border-[var(--bayan-border)] pt-4">
                <h3 className="text-sm font-medium">{isArabic ? 'غير مدعوم حالياً' : 'Not currently supported'}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--bayan-muted)]">{isArabic ? 'صيغ Office القديمة DOC وXLS وPPT، والمستندات المشفرة، غير مدعومة حالياً.' : 'Legacy DOC, XLS, and PPT files and encrypted documents are not currently supported.'}</p>
              </div>
            </div>
            <button type="button" onClick={onStartChat} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--bayan-accent)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bayan-accent)] focus-visible:ring-offset-2">
              <FileText size={16} aria-hidden="true" />
              {isArabic ? 'ابدأ محادثة لإرفاق ملف مدعوم' : 'Start a chat to attach a supported file'}
            </button>
          </div>
        )}

        {section === 'models' && (
          <div className="rounded-2xl border border-[var(--bayan-border)] bg-[var(--bayan-surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{labels.configuredModels}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--bayan-muted)]">{isArabic ? 'كل النماذج تستخدم عارض Cintra المشترك. تختلف قدرات النموذج فقط عندما تعلنها الإعدادات.' : 'All models use Cintra’s shared renderer. Model capabilities are shown only when explicitly declared in configuration.'}</p>
              </div>
              <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={modelState === 'loading'} title={labels.retry} aria-label={labels.retry} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--bayan-border)] transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-white/[0.06]">
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            </div>
            {modelState === 'loading' ? (
              <p className="mt-5 flex items-center gap-2 text-sm text-[var(--bayan-muted)]" role="status"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />{labels.loading}</p>
            ) : modelState === 'error' ? (
              <p className="mt-5 text-sm text-rose-700 dark:text-rose-300" role="alert">{isArabic ? 'تعذر تحميل قائمة النماذج المهيأة.' : 'Could not load configured models.'}</p>
            ) : models.length === 0 ? (
              <p className="mt-5 text-sm text-[var(--bayan-muted)]" role="status">{isArabic ? 'لا توجد نماذج عامة مهيأة حالياً.' : 'No public models are currently configured.'}</p>
            ) : (
              <motion.ul
                className="mt-4 divide-y divide-[var(--bayan-border)]"
                aria-label={labels.configuredModels}
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.035 } } }}
              >
                {models.map((model) => {
                  const chosen = model.id === selectedModel;
                  const capabilityRows = [
                    [labels.vision, model.capabilities?.visionInput],
                    [labels.tools, model.capabilities?.toolCalling],
                    [labels.structured, model.capabilities?.structuredOutput],
                  ] as const;
                  const hasCapabilityData = Boolean(model.capabilities && Object.keys(model.capabilities).length);
                  return (
                    <motion.li
                      key={model.id}
                      variants={{
                        hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 5 },
                        visible: { opacity: 1, y: 0 },
                      }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.18 }}
                      className="py-4 first:pt-1 last:pb-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{model.name}</p>
                          <p className="mt-0.5 truncate text-xs text-[var(--bayan-muted)]">{model.provider} · {model.id}</p>
                        </div>
                        <button type="button" aria-pressed={chosen} onClick={() => onSelectModel(model.id)} className={`min-h-9 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bayan-accent)] ${chosen ? 'border-[var(--bayan-accent)] bg-[var(--bayan-accent)]/10 text-[var(--bayan-accent)]' : 'border-[var(--bayan-border)] hover:bg-neutral-100 dark:hover:bg-white/[0.06]'}`}>
                          {chosen ? (isArabic ? 'المحدد' : 'Selected') : (isArabic ? 'استخدم هذا النموذج' : 'Use model')}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2" aria-label={hasCapabilityData ? undefined : labels.unknownCapabilities}>
                        {hasCapabilityData ? capabilityRows.filter(([, value]) => value !== undefined).map(([name, value]) => (
                          <span key={name} className="rounded-lg border border-[var(--bayan-border)] px-2 py-1 text-[11px] text-[var(--bayan-muted)]">
                            {name}: {value ? labels.available : labels.unavailable}
                          </span>
                        )) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--bayan-muted)]">
                            <WandSparkles size={13} aria-hidden="true" />
                            {labels.unknownCapabilities}
                          </span>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </div>
        )}

        {section === 'design' && (
          <div className="rounded-2xl border border-[var(--bayan-border)] bg-[var(--bayan-surface)] p-4 sm:p-6">
            <h2 className="font-semibold">{isArabic ? 'المظهر وإمكانية الوصول' : 'Appearance & accessibility'}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--bayan-muted)]">
              {isArabic
                ? 'تتضمن Cintra إعدادات المظهر الفاتح والداكن والتلقائي، وتراعي تفضيل تقليل الحركة. افتح الإعدادات لتغيير تفضيلاتك الفعلية.'
                : 'Cintra supports light, dark, and automatic themes and respects reduced-motion preferences. Open settings to change your actual preferences.'}
            </p>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {[
                isArabic ? 'المظهر: فاتح أو داكن أو تلقائي' : 'Theme: light, dark, or automatic',
                isArabic ? 'الحركة: احترام تفضيل تقليل الحركة' : 'Motion: honors reduced-motion preference',
                isArabic ? 'التنقل: عناصر قابلة للوحة المفاتيح' : 'Navigation: keyboard-operable controls',
                isArabic ? 'القراءة: حالات وتحكمات ذات تسميات واضحة' : 'Reading: labeled controls and status states',
              ].map((item) => <li key={item} className="rounded-xl border border-[var(--bayan-border)] px-3 py-2.5">{item}</li>)}
            </ul>
            <button type="button" onClick={onOpenSettings} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--bayan-border)] px-4 text-sm font-medium transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bayan-accent)] dark:hover:bg-white/[0.06]">
              <Palette size={16} aria-hidden="true" />
              {isArabic ? 'فتح إعدادات المظهر' : 'Open appearance settings'}
            </button>
          </div>
        )}
      </div>
    </motion.section>
  );
}
