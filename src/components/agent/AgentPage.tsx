import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, Play, Search, XCircle, Bot, Clock3, Square, RotateCcw, Download, Copy, ShieldCheck, ListChecks } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { groupModelsByFamily } from '../../lib/modelGrouping';
import { isCintraModelId } from '../../../lib/ai/cintraModels';
import { AgentWorkflowCanvas } from './AgentWorkflowCanvas';

interface AgentStep {
  title: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
}

interface AgentTask {
  id: string;
  goal: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  modelId?: string;
  steps: AgentStep[];
  result?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AgentAction {
  id: string;
  tool: string;
  input: string;
  output: string | null;
  timestamp: string;
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Request failed (${response.status}).`);
  return data;
}

export function AgentPage({ onBack }: { onBack: () => void }) {
  const { currentLang } = useLanguage();
  const [activeView, setActiveView] = useState<'workflow' | 'research'>('workflow');
  const [goal, setGoal] = useState('');
  const [activeId, setActiveId] = useState('');
  const [task, setTask] = useState<AgentTask | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [history, setHistory] = useState<Array<Pick<AgentTask, 'id' | 'goal' | 'status' | 'createdAt'>>>([]);
  const [models, setModels] = useState<Array<{ id: string; name: string; group?: string }>>([]);
  const [modelId, setModelId] = useState<string>(() => {
    const savedModel = localStorage.getItem('bayan_selected_model');
    return savedModel && isCintraModelId(savedModel) ? savedModel : 'cintra-core-v1';
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = async () => {
    try {
      const data = await readJson(await fetch('/api/agent/history'));
      const agents = data.agents || [];
      setHistory(agents);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load agent history.');
    }
  };

  useEffect(() => { void loadHistory(); }, []);
  useEffect(() => {
    if (!activeId) {
      const backgroundTask = history.find((item) => ['queued', 'running'].includes(item.status));
      if (backgroundTask) setActiveId(backgroundTask.id);
    }
  }, [history, activeId]);

  useEffect(() => {
    let disposed = false;
    void fetch('/api/models')
      .then(readJson)
      .then((data) => {
        if (disposed || !Array.isArray(data.models)) return;
        setModels(data.models);
        const savedModel = localStorage.getItem('bayan_selected_model');
        const defaultModel = typeof data.defaultModel === 'string' ? data.defaultModel : '';
        if (savedModel && data.models.some((model: { id: string }) => model.id === savedModel)) setModelId(savedModel);
        else if (defaultModel) setModelId(defaultModel);
      })
      .catch((cause) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Could not load AI models.');
      });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let disposed = false;
    let timer: number | undefined;
    let afterTimestamp: string | undefined;
    let afterActionId: string | undefined;
    let refreshInFlight = false;
    setActions([]);
    const refresh = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const cursorParams = new URLSearchParams();
        if (afterTimestamp) cursorParams.set('after', afterTimestamp);
        if (afterActionId) cursorParams.set('afterId', afterActionId);
        const afterQuery = cursorParams.size ? `?${cursorParams.toString()}` : '';
        const data = await readJson(await fetch(`/api/agent/${encodeURIComponent(activeId)}/progress${afterQuery}`));
        if (disposed) return;
        setTask(data.agent);
        const newActions = (data.actions || []) as AgentAction[];
        setActions((current) => {
          const byId = new Map(current.map((action) => [action.id, action]));
          newActions.forEach((action) => byId.set(action.id, action));
          return [...byId.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
        });
        const lastAction = newActions[newActions.length - 1];
        if (lastAction) {
          afterTimestamp = lastAction.timestamp;
          afterActionId = lastAction.id;
        }
        if (['completed', 'failed', 'cancelled'].includes(data.agent.status)) {
          if (timer) window.clearInterval(timer);
          void loadHistory();
        }
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Could not load agent progress.');
      } finally {
        refreshInFlight = false;
      }
    };
    timer = window.setInterval(() => void refresh(), 2500);
    void refresh();
    return () => { disposed = true; window.clearInterval(timer); };
  }, [activeId]);

  const queueTask = async (taskGoal: string) => {
    if (busy || taskGoal.trim().length < 5) return;
    setBusy(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: taskGoal.trim(), modelId }),
      }));
      setGoal('');
      setTask(data.agent);
      setActions([]);
      setActiveId(data.agent.id);
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the agent task.');
    } finally {
      setBusy(false);
    }
  };

  const startTask = async (event: FormEvent) => {
    event.preventDefault();
    await queueTask(goal);
  };

  const cancelTask = async () => {
    if (!task || !['queued', 'running'].includes(task.status)) return;
    setBusy(true);
    setError('');
    try {
      await readJson(await fetch(`/api/agent/${encodeURIComponent(task.id)}/cancel`, { method: 'POST' }));
      await loadHistory();
      const data = await readJson(await fetch(`/api/agent/${encodeURIComponent(task.id)}/progress`));
      setTask(data.agent);
      setActions(data.actions || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not stop the agent task.');
    } finally {
      setBusy(false);
    }
  };

  const text = currentLang === 'ar';
  const stepLabels = text
    ? ['جمع المصادر العامة والتحقق منها', 'استخراج المعلومات ذات الصلة', 'تحليل المصادر ومقارنة الأدلة', 'إعداد التقرير النهائي مع الاستشهادات']
    : ['Collect and verify public sources', 'Extract relevant evidence', 'Analyze sources and compare evidence', 'Prepare the final report with citations'];
  const completedSteps = task?.steps.filter((step) => step.status === 'done').length || 0;
  const progress = task?.status === 'completed' ? 100 : task?.steps.length ? Math.round((completedSteps / task.steps.length) * 100) : 0;
  const running = Boolean(task && ['queued', 'running'].includes(task.status));

  const downloadResult = () => {
    if (!task?.result) return;
    const blobUrl = URL.createObjectURL(new Blob([`# Cintra Research Report\n\n${task.result}\n`], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `cintra-research-${task.id.slice(0, 8)}.md`;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  };

  const copyResult = async () => {
    if (!task?.result) return;
    try {
      await navigator.clipboard.writeText(task.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not copy the report.');
    }
  };

  return (
    <div className="bayan-agent-page flex h-screen flex-col overflow-hidden text-neutral-900">
      <header className="bayan-agent-header z-20 flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-8">
        <button type="button" onClick={onBack} className="bayan-agent-quiet inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors">
          <ArrowLeft size={15} /> {text ? 'العودة إلى المحادثة' : 'Back to chat'}
        </button>
        <div className="bayan-agent-view-tabs flex items-center gap-1 rounded-xl border p-1">
          <button type="button" onClick={() => setActiveView('workflow')} className={`rounded-lg px-3 py-1.5 text-[11px] ${activeView === 'workflow' ? 'is-active' : ''}`}>{text ? 'سير العمل' : 'Workflow'}</button>
          <button type="button" onClick={() => setActiveView('research')} className={`rounded-lg px-3 py-1.5 text-[11px] ${activeView === 'research' ? 'is-active' : ''}`}>{text ? 'مهام البحث' : 'Research tasks'}</button>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span className="bayan-agent-live hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] sm:inline-flex">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-emerald-500' : 'bg-neutral-400'}`} />
            {running ? (text ? 'يعمل في الخلفية' : 'Background worker active') : (text ? 'مساحة الوكيل' : 'Agent workspace')}
          </span>
          <h1 className="text-sm font-semibold">{text ? 'وكلاء Cintra' : 'Cintra Agents'}</h1>
          <div className="bayan-agent-mark flex h-9 w-9 items-center justify-center rounded-xl"><Bot size={18} /></div>
        </div>
      </header>

      {activeView === 'workflow' ? <AgentWorkflowCanvas /> : (
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 min-h-0 gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden lg:p-8">
        <section className="flex min-h-0 flex-col gap-5">
          <div className="bayan-agent-card overflow-hidden rounded-3xl border">
            <div className="bayan-agent-hero p-5 sm:p-7">
              <div className="flex items-start gap-4">
                <div className="bayan-agent-orb flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"><Bot size={24} /></div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.16em] text-indigo-500">{text ? 'مساعد بحث مستقل' : 'Autonomous research assistant'}</p>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{text ? 'حوّل هدفك إلى بحث موثّق' : 'Turn a goal into cited research'}</h2>
                  <p className="bayan-agent-muted mt-2 max-w-2xl text-sm leading-6">
                    {text ? 'يجمع الوكيل حتى خمسة مصادر عامة، يقارن الأدلة، ثم يصوغ تقريراً منظماً. تستمر المهمة على الخادم حتى لو أغلقت هذه الصفحة.' : 'The agent reads up to five public sources, compares evidence, and writes a structured report. Tasks continue on the server if you leave this page.'}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {[text ? 'مصادر عامة فقط' : 'Public sources only', text ? 'تقدم محفوظ' : 'Persistent progress', text ? 'نتيجة قابلة للتنزيل' : 'Downloadable report'].map((feature) => <span key={feature} className="bayan-agent-chip rounded-xl border px-3 py-2 text-[11px]">{feature}</span>)}
              </div>
            </div>
            <form onSubmit={(event) => void startTask(event)} className="p-5 sm:p-7">
              <label htmlFor="agent-goal" className="mb-2 block text-xs font-semibold">{text ? 'ما النتيجة التي تريدها؟' : 'What outcome do you need?'}</label>
              <textarea id="agent-goal" value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} maxLength={2000} placeholder={text ? 'مثال: قارن هذه المصادر، لخّص أهم الأدلة، وحدد ما يختلفون عليه:\nhttps://example.com/article-1\nhttps://example.com/article-2' : 'Example: Compare these sources, summarize the strongest evidence, and note disagreements:\nhttps://example.com/article-1\nhttps://example.com/article-2'} className="bayan-agent-input w-full resize-y rounded-2xl border px-4 py-3 text-sm leading-6 outline-none transition-all focus:border-indigo-400" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="bayan-agent-muted flex items-center gap-2 text-xs">
                  <span>{text ? 'نموذج التحليل' : 'Analysis model'}</span>
                  <select value={modelId} onChange={(event) => { setModelId(event.target.value); localStorage.setItem('bayan_selected_model', event.target.value); }} className="bayan-agent-select max-w-[220px] rounded-xl border px-3 py-2 text-xs">
                    {groupModelsByFamily(models).map(({ family, models: familyModels }) => (
                      <optgroup key={family} label={family}>
                        {familyModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={busy || goal.trim().length < 5 || !models.length} className="bayan-agent-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  {busy ? (text ? 'جارٍ إرسال المهمة…' : 'Queueing task…') : (text ? 'ابدأ المهمة' : 'Start task')}
                </button>
              </div>
              <p className="bayan-agent-muted mt-3 flex items-center gap-1.5 text-[11px]"><ShieldCheck size={14} className="text-emerald-500" />{text ? 'روابط HTTP(S) عامة فقط · حتى 5 روابط · لا تنفيذ أوامر أو وصول لبيانات خاصة' : 'Public HTTP(S) URLs only · Up to 5 sources · No shell or private-data access'}</p>
              {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            </form>
          </div>

          {task ? (
            <div className="bayan-agent-card flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-3xl border">
              <div className="border-b border-inherit p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="bayan-agent-chip rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">{task.status}</span>
                      {task.modelId && <span className="bayan-agent-muted text-[10px]">{task.modelId}</span>}
                    </div>
                    <h2 className="text-sm font-semibold leading-6">{task.goal}</h2>
                    <p className="bayan-agent-muted mt-1 text-[11px]">{text ? 'تعمل المهمة في الخلفية ويمكنك مغادرة الصفحة.' : 'This task runs in the background; you can leave this page.'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-indigo-500">{progress}%</span>
                    {running && <button type="button" onClick={() => void cancelTask()} disabled={busy} className="bayan-agent-quiet inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-medium"><Square size={13} />{text ? 'إيقاف' : 'Stop'}</button>}
                    {task.status === 'failed' && <button type="button" onClick={() => void queueTask(task.goal)} className="bayan-agent-quiet inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-medium"><RotateCcw size={13} />{text ? 'إعادة المحاولة' : 'Retry'}</button>}
                  </div>
                </div>
                <div className="bayan-agent-track mt-4 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 transition-[width] duration-700" style={{ width: `${progress}%` }} /></div>
                <ol className="mt-5 grid gap-3 sm:grid-cols-2">
                  {task.steps.map((step, index) => (
                    <li key={`${index}:${step.title}`} className={`bayan-agent-step flex items-center gap-3 rounded-2xl border p-3 text-xs ${step.status === 'in_progress' ? 'is-active' : ''}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step.status === 'done' ? 'bg-emerald-500/10 text-emerald-500' : step.status === 'failed' ? 'bg-red-500/10 text-red-500' : step.status === 'in_progress' ? 'bg-indigo-500/10 text-indigo-500' : 'bayan-agent-muted-bg text-neutral-400'}`}>
                        {step.status === 'done' ? <Check size={15} /> : step.status === 'failed' ? <XCircle size={15} /> : step.status === 'in_progress' ? <Loader2 size={15} className="animate-spin" /> : <span className="text-[10px] font-semibold">{index + 1}</span>}
                      </span>
                      <span className={step.status === 'pending' ? 'bayan-agent-muted' : 'font-medium'}>{stepLabels[index] || step.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                {task.result && task.status === 'completed' ? (
                  <div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><ListChecks size={16} className="text-indigo-500" />{text ? 'التقرير النهائي' : 'Final report'}</h3>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void copyResult()} className="bayan-agent-quiet inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px]"><Copy size={13} />{text ? 'نسخ' : 'Copy'}</button>
                        <button type="button" onClick={downloadResult} className="bayan-agent-quiet inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px]"><Download size={13} />{text ? 'تنزيل التقرير' : 'Download report'}</button>
                      </div>
                    </div>
                    <article dir="auto" className="bayan-agent-report whitespace-pre-wrap rounded-2xl border p-4 text-sm leading-7 sm:p-6">{task.result}</article>
                  </div>
                ) : task.status === 'failed' || task.status === 'cancelled' ? (
                  <div className="bayan-agent-muted rounded-2xl border border-dashed p-5 text-sm leading-6">
                    {task.status === 'cancelled' ? (text ? 'تم إيقاف المهمة. يمكنك إعادة تشغيلها من نفس الهدف.' : 'Task stopped. You can launch it again from the same goal.') : task.result || (text ? 'تعذر إكمال المهمة.' : 'The task could not be completed.')}
                  </div>
                ) : (
                  <div className="bayan-agent-working flex h-full min-h-24 items-center justify-center gap-3 rounded-2xl border border-dashed p-5 text-sm">
                    <span className="bayan-agent-pulse"><span /><span /><span /></span>
                    <span>{task.status === 'queued' ? (text ? 'المهمة في قائمة الانتظار…' : 'Task is queued…') : (text ? 'الوكيل يجمع الأدلة ويحللها…' : 'The agent is gathering and analyzing evidence…')}</span>
                  </div>
                )}
                {actions.length > 0 && (
                  <details className="bayan-agent-details mt-4 rounded-2xl border p-4">
                    <summary className="cursor-pointer text-xs font-semibold">{text ? `سجل التنفيذ · ${actions.length} خطوات` : `Execution log · ${actions.length} steps`}</summary>
                    <ul className="mt-3 space-y-3">
                      {actions.map((action, index) => <li key={`${action.timestamp}:${index}`} className="border-t border-inherit pt-3 text-xs">
                        <div className="flex items-center justify-between gap-2"><b>{action.tool}</b><time className="bayan-agent-muted text-[10px]">{new Date(action.timestamp).toLocaleString()}</time></div>
                        <p className="bayan-agent-muted mt-1 break-words">{action.input}</p>
                        {action.output && <details className="mt-2"><summary className="bayan-agent-muted cursor-pointer text-[10px]">{text ? 'عرض المخرجات' : 'Show output'}</summary><pre className="bayan-agent-output mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl p-3 text-[10px] leading-5">{action.output}</pre></details>}
                      </li>)}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          ) : (
            <div className="bayan-agent-card flex flex-1 flex-col items-center justify-center rounded-3xl border px-6 py-12 text-center">
              <div className="bayan-agent-orb mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"><Search size={23} /></div>
              <h2 className="text-sm font-semibold">{text ? 'ابدأ بهدف بحثك' : 'Start with a research goal'}</h2>
              <p className="bayan-agent-muted mt-2 max-w-sm text-xs leading-5">{text ? 'أضف روابط المصادر وحدد ما تريد معرفته. ستظهر الخطوات والنتيجة هنا.' : 'Add source links and describe what you need to learn. Live steps and the final report will appear here.'}</p>
            </div>
          )}
        </section>

        <aside className="bayan-agent-card flex min-h-64 flex-col overflow-hidden rounded-3xl border lg:min-h-0">
          <div className="flex items-center justify-between border-b border-inherit p-4">
            <div><h2 className="text-xs font-semibold">{text ? 'مهامك' : 'Your tasks'}</h2><p className="bayan-agent-muted mt-1 text-[10px]">{text ? 'تستمر حتى عند مغادرة الصفحة' : 'Persist across page visits'}</p></div>
            <span className="bayan-agent-muted text-[10px]">{history.length}/50</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {history.length ? <ul className="space-y-1">{history.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setActiveId(item.id)} className={`bayan-agent-history w-full rounded-2xl border border-transparent p-3 text-start transition-all ${activeId === item.id ? 'is-selected' : ''}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-xs font-medium leading-5">{item.goal}</span>
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.status === 'completed' ? 'bg-emerald-500' : item.status === 'failed' ? 'bg-red-500' : item.status === 'cancelled' ? 'bg-neutral-400' : 'animate-pulse bg-indigo-500'}`} />
                  </span>
                  <span className="bayan-agent-muted mt-2 flex items-center gap-1.5 text-[10px] capitalize"><Clock3 size={11} />{item.status} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
                </button>
              </li>
            ))}</ul> : <p className="bayan-agent-muted p-4 text-xs">{text ? 'لا توجد مهام بعد.' : 'Your recent tasks will appear here.'}</p>}
          </div>
          <div className="bayan-agent-safety border-t p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={15} className="text-emerald-500" />{text ? 'مصمم للأمان' : 'Safety by design'}</div>
            <p className="bayan-agent-muted text-[10px] leading-5">{text ? 'قراءة وتحليل صفحات عامة فقط، مع منع عناوين الشبكات الخاصة. لا ينفذ أوامر ولا يرسل رسائل أو يصل إلى ملفاتك.' : 'Read-only public web research with private-network protections. No shell commands, outbound messaging, or access to private files.'}</p>
          </div>
        </aside>
      </main>
      )}
    </div>
  );
}
