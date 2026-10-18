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
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left rtl:text-right ${
            isActive
              ? 'bg-neutral-100 text-neutral-900 font-medium'
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
    <aside className="bayan-sidebar w-[clamp(200px,_17.25vw,_265px)] h-screen border-r rtl:border-r-0 rtl:border-l flex flex-col justify-between shrink-0 select-none z-30">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Top Header: Logo + New Chat Button */}
        <div className="h-[52px] px-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <img src="/cintra-icon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-bold text-base tracking-tight text-neutral-900 font-sans">
              Cintra
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            title={isRtl ? 'بحث في المحادثات' : 'Search chats'}
            aria-label={isRtl ? 'بحث في المحادثات' : 'Search chats'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <SearchIcon size={18} />
          </button>
        </div>

        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-xl bg-neutral-800 px-3 py-2 text-start text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-700"
          >
            <SquarePen size={16} />
            <span>{t('newChat')}</span>
          </button>
          <nav aria-label={isRtl ? 'التنقل الرئيسي' : 'Main navigation'} className="mt-2 space-y-0.5">
            <button type="button" onClick={() => onOpenImages?.()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-neutral-200 transition-colors hover:bg-neutral-800">
              <Images size={17} /><span>{isRtl ? 'الصور' : 'Images'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-neutral-500">
              <Library size={17} /><span>{isRtl ? 'المكتبة' : 'Library'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-neutral-500">
              <Clock3 size={17} /><span>{isRtl ? 'المجدولة' : 'Scheduled'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-neutral-500">
              <Puzzle size={17} /><span>{isRtl ? 'الإضافات' : 'Plugins'}</span>
            </button>
            <button type="button" disabled title={isRtl ? 'قريباً' : 'Coming soon'} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-neutral-500">
              <Folder size={17} /><span>{isRtl ? 'المشاريع' : 'Projects'}</span>
            </button>
            {onOpenAgent && (
              <button type="button" onClick={onOpenAgent} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-neutral-200 transition-colors hover:bg-neutral-800">
                <Code2 size={17} /><span>{isRtl ? 'سير عمل الوكلاء' : 'Agent workflows'}</span>
              </button>
            )}
            <button type="button" onClick={onOpenSettings} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-neutral-200 transition-colors hover:bg-neutral-800">
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
          <div className="px-2 py-1 text-[11px] font-semibold text-neutral-400">{isRtl ? 'الأخيرة' : 'Recents'}</div>
          {isLoading ? (
            <div className="space-y-3 px-2 py-2" aria-label={t('loadingConversationsAria')} aria-busy="true">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-8 rounded-lg bg-neutral-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            /* Empty State */
            <div className="py-12 px-2 text-center text-xs text-neutral-400">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 mx-auto mb-2 flex items-center justify-center text-neutral-400">
                <MessageSquare size={16} />
              </div>
              <p className="font-medium text-neutral-600 mb-0.5">{t('noConversationsYet')}</p>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {t('startNewChatPrompt')}
              </p>
            </div>
          ) : (
            <>
              {/* Pinned section */}
              {pinned.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                    <Pin size={10} className="fill-neutral-400" />
                    <span>{t('pinned')}</span>
                  </div>
                  {pinned.map(renderConvItem)}
                </div>
              )}

              {/* Today section */}
              {groups.today.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t('today')}
                  </div>
                  {groups.today.map(renderConvItem)}
                </div>
              )}

              {/* Yesterday section */}
              {groups.yesterday.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t('yesterday')}
                  </div>
                  {groups.yesterday.map(renderConvItem)}
                </div>
              )}

              {/* Previous 7 Days section */}
              {groups.previous7Days.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {t('previous7Days')}
                  </div>
                  {groups.previous7Days.map(renderConvItem)}
                </div>
              )}

              {/* Older section */}
              {groups.older.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
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
      <div className="p-3 border-t relative">
        {!user.isGuest && (
          <div className="bayan-credit-balance mb-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[11px]">
            <span className="font-medium">
              {t('creditsRemaining', { credits: user.creditBalance })}
            </span>
            <span className="shrink-0 font-semibold">{user.creditBalance}</span>
          </div>
        )}
        <div className="bayan-sidebar-account flex items-center justify-between p-1.5 rounded-xl hover:bg-neutral-100/70 transition-colors">
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
            className="rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-[11px] font-semibold text-neutral-100 transition-colors hover:bg-neutral-700"
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
