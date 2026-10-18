import React, { useMemo, useState } from 'react';
import { Check, Code2, Copy, Download, FileJson2, FileText, Maximize2, Minimize2, PanelRightClose, Play, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useLanguage } from '../../contexts/LanguageContext';
import { createArtifactPreview, type GeneratedArtifact } from '../../../lib/artifacts/generatedArtifacts';

type ArtifactTab = 'code' | 'preview';

function JsonTreeValue({ value, label, root = false }: { value: unknown; label?: string; root?: boolean }) {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as const)
      : Object.entries(value as Record<string, unknown>);
    return (
      <details open={root} className="cintra-artifact-tree border-s ps-3">
        <summary className="cursor-pointer py-1 text-xs">
          {label ? <span className="cintra-artifact-key me-2">{label}:</span> : null}
          {Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`}
        </summary>
        <div className="ms-2 space-y-0.5">
          {entries.map(([key, child]) => <JsonTreeValue key={key} label={key} value={child} />)}
        </div>
      </details>
    );
  }

  const primitive = typeof value === 'string' ? JSON.stringify(value) : String(value);
  const color = value === null ? 'cintra-artifact-null' : typeof value === 'string' ? 'cintra-artifact-string' : typeof value === 'number' ? 'cintra-artifact-number' : 'cintra-artifact-boolean';
  return <div className="py-0.5 font-mono text-xs"><span className="cintra-artifact-key me-2">{label}:</span><span className={color}>{primitive}</span></div>;
}

interface ArtifactPanelProps {
  artifacts: GeneratedArtifact[];
  onClose: () => void;
  initialSelectedId?: string;
}

export function ArtifactPanel({ artifacts, onClose, initialSelectedId }: ArtifactPanelProps) {
  const { currentLang } = useLanguage();
  const isArabic = currentLang === 'ar';
  const [selectedId, setSelectedId] = useState(initialSelectedId || artifacts[0]?.id || '');
  const [tab, setTab] = useState<ArtifactTab>('code');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const selected = artifacts.find((artifact) => artifact.id === selectedId) || artifacts[0];
  const previewable = selected && ['html', 'css', 'javascript'].includes(selected.kind);
  const previewDocument = useMemo(
    () => selected ? createArtifactPreview(artifacts, selected) : '',
    [artifacts, selected],
  );
  const isJson = selected?.kind === 'json';
  const isDocument = selected && (selected.kind === 'markdown' || selected.kind === 'text');
  let parsedJson: unknown;
  let jsonIsValid = false;
  if (isJson) {
    try {
      parsedJson = JSON.parse(selected.content) as unknown;
      jsonIsValid = true;
    } catch {
      jsonIsValid = false;
    }
  }

  const copyArtifact = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error('Could not copy generated artifact:', error);
    }
  };

  const downloadArtifact = () => {
    if (!selected) return;
    const url = URL.createObjectURL(new Blob([selected.content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = selected.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!selected) return null;
  return (
    <aside
      dir={isArabic ? 'rtl' : 'ltr'}
      className={`cintra-artifact-panel cintra-artifact-enter relative z-20 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border shadow-2xl transition-all duration-300 ${
        expanded ? 'fixed inset-3 rounded-2xl' : 'h-full w-full rounded-2xl md:relative md:inset-auto md:w-full'
      }`}
      aria-label={isArabic ? 'لوحة معاينة الملفات' : 'Artifact preview panel'}
    >
      <header className="cintra-artifact-header flex min-h-14 items-center gap-2 border-b px-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-300">
          {isJson ? <FileJson2 size={16} /> : isDocument ? <FileText size={16} /> : <Code2 size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold" title={selected.filename}>{selected.filename}</p>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">{selected.language}</p>
        </div>
        <button type="button" onClick={() => void copyArtifact()} title={isArabic ? 'نسخ المحتوى' : 'Copy content'} aria-label={isArabic ? 'نسخ المحتوى' : 'Copy content'} className="cintra-artifact-icon-button rounded-lg p-2 transition">
          {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
        </button>
        <button type="button" onClick={downloadArtifact} title={isArabic ? 'تنزيل الملف' : 'Download file'} aria-label={isArabic ? 'تنزيل الملف' : 'Download file'} className="cintra-artifact-icon-button rounded-lg p-2 transition">
          <Download size={15} />
        </button>
        <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? (isArabic ? 'استعادة الحجم' : 'Restore panel') : (isArabic ? 'ملء الشاشة' : 'Expand panel')} aria-label={expanded ? (isArabic ? 'استعادة الحجم' : 'Restore panel') : (isArabic ? 'ملء الشاشة' : 'Expand panel')} className="cintra-artifact-icon-button rounded-lg p-2 transition">
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button type="button" onClick={onClose} title={isArabic ? 'إغلاق اللوحة' : 'Close panel'} aria-label={isArabic ? 'إغلاق اللوحة' : 'Close panel'} className="cintra-artifact-icon-button rounded-lg p-2 transition">
          {expanded ? <X size={16} /> : <PanelRightClose size={16} />}
        </button>
      </header>

      {artifacts.length > 1 && (
        <nav aria-label={isArabic ? 'الملفات الناتجة' : 'Generated files'} className="cintra-artifact-tabs flex gap-1 overflow-x-auto border-b px-3 py-2">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => { setSelectedId(artifact.id); setTab('code'); }}
              className={`cintra-artifact-tab shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] transition ${selected.id === artifact.id ? 'is-selected' : ''}`}
            >
              {artifact.filename}
            </button>
          ))}
        </nav>
      )}

      <div className="cintra-artifact-tabs flex min-h-11 items-center gap-1 border-b px-3">
        <button type="button" onClick={() => setTab('code')} className={`cintra-artifact-view-tab inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${tab === 'code' ? 'is-selected' : ''}`}>
          <Code2 size={13} />{isArabic ? 'الكود' : 'Code'}
        </button>
        {previewable && (
          <button type="button" onClick={() => setTab('preview')} className={`cintra-artifact-view-tab inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${tab === 'preview' ? 'is-selected' : ''}`}>
            <Play size={13} />{isArabic ? 'معاينة' : 'Preview'}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'preview' && previewable ? (
          <iframe
            title={`${selected.filename} preview`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={previewDocument}
            className="h-full min-h-[320px] w-full border-0 bg-white"
          />
        ) : isJson ? (
          <div className="p-4">
            {jsonIsValid
              ? <JsonTreeValue value={parsedJson} root />
              : <><p role="alert" className="mb-3 text-xs text-red-600">{isArabic ? 'تعذر تحليل JSON؛ يُعرض النص الخام.' : 'Invalid JSON; showing the raw text.'}</p><pre className="whitespace-pre-wrap break-words font-mono text-xs">{selected.content}</pre></>}
          </div>
        ) : isDocument && selected.kind === 'markdown' ? (
          <article className="cintra-artifact-document prose max-w-none p-5 text-sm leading-7 [&_a]:underline [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/5 [&_table]:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{selected.content}</ReactMarkdown>
          </article>
        ) : isDocument ? (
          <pre className="cintra-artifact-document whitespace-pre-wrap break-words p-5 font-sans text-sm leading-7">{selected.content}</pre>
        ) : (
          <div className="cintra-artifact-code h-full overflow-auto p-4 text-start font-mono text-xs leading-6" dir="ltr">
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{`\`\`\`${selected.language}\n${selected.content}\n\`\`\``}</ReactMarkdown>
          </div>
        )}
      </div>
    </aside>
  );
}
