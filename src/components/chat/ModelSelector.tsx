import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';
import { ModelInfo } from '../../../lib/ai/provider';
import { getModelCost } from '../../../lib/config/modelCosts';
import { getModelFamily, groupModelsByFamily } from '../../lib/modelGrouping';
import { useLanguage } from '../../contexts/LanguageContext';

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, onSelectModel }: ModelSelectorProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties | null>(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(340, window.innerWidth - margin * 2);
    const headerBottom = trigger.closest('header')?.getBoundingClientRect().bottom ?? rect.bottom;
    const top = Math.max(rect.bottom + margin, headerBottom + 4);
    const height = Math.max(100, Math.min(440, window.innerHeight - top - margin));
    const isRtl = document.documentElement.dir === 'rtl';
    const alignedLeft = isRtl ? rect.right - width : rect.left;
    const left = Math.max(margin, Math.min(alignedLeft, window.innerWidth - width - margin));
    setMenuPosition({ position: 'fixed', top, left, width, maxHeight: height });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/models', { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Unable to load available models (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        if (data.models && Array.isArray(data.models)) {
          setModels(data.models);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (models.length) {
          console.error('Model selector refresh failed:', error);
          return;
        }
        setModels([
          { id: 'cintra-core-v1', name: '🚀 Cintra Core v1', provider: 'Cintra' },
          { id: 'cintra-research', name: '🔍 Cintra Research', provider: 'Cintra' },
          { id: 'cintra-creative', name: '🎨 Cintra Creative', provider: 'Cintra' },
          { id: 'cintra-analyst', name: '💼 Cintra Analyst', provider: 'Cintra' },
        ]);
      });
    return () => controller.abort();
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current
        && !containerRef.current.contains(event.target as Node)
        && !menuRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition, true);
      updateMenuPosition();
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen]);

  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getModelFamily(m).toLowerCase().includes(searchQuery.toLowerCase())
  );
  const groupedModels = groupModelsByFamily(filteredModels);

  const currentModelObj = models.find((m) => m.id === selectedModel);
  const displayName = currentModelObj ? currentModelObj.name : selectedModel || '🚀 Cintra Core v1';
  const currentCost = getModelCost(selectedModel);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        title={`${displayName} · ${t(`${currentCost.tier.toLowerCase()}Tier`)} · ${t('modelCostTooltip', { credits: currentCost.credits })}`}
        className="bayan-model-trigger flex h-8 max-w-[min(46vw,290px)] min-w-0 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-2 text-xs font-medium text-neutral-800 shadow-xs transition-colors hover:bg-neutral-50 sm:max-w-[min(60vw,290px)] sm:px-3"
      >
        <span className="min-w-0 truncate max-w-[130px] sm:max-w-[200px]">{displayName}</span>
        <span className={`flex shrink-0 items-center gap-1 ${currentCost.colorClass}`}>
          <span aria-hidden="true">{currentCost.icon}</span>
          <span>{t(`${currentCost.tier.toLowerCase()}Tier`)}</span>
        </span>
        <ChevronDown size={14} className="text-neutral-500 shrink-0" />
      </button>

      {isOpen && menuPosition && createPortal(
        <div ref={menuRef} style={menuPosition} className="bayan-model-menu rounded-xl shadow-xl border z-[100] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="bayan-model-menu-header p-2 border-b">
            <div className="bayan-model-menu-search flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs text-neutral-800">
              <Search size={14} className="text-neutral-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchModels')}
                className="w-full bg-transparent border-0 outline-none text-xs placeholder:text-neutral-400"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {groupedModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-400">{t('noMatchingModels')}</div>
            ) : (
              groupedModels.map(({ family, models: familyModels }) => (
                <div key={family} className="space-y-0.5">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    {family}
                  </div>
                  {familyModels.map((m) => {
                    const isSelected = m.id === selectedModel;
                    const cost = getModelCost(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectModel(m.id);
                          setIsOpen(false);
                        }}
                        role="option"
                        aria-selected={isSelected}
                        className={`w-full min-w-0 flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left rtl:text-right ${
                          isSelected
                            ? 'bg-neutral-100 font-semibold text-neutral-900'
                            : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isSelected ? 'bg-neutral-900' : 'bg-neutral-300'
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="block truncate">{m.name}</span>
                            {m.description && <span className="mt-0.5 block truncate text-[10px] font-normal text-neutral-400">{m.description}</span>}
                          </span>
                          <span className={`ml-auto flex shrink-0 items-center gap-1 pl-2 text-[10px] ${cost.colorClass}`}>
                            <span aria-hidden="true">{cost.icon}</span>
                            <span>{t(`${cost.tier.toLowerCase()}Tier`)}</span>
                          </span>
                        </div>
                        {isSelected && <Check size={14} className="text-neutral-900 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
