import React, { useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useBayanAlert } from '../../contexts/AlertContext';
import {
  SquarePen,
  Search,
  MoreVertical,
  MoreHorizontal,
  Images,
  Library,
  Clock3,
  Puzzle,
  Folder,
  Code2,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Info,
  Sparkles,
  LogOut,
  MessageSquare,
  Pin,
  Edit2,
  Trash2,
  Share2,
  Check,
  X,
} from 'lucide-react';

export interface SidebarConversation {
  id: string;
  title: string;
  model?: string;
  isPinned?: number | boolean;
  createdAt: string;
  updatedAt?: string;
}

interface SidebarProps {
  conversations?: SidebarConversation[];
  isLoading?: boolean;
  activeChatId?: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onRenameChat?: (id: string, newTitle: string) => Promise<void>;
  onTogglePin?: (id: string) => Promise<void>;
  onDeleteChat?: (id: string) => Promise<void>;
  onShareChat?: (id: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenAgent?: () => void;
  onOpenImages?: () => void;
  onOpenPlans?: () => void;
}

export function Sidebar({
  conversations = [],
  isLoading = false,
  activeChatId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onTogglePin,
  onDeleteChat,
  onShareChat,
  onOpenSettings,
  onOpenAgent,
  onOpenImages,
  onOpenPlans,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const { t, isRtl } = useLanguage();
  const showAlert = useBayanAlert();
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Conversation menu state
  const [menuConvId, setMenuConvId] = useState<string | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [conversationToDelete, setConversationToDelete] = useState<SidebarConversation | null>(null);

  if (!user) return null;

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group conversations by date
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 7 * 86400000;

  const pinned = filtered.filter((c) => Number(c.isPinned) === 1);
  const unpinned = filtered.filter((c) => Number(c.isPinned) !== 1);

  const groups = {
    today: unpinned.filter((c) => new Date(c.updatedAt || c.createdAt).getTime() >= startOfToday),
    yesterday: unpinned.filter((c) => {
      const time = new Date(c.updatedAt || c.createdAt).getTime();
      return time >= startOfYesterday && time < startOfToday;
    }),
    previous7Days: unpinned.filter((c) => {
      const time = new Date(c.updatedAt || c.createdAt).getTime();
      return time >= startOf7Days && time < startOfYesterday;
    }),
    older: unpinned.filter((c) => new Date(c.updatedAt || c.createdAt).getTime() < startOf7Days),
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name && name.trim()) {
      return name.trim().charAt(0).toUpperCase();
    }
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return 'B';
  };

  const handleStartRename = (conv: SidebarConversation) => {
    setEditingConvId(conv.id);
    setEditTitle(conv.title);
    setMenuConvId(null);
  };

  const handleSaveRename = async (id: string) => {
    if (editTitle.trim() && onRenameChat) {
      await onRenameChat(id, editTitle.trim());
    }
    setEditingConvId(null);
  };

  const renderConvItem = (chat: SidebarConversation) => {
    const isActive = activeChatId === chat.id;
    const isEditing = editingConvId === chat.id;
    const isMenuOpen = menuConvId === chat.id;

    if (isEditing) {
      return (
        <div key={chat.id} className="flex items-center gap-1 px-2 py-1 bg-neutral-100 rounded-xl">
          <input
            type="text"
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveRename(chat.id);
              if (e.key === 'Escape') setEditingConvId(null);
            }}
            className="w-full bg-white px-2 py-1 text-xs rounded-lg border border-neutral-300 outline-none text-neutral-900"
          />
          <button
            type="button"
            onClick={() => handleSaveRename(chat.id)}
            className="p-1 text-emerald-600 hover:bg-white rounded-md"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => setEditingConvId(null)}
            className="p-1 text-neutral-400 hover:bg-white rounded-md"
          >
            <X size={14} />
          </button>
        </div>
      );
    }

    return (
      <div key={chat.id} className="relative group">
        <div
          onClick={() => onSelectChat(chat.id)}
          className={`bayan-sidebar-conversation w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left rtl:text-right ${
            isActive
              ? 'is-active bg-neutral-100 text-neutral-900 font-medium'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate flex-1 min-w-0 pr-1 rtl:pr-0 rtl:pl-1">
            {Number(chat.isPinned) === 1 && (
              <Pin size={11} className="text-neutral-400 shrink-0 fill-neutral-400" />
            )}
            <span className="truncate">{chat.title}</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuConvId(isMenuOpen ? null : chat.id);
            }}
            className={`p-1 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200/60 transition-opacity ${
              isMenuOpen ? 'opacity-100 bg-neutral-200/60 text-neutral-900' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>

        {/* Conversation Action Menu */}
        {isMenuOpen && (
          <div className="absolute end-2 top-8 w-36 bg-white rounded-xl shadow-lg border border-[#e5e5e5] p-1 z-40 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
            <button
              type="button"
              onClick={() => handleStartRename(chat)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 text-left rtl:text-right"
            >
              <Edit2 size={13} />
              <span>{t('renameConversation')}</span>
            </button>

            {onTogglePin && (
              <button
                type="button"
                onClick={async () => {
                  setMenuConvId(null);
                  await onTogglePin(chat.id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 text-left rtl:text-right"
              >
                <Pin size={13} />
                <span>{Number(chat.isPinned) === 1 ? t('unpinConversation') : t('pinConversation')}</span>
              </button>
            )}

            {onShareChat && (
              <button
                type="button"
                onClick={async () => {
                  setMenuConvId(null);
                  await onShareChat(chat.id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 text-left rtl:text-right"
              >
                <Share2 size={13} />
                <span>{t('share')}</span>
              </button>
            )}

            {onDeleteChat && (
              <button
                type="button"
                onClick={() => {
                  setMenuConvId(null);
                  setConversationToDelete(chat);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 text-left rtl:text-right"
              >
                <Trash2 size={13} />
                <span>{t('deleteConversation')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    <aside className="bayan-sidebar h-screen w-[clamp(240px,_18vw,_290px)] shrink-0 select-none z-30 flex flex-col justify-between border-r rtl:border-r-0 rtl:border-l">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="bayan-sidebar-header flex items-center justify-between border-b">
          <div className="bayan-sidebar-brand flex min-w-0 items-center gap-2.5" aria-label="Cintra">
            <img src="/cintra-mark.png" alt="" aria-hidden="true" className="bayan-sidebar-mark shrink-0" />
            <span className="bayan-sidebar-wordmark-wrap flex shrink-0 items-center justify-center">
              <img src="/cintra-wordmark.png" alt="" aria-hidden="true" className="bayan-sidebar-wordmark" />
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            title={isRtl ? 'بحث في المحادثات' : 'Search chats'}
            aria-label={isRtl ? 'بحث في المحادثات' : 'Search chats'}
            className="bayan-sidebar-search-button grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors cursor-pointer"
          >
            <SearchIcon size={18} />
          </button>
        </div>

        <div className="bayan-sidebar-nav-area px-3 pt-3">
          <button
            type="button"
            onClick={onNewChat}
            className="bayan-sidebar-new-chat flex w-full items-center gap-2.5 rounded-xl px-3 text-start text-sm font-semibold transition-all"
          >
            <SquarePen size={16} aria-hidden="true" />
            <span>{t('newChat')}</span>
          </button>
          <div className="bayan-sidebar-section-label px-3 pb-1 pt-5">{isRtl ? 'مساحة العمل' : 'Workspace'}</div>
          <nav aria-label={isRtl ? 'التنقل الرئيسي' : 'Main navigation'} className="bayan-sidebar-nav space-y-1">
            <button type="button" onClick={() => onOpenImages?.()} className="bayan-sidebar-nav-item flex w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors">
              <Images size={17} /><span>{isRtl ? 'الصور' : 'Images'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="bayan-sidebar-nav-item is-disabled flex w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors">
              <Library size={17} /><span className="flex-1">{isRtl ? 'المكتبة' : 'Library'}</span><span className="bayan-sidebar-soon">{isRtl ? 'قريباً' : 'Soon'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="bayan-sidebar-nav-item is-disabled flex w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors">
              <Clock3 size={17} /><span className="flex-1">{isRtl ? 'المجدولة' : 'Scheduled'}</span><span className="bayan-sidebar-soon">{isRtl ? 'قريباً' : 'Soon'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="bayan-sidebar-nav-item is-disabled flex w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors">
              <Puzzle size={17} /><span className="flex-1">{isRtl ? 'الإضافات' : 'Plugins'}</span><span className="bayan-sidebar-soon">{isRtl ? 'قريباً' : 'Soon'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="bayan-sidebar-nav-item is-disabled flex w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors">
              <Folder size={17} /><span className="flex-1">{isRtl ? 'المشاريع' : 'Projects'}</span><span className="bayan-sidebar-soon">{isRtl ? 'قريباً' : 'Soon'}</span>
            </button>
            {onOpenAgent && (
              <button type="button" onClick={onOpenAgent} className="bayan-sidebar-nav-item flex w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors">
                <Code2 size={17} /><span>{isRtl ? 'سير عمل الوكلاء' : 'Agent workflows'}</span>
              </button>
            )}
            <button type="button" onClick={onOpenSettings} className="bayan-sidebar-nav-item flex w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors">
              <MoreHorizontal size={17} /><span>{isRtl ? 'المزيد' : 'More'}</span>
            </button>
          </nav>
        </div>

        {/* Search Bar */}
        {searchOpen && <div className="p-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-100/70 text-neutral-500 text-xs hover:bg-neutral-100 transition-colors">
            <Search size={15} className="text-neutral-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchChats')}
              className="w-full bg-transparent border-0 outline-none text-xs text-neutral-800 placeholder:text-neutral-400"
            />
            <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} aria-label={isRtl ? 'إغلاق البحث' : 'Close search'} className="text-neutral-400 hover:text-neutral-100"><X size={14} /></button>
          </div>
        </div>}

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 space-y-3">
          <div className="bayan-sidebar-history-title px-2 py-1">{isRtl ? 'الأخيرة' : 'Recents'}</div>
          {isLoading ? (
            <div className="space-y-3 px-2 py-2" aria-label={t('loadingConversationsAria')} aria-busy="true">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-8 rounded-lg bg-neutral-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            /* Empty State */
            <div className="bayan-sidebar-empty-state py-12 px-2 text-center text-xs text-neutral-400">
              <div className="bayan-sidebar-empty-icon w-10 h-10 rounded-2xl mx-auto mb-2 flex items-center justify-center">
                <MessageSquare size={16} />
              </div>
              <p className="bayan-sidebar-empty-title font-medium mb-0.5">{t('noConversationsYet')}</p>
              <p className="text-[11px] leading-relaxed">
                {t('startNewChatPrompt')}
              </p>
            </div>
          ) : (
            <>
              {/* Pinned section */}
              {pinned.length > 0 && (
                <div className="space-y-0.5">
                  <div className="bayan-sidebar-history-group-title px-2 py-1 flex items-center gap-1">
                    <Pin size={10} className="fill-neutral-400" />
                    <span>{t('pinned')}</span>
                  </div>
                  {pinned.map(renderConvItem)}
                </div>
              )}

              {/* Today section */}
              {groups.today.length > 0 && (
                <div className="space-y-0.5">
                  <div className="bayan-sidebar-history-group-title px-2 py-1">
                    {t('today')}
                  </div>
                  {groups.today.map(renderConvItem)}
                </div>
              )}

              {/* Yesterday section */}
              {groups.yesterday.length > 0 && (
                <div className="space-y-0.5">
                  <div className="bayan-sidebar-history-group-title px-2 py-1">
                    {t('yesterday')}
                  </div>
                  {groups.yesterday.map(renderConvItem)}
                </div>
              )}

              {/* Previous 7 Days section */}
              {groups.previous7Days.length > 0 && (
                <div className="space-y-0.5">
                  <div className="bayan-sidebar-history-group-title px-2 py-1">
                    {t('previous7Days')}
                  </div>
                  {groups.previous7Days.map(renderConvItem)}
                </div>
              )}

              {/* Older section */}
              {groups.older.length > 0 && (
                <div className="space-y-0.5">
                  <div className="bayan-sidebar-history-group-title px-2 py-1">
                    {t('older')}
                  </div>
                  {groups.older.map(renderConvItem)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* User Menu Capsule at Bottom */}
      <div className="bayan-sidebar-footer relative border-t p-3">
        {!user.isGuest && (
          <div className="bayan-credit-balance mb-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[11px]">
            <span className="font-medium">
              {t('creditsRemaining', { credits: user.creditBalance })}
            </span>
            <span className="shrink-0 font-semibold">{user.creditBalance}</span>
          </div>
        )}
        <div className="bayan-sidebar-account flex items-center justify-between rounded-xl p-2 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name || user.email || t('user')}
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#e5e5e5]"
              />
            ) : (
              <div className="bayan-sidebar-avatar w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {user.isGuest ? (isRtl ? 'ض' : 'G') : getInitials(user.name, user.email || '')}
              </div>
            )}
            <div className="min-w-0 text-left rtl:text-right">
              <p className="text-xs font-medium text-neutral-900 truncate leading-tight">
                {user.isGuest ? t('guestUser') : user.name || user.email?.split('@')[0]}
              </p>
              <p className="text-[11px] text-neutral-400 truncate leading-tight mt-0.5">
                {user.isGuest ? t('temporaryGuestSession') : user.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-expanded={userMenuOpen}
            aria-label={t('accountSettings')}
            className="p-1 text-neutral-400 hover:text-neutral-900 rounded-lg hover:bg-neutral-200/60 transition-colors cursor-pointer"
            title={t('accountSettings')}
          >
            <MoreVertical size={16} />
          </button>
          <button
            type="button"
            onClick={onOpenPlans}
            className="bayan-sidebar-upgrade rounded-lg px-3 py-2 text-[11px] font-semibold transition-all"
          >
            {isRtl ? 'ترقية' : 'Upgrade'}
          </button>
        </div>

        {/* User Popup Dropdown Menu */}
        {userMenuOpen && (
          <div className="bayan-account-menu absolute bottom-16 inset-x-3 rounded-2xl p-1.5 z-40 space-y-1">
            {user.isGuest ? (
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                }}
                className="bayan-account-menu-item bayan-account-signup w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors text-left rtl:text-right"
              >
                <Sparkles size={14} />
                <span>{t('guestBannerCta')} ({t('createAccountTab')})</span>
              </button>
            ) : (
              <div className="bayan-account-menu-meta px-2.5 py-1.5 text-[11px] border-b">
                {t('creditsRemaining', { credits: user.creditBalance })}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                onOpenSettings();
              }}
              className="bayan-account-menu-item w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors text-left rtl:text-right"
            >
              <SettingsIcon size={14} />
              <span>{t('settings')}</span>
            </button>

            <a
              href="/about"
              className="bayan-account-menu-item w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors"
            >
              <Info size={14} />
              <span>{t('aboutBayan')}</span>
            </a>

            {!user.isGuest && (
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  showAlert(t('proUpgradeUnavailable'), 'info', isRtl ? 'ar' : 'en');
                }}
                className="bayan-account-menu-item w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors text-left rtl:text-right"
              >
                <Sparkles size={14} />
                <span>{t('upgradeToPro')}</span>
              </button>
            )}

            <div className="bayan-account-menu-divider my-1 border-t" />

            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                logout();
              }}
              className="bayan-account-menu-item bayan-account-logout w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors text-left rtl:text-right"
            >
              <LogOut size={14} />
              <span>{t('logout')}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
    <ConfirmDialog
      open={Boolean(conversationToDelete)}
      title={t('deleteConversation')}
      description={t('deleteConversationConfirmation')}
      confirmLabel={t('deleteConversation')}
      cancelLabel={t('cancel')}
      onConfirm={() => conversationToDelete ? onDeleteChat?.(conversationToDelete.id) : undefined}
      onClose={() => setConversationToDelete(null)}
    />
    </>
  );
}
