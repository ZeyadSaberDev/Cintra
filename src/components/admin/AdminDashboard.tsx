import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, Ban, BarChart3, Bell, BookOpen, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Database, Download, FileText, KeyRound,
  LayoutDashboard, LockKeyhole, LogOut, Menu, MessageSquare, Moon, MoreHorizontal,
  Pencil, Plus, RefreshCw, Search, Server, Settings, Shield, Sun, Trash2, Users, X, Image, Upload,
  Zap, RotateCcw, Eye, CircleCheck, CircleX, Layers3, SlidersHorizontal,
} from 'lucide-react';
import { filterModelsByApi, reorderApiIds } from './apiPriority.js';
import { translateAdminNode, type AdminLanguage } from './adminI18n.js';
import { isDarkTheme, readThemePreference, saveThemePreference } from '../../lib/theme';
import { AUTO_CINTRA_ROUTE_PREFIX, CINTRA_MODELS, type CintraModelRoutes } from '../../../lib/ai/cintraModels.js';
import { DEFAULT_SERVICE_API_ROUTES, type ServiceApiRoutes } from '../../../lib/ai/serviceApiRoutes.js';
import './admin.css';

type Section = 'overview' | 'users' | 'admins' | 'apis' | 'models' | 'content' | 'announcements' | 'logs' | 'settings' | 'database';
type ApiRow = { id: string; name: string; baseUrl: string; provider: string; isActive: boolean; priority: number; apiKey: string; modelCount: number; successRate: number; avgResponseMs: number; lastCall: string | null };
type AdminUserRow = { id: string; username: string; email: string | null; isActive: boolean; createdAt: string; lastLogin: string | null };
type UserRow = { id: string; name: string | null; email: string | null; role: 'user' | 'admin'; plan: 'free' | 'pro' | 'pro_plus'; dailyMessageLimit: number; dailyMessageLimitOverride: number | null; isGuest: boolean; isBanned: boolean; status: string; createdAt: string; lastActive: string | null };
type ModelRow = { id: string; name: string; publicName?: string; publicId?: string; isPublic: boolean; provider: string; apiId: string; apiModelId?: string; costTier: 'low' | 'medium' | 'high'; isEnabled: boolean; usageCount: number; averageTokens: number };
type CintraRoutingProvider = { id: string; name: string; isActive: boolean; priority: number; models: Array<{ id: string; name: string; apiModelId: string }> };
type Settings = { dailyMessageLimit: number; maxUploadSizeMb: number; studyModeEnabled: boolean; guestLoginEnabled: boolean; highTierCredits: number; mediumTierCredits: number; lowTierCredits: number; proPlanPrice: number; logRetentionDays: number; ipWhitelist: string; imageModel: string };
type DataPoint = { date: string; value: number };
type ConversationRow = { id: string; title: string; model: string; createdAt: string; updatedAt: string; userId: string; userName: string | null; userEmail: string | null; messageCount: number; tokenCount: number };
type AdminError = Error & { status?: number };

let activeAdminRequests = 0;
let activeAdminLanguage: AdminLanguage = 'en';
const adminLoadingListeners = new Set<(loading: boolean) => void>();

function LocalizedOutput({ children }: { children: React.ReactNode }) {
  return <>{translateAdminNode(children, activeAdminLanguage, activeAdminRequests > 0)}</>;
}

function reportAdminRequest(loading: boolean): void {
  activeAdminRequests = Math.max(0, activeAdminRequests + (loading ? 1 : -1));
  adminLoadingListeners.forEach((listener) => listener(activeAdminRequests > 0));
}

function useAdminLoading(): boolean {
  const [loading, setLoading] = useState(activeAdminRequests > 0);
  useEffect(() => {
    const listener = (value: boolean) => setLoading(value);
    adminLoadingListeners.add(listener);
    listener(activeAdminRequests > 0);
    return () => { adminLoadingListeners.delete(listener); };
  }, []);
  return loading;
}

function AdminSpinner({ label }: { label: string }) {
  return <span className="admin-spinner-wrap" role="status"><span className="admin-spinner" aria-hidden="true" /><span>{label}</span></span>;
}

const navItems: Array<{ id: Section; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'admins', label: 'Admin users', icon: Shield },
  { id: 'apis', label: 'APIs', icon: Zap },
  { id: 'models', label: 'Models', icon: Layers3 },
  { id: 'content', label: 'Content', icon: MessageSquare },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'logs', label: 'Logs', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'database', label: 'Database', icon: Database },
];

async function adminRequest<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  reportAdminRequest(true);
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { ...(init.headers as Record<string, string> || {}) },
    });
    if (response.status === 401) {
      window.location.assign('/admin/login');
      throw new Error('Admin session expired.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error?.message || `Request failed (${response.status}).`) as AdminError;
      error.status = response.status;
      throw error;
    }
    return result as T;
  } finally {
    reportAdminRequest(false);
  }
}

function formatDate(value?: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The request could not be completed.';
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field.trim()); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseApiImport(text: string): Array<Record<string, unknown>> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste a JSON array or CSV data first.');
  let entries: unknown[];
  if (trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('JSON import must be an array of API objects.');
    entries = parsed;
  } else {
    const rows = parseCsv(trimmed);
    const headers = rows[0]?.map((value) => {
      const header = value.replace(/^\uFEFF/, '').toLowerCase();
      return ({ baseurl: 'baseUrl', apikey: 'apiKey', isactive: 'isActive' } as Record<string, string>)[header] || header;
    });
    const required = ['name', 'baseUrl', 'apiKey'];
    if (!headers || required.some((header) => !headers.includes(header))) {
      throw new Error('CSV must include name, baseUrl, and apiKey header columns.');
    }
    entries = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  }
  if (entries.length < 1 || entries.length > 25) throw new Error('Import between 1 and 25 API connections at a time.');
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`API entry ${index + 1} must be an object.`);
    const item = entry as Record<string, unknown>;
    const name = item.name;
    const baseUrl = item.baseUrl ?? item.baseurl;
    const apiKey = item.apiKey ?? item.apikey;
    const priority = item.priority === undefined || item.priority === '' ? 1 : Number(item.priority);
    const activeValue = item.isActive;
    const isActive = activeValue === undefined || activeValue === '' ? true
      : typeof activeValue === 'boolean' ? activeValue : String(activeValue).toLowerCase() === 'true';
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80
      || typeof baseUrl !== 'string' || !baseUrl.trim()
      || typeof apiKey !== 'string' || !apiKey.trim()
      || (activeValue !== undefined && activeValue !== '' && typeof activeValue !== 'boolean' && !['true', 'false'].includes(String(activeValue).toLowerCase()))
      || !Number.isInteger(priority) || priority < 1 || priority > 1000) {
      throw new Error(`API entry ${index + 1} has invalid name, baseUrl, apiKey, or priority.`);
    }
    return {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      provider: typeof item.provider === 'string' && item.provider.trim() ? item.provider.trim() : 'openai-compatible',
      priority,
      isActive,
    };
  });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }) {
  return <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`admin-panel ${className}`}>{children}</section>;
}

function PageHeading({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <LocalizedOutput>{(
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-xl font-semibold tracking-normal">{title}</h1>{description && <p className="admin-muted mt-1 text-sm">{description}</p>}</div>
      {action}
    </div>
  )}</LocalizedOutput>;
}

function IconButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="admin-icon-button disabled:cursor-not-allowed disabled:opacity-40">{children}</button>;
}

function LineChart({ title, points, color = '#3378c8', valueSuffix = '' }: { title: string; points: DataPoint[]; color?: string; valueSuffix?: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const coordinates = points.map((point, index) => `${points.length <= 1 ? 0 : index / (points.length - 1) * 600},${178 - point.value / max * 150}`).join(' ');
  return <LocalizedOutput>{(
    <Panel className="min-w-0 p-4">
      <div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2><span className="admin-muted text-xs">Last 30 days</span></div>
      <div className="h-48 w-full overflow-hidden">
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label={title} className="h-full w-full">
          {[35, 80, 125, 170].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--admin-grid)" strokeWidth="1" />)}
          <polyline points={coordinates} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="admin-muted mt-2 flex justify-between text-[11px]"><span>{points[0]?.date || ''}</span><span>{Math.max(...points.map((point) => point.value), 0)}{valueSuffix} peak</span><span>{points.at(-1)?.date || ''}</span></div>
    </Panel>
  )}</LocalizedOutput>;
}

function BarChart({ title, points }: { title: string; points: DataPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const visible = points.slice(-14);
  return <LocalizedOutput>{(
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2><span className="admin-muted text-xs">ms / day</span></div>
      <div className="flex h-48 items-end gap-1.5 border-b admin-border px-1">
        {visible.map((point) => <div key={point.date} title={`${point.date}: ${point.value} ms`} className="group flex h-full flex-1 items-end"><div className="w-full rounded-t-sm bg-sky-600/80 transition-colors group-hover:bg-sky-500" style={{ height: `${Math.max(3, point.value / max * 92)}%` }} /></div>)}
      </div>
      <div className="admin-muted mt-2 flex justify-between text-[11px]"><span>{visible[0]?.date || ''}</span><span>{Math.max(...points.map((point) => point.value), 0)} ms peak</span><span>{visible.at(-1)?.date || ''}</span></div>
    </Panel>
  )}</LocalizedOutput>;
}

function ModelPie({ data }: { data: Array<{ name: string; value: number }> }) {
  const colors = ['#277da1', '#43aa8b', '#f9c74f', '#f9844a', '#577590', '#90be6d', '#f94144', '#9b5de5'];
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const gradient = data.map((item, index) => {
    const start = total ? offset / total * 100 : 0;
    offset += item.value;
    const end = total ? offset / total * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  }).join(', ');
  return <LocalizedOutput>{(
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Most used models</h2><span className="admin-muted text-xs">All recorded usage</span></div>
      {data.length ? <div className="flex flex-wrap items-center gap-6">
        <div className="h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="Model usage distribution" />
        <div className="grid min-w-0 flex-1 gap-2">
          {data.map((item, index) => <div key={item.name} className="flex min-w-0 items-center gap-2 text-xs"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colors[index % colors.length] }} /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="admin-muted tabular-nums">{item.value}</span></div>)}
        </div>
      </div> : <p className="admin-muted py-10 text-center text-sm">No model usage recorded yet.</p>}
    </Panel>
  )}</LocalizedOutput>;
}

function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try { setData(await adminRequest('/api/admin/stats')); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load dashboard statistics.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer); }, []);
  const cards = data?.cards;
  const metrics = [
    { title: 'Total users', value: cards?.totalUsers ?? '—', detail: `${cards?.registeredUsers ?? 0} registered · ${cards?.guestUsers ?? 0} guests`, icon: Users },
    { title: 'Messages sent', value: cards?.totalMessages ?? '—', detail: 'User messages across all chats', icon: MessageSquare },
    { title: 'Conversations', value: cards?.totalConversations ?? '—', detail: 'Saved conversations', icon: BookOpen },
    { title: 'Active today', value: cards?.activeUsersToday ?? '—', detail: 'Users with usage today', icon: Activity },
    { title: 'Images generated', value: cards?.imagesGenerated ?? '—', detail: 'Generated image requests', icon: Image },
    { title: 'PDFs processed', value: cards?.pdfsProcessed ?? '—', detail: 'Stored PDF documents', icon: FileText },
    { title: 'Agent tasks', value: cards?.agentTasks ?? '—', detail: 'Read-only research tasks', icon: Activity },
    { title: 'Server status', value: cards?.serverStatus?.toUpperCase() || '—', detail: `${cards?.activeApis ?? 0} active APIs`, icon: Server, status: cards?.serverStatus === 'up' },
    { title: 'Storage used', value: `${cards?.storageMb ?? 0} MB`, detail: `API success ${cards?.apiSuccessRate ?? 0}%`, icon: Database },
  ];
  return <LocalizedOutput><>
    <PageHeading title="Overview" description="Live service, usage, and storage metrics." action={<IconButton label="Refresh statistics" onClick={() => void refresh()}><RefreshCw size={16} /></IconButton>} />
    {error && <div className="admin-alert admin-alert-danger mb-4"><AlertTriangle size={16} />{error}</div>}
    {loading && !data ? <div className="admin-muted py-16 text-center">Loading overview…</div> : <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ title, value, detail, icon: Icon, status }) => <div key={title} className="admin-panel p-4">
          <div className="flex items-start justify-between"><span className="admin-muted text-xs font-medium">{title}</span><Icon size={17} className={status === undefined ? 'admin-muted' : status ? 'text-emerald-600' : 'text-red-600'} /></div>
          <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div><div className="admin-muted mt-1 text-xs">{detail}</div>
        </div>)}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LineChart title="Messages per day" points={data?.charts?.messagesPerDay || []} />
        <LineChart title="User growth" points={data?.charts?.userGrowth || []} color="#18866b" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ModelPie data={data?.charts?.models || []} />
        <BarChart title="API response times" points={data?.charts?.responseTimes || []} />
      </div>
    </>}
  </></LocalizedOutput>;
}

function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="admin-search"><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function Select({ value, onChange, children, className = '', disabled = false }: { value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string; disabled?: boolean }) {
  return <select className={`admin-select ${className}`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select>;
}

function UserProfileDialog({ userId, onClose, onConversations }: { userId: string; onClose: () => void; onConversations: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { void adminRequest(`/api/admin/users/${encodeURIComponent(userId)}`).then(setProfile).catch((cause) => setError(cause.message)); }, [userId]);
  return <LocalizedOutput><Modal title="User profile" onClose={onClose}>
    {error ? <div className="admin-alert admin-alert-danger">{error}</div> : !profile ? <p className="admin-muted">Loading profile…</p> : <>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries({ Name: profile.user.name || 'Guest', Email: profile.user.email || '—', Plan: profile.user.plan, Role: profile.user.role, Status: profile.user.isBanned ? 'Banned' : 'Active', Created: formatDate(profile.user.createdAt), 'Last updated': formatDate(profile.user.updatedAt), 'Daily limit': profile.user.dailyMessageLimit, 'Credit balance': profile.user.creditBalance, Conversations: profile.conversationCount, 'Messages used': profile.messageCount }).map(([key, value]) => <div key={key} className="admin-detail"><dt className="admin-muted text-xs">{key}</dt><dd className="mt-1 break-words text-sm font-medium">{String(value)}</dd></div>)}
      </dl>
      <div className="mt-5 flex justify-end"><button className="admin-button admin-button-primary" onClick={onConversations}><MessageSquare size={15} />View conversations</button></div>
    </>}
  </Modal></LocalizedOutput>;
}

function UserCredentialsDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(user.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() === user.email ? undefined : email.trim(),
          newPassword: newPassword || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return <LocalizedOutput><Modal title="Update user account" onClose={onClose}>
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="admin-label">Email address<input className="admin-input mt-1" type="email" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="admin-label">New password <span className="admin-muted">(leave blank to keep current)</span><input className="admin-input mt-1" type="password" autoComplete="new-password" minLength={12} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
      {error && <div className="admin-alert admin-alert-danger">{error}</div>}
      <div className="flex justify-end gap-2"><button type="button" className="admin-button" onClick={onClose}>Cancel</button><button type="submit" className="admin-button admin-button-primary" disabled={busy || (!newPassword && email.trim().toLowerCase() === (user.email || '').toLowerCase())}>{busy ? 'Saving…' : 'Save account'}</button></div>
    </form>
  </Modal></LocalizedOutput>;
}

function UsersPage({ openConfirm }: { openConfirm: (title: string, description: string, action: (key: string) => Promise<void>) => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState('10');
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [direction, setDirection] = useState('desc');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [credentialsUser, setCredentialsUser] = useState<UserRow | null>(null);
  const [dailyLimitDrafts, setDailyLimitDrafts] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit, search, sort, direction });
    if (plan) params.set('plan', plan);
    if (status) params.set('status', status);
    void adminRequest<{ users: UserRow[]; total: number }>(`/api/admin/users?${params}`)
      .then((result) => {
        setUsers(result.users);
        setDailyLimitDrafts(Object.fromEntries(result.users.map((user) => [user.id, String(user.dailyMessageLimit)])));
        setTotal(result.total);
        setError('');
      })
      .catch((cause) => setError(cause.message));
  }, [page, limit, search, plan, status, sort, direction, refreshKey]);
  const update = async (userId: string, url: string, init: RequestInit = {}) => {
    try { await adminRequest(url, init); setRefreshKey((value) => value + 1); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const openUserConversations = async (userId: string) => {
    setSelectedUser(null);
    try { const result = await adminRequest<{ conversations: any[] }>(`/api/admin/users/${encodeURIComponent(userId)}/conversations`); setConversations(result.conversations); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const sortBy = (column: string) => { setSort(column); setDirection((value) => sort === column && value === 'asc' ? 'desc' : 'asc'); };
  const pageCount = Math.max(1, Math.ceil(total / Number(limit)));
  return <LocalizedOutput><>
    <PageHeading title="Users" description={`${total.toLocaleString()} accounts, including guest users.`} />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b admin-border p-3">
        <SearchInput value={search} onChange={(value) => { setPage(1); setSearch(value); }} placeholder="Search name or email" />
        <Select value={plan} onChange={setPlan}><option value="">All plans</option><option value="free">Free</option><option value="pro">Pro</option><option value="pro_plus">Pro+</option></Select>
        <Select value={status} onChange={setStatus}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="banned">Banned</option></Select>
        <span className="flex-1" />
        <Select value={limit} onChange={(value) => { setLimit(value); setPage(1); }}><option value="10">10 / page</option><option value="25">25 / page</option><option value="50">50 / page</option></Select>
      </div>
      <div className="admin-table-wrap"><table className="admin-table min-w-[1160px]"><thead><tr>
        {[['name', 'Name'], ['email', 'Email'], ['plan', 'Plan'], ['createdAt', 'Created'], ['lastActive', 'Last active'], ['status', 'Status']].map(([key, label]) => <th key={key}><button className="inline-flex items-center gap-1" onClick={() => sortBy(key)}>{label}{sort === key && (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}
        <th>Daily limit</th><th>Actions</th>
      </tr></thead><tbody>
        {users.map((user) => <tr key={user.id}>
          <td className="font-medium">{user.name || 'Guest'}{user.isGuest && <span className="admin-muted ms-1 text-xs">Guest</span>}</td>
          <td>{user.email || '—'}</td>
          <td><Select value={user.plan} onChange={(value) => void update(user.id, `/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: value }) })}><option value="free">Free</option><option value="pro">Pro</option><option value="pro_plus">Pro+</option></Select></td>
          <td>{formatDate(user.createdAt)}</td><td>{user.lastActive || 'Never'}</td>
          <td><StatusBadge tone={user.isBanned ? 'danger' : user.status === 'active' ? 'success' : 'neutral'}>{user.isBanned ? 'Banned' : user.status}</StatusBadge></td>
          <td><div className="flex items-center gap-1"><input className="admin-input w-20" type="number" min={0} max={10000} aria-label={`Daily message limit for ${user.email || user.name || user.id}`} value={dailyLimitDrafts[user.id] ?? user.dailyMessageLimit} onChange={(event) => setDailyLimitDrafts((current) => ({ ...current, [user.id]: event.target.value }))} /><IconButton label="Save daily limit" onClick={() => {
            const value = Number(dailyLimitDrafts[user.id]);
            if (Number.isInteger(value) && value >= 0 && value <= 10000) {
              void update(user.id, `/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dailyMessageLimitOverride: value }) });
            } else setError('Daily limit must be a whole number between 0 and 10000.');
          }}><Check size={15} /></IconButton></div></td>
          <td><div className="flex items-center gap-1">
            <IconButton label="View profile" onClick={() => setSelectedUser(user.id)}><Eye size={15} /></IconButton>
            {!user.isGuest && user.role !== 'admin' && <IconButton label="Edit user account" onClick={() => setCredentialsUser(user)}><Pencil size={15} /></IconButton>}
            <IconButton label={user.isBanned ? 'Unban user' : 'Ban user'} onClick={() => void update(user.id, `/api/admin/users/${encodeURIComponent(user.id)}/ban`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isBanned: !user.isBanned }) })}><Ban size={15} /></IconButton>
            <IconButton label="Reset daily limit" onClick={() => void update(user.id, `/api/admin/users/${encodeURIComponent(user.id)}/reset-limit`, { method: 'POST' })}><RotateCcw size={15} /></IconButton>
            <IconButton label="View conversations" onClick={() => void openUserConversations(user.id)}><MessageSquare size={15} /></IconButton>
            <IconButton label="Delete user" onClick={() => openConfirm('Delete user', `Permanently delete ${user.email || user.name || 'this account'} and all related data?`, async (confirmKey) => { await adminRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmKey }) }); setRefreshKey((value) => value + 1); })}><Trash2 size={15} /></IconButton>
          </div></td>
        </tr>)}
        {!users.length && <tr><td colSpan={8} className="admin-muted py-10 text-center">No users match these filters.</td></tr>}
      </tbody></table></div>
      <div className="admin-muted flex items-center justify-between border-t admin-border px-4 py-3 text-xs"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><IconButton label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={15} /></IconButton><IconButton label="Next page" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight size={15} /></IconButton></div></div>
    </Panel>
    {selectedUser && <UserProfileDialog userId={selectedUser} onClose={() => setSelectedUser(null)} onConversations={() => void openUserConversations(selectedUser)} />}
    {credentialsUser && <UserCredentialsDialog user={credentialsUser} onClose={() => setCredentialsUser(null)} onSaved={() => setRefreshKey((value) => value + 1)} />}
    {conversations && <Modal title="User conversations" onClose={() => setConversations(null)}><div className="space-y-2">{conversations.map((conversation) => <div key={conversation.id} className="admin-detail"><div className="font-medium">{conversation.title}</div><div className="admin-muted mt-1 text-xs">{conversation.messageCount} messages · {conversation.tokens} tokens · {formatDate(conversation.updatedAt)}</div></div>)}{!conversations.length && <p className="admin-muted text-sm">No conversations.</p>}</div></Modal>}
  </></LocalizedOutput>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`admin-modal ${wide ? 'max-w-4xl' : 'max-w-xl'}`} role="dialog" aria-modal="true" aria-label={title}><header className="flex items-center justify-between border-b admin-border px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2><IconButton label="Close" onClick={onClose}><X size={16} /></IconButton></header><div className="max-h-[75vh] overflow-y-auto p-5">{children}</div></section></div>;
}

function ConfirmationDialog({ title, description, onConfirm, onClose }: { title: string; description: string; onConfirm: (key: string) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onConfirm(''); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed.'); }
    finally { setBusy(false); }
  };
  return <LocalizedOutput><Modal title={title} onClose={onClose}><form onSubmit={(event) => void submit(event)}>
    <div className="admin-alert admin-alert-warning mb-4"><AlertTriangle size={16} />{description}</div>
    {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    <div className="mt-5 flex justify-end gap-2"><button type="button" className="admin-button" onClick={onClose}>Cancel</button><button type="submit" disabled={busy} className="admin-button admin-button-danger"><LockKeyhole size={14} />{busy ? 'Working…' : 'Confirm action'}</button></div>
  </form></Modal></LocalizedOutput>;
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/admin/availability').then((response) => response.json()).then((result) => setConfigured(Boolean(result.configured))).catch(() => setConfigured(false)); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Admin sign-in failed.');
      setPassword(''); onLogin();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reach the server.'); }
    finally { setBusy(false); }
  };
  return <LocalizedOutput><main className="admin-login-stage"><section className="admin-login-panel">
    <img className="admin-brand-mark" src="/cintra-mark.png" alt="" aria-hidden="true" />
    <p className="admin-muted mt-5 text-xs font-semibold uppercase tracking-[0.12em]">Cintra Control</p>
    <h1 className="mt-2 text-2xl font-semibold">Administrator sign in</h1>
    <p className="admin-muted mt-2 text-sm">Sign in with your local Cintra account after administrator access has been granted.</p>
    <form onSubmit={(event) => void submit(event)} className="mt-7">
      <label className="admin-label">Email<input autoFocus className="admin-input mt-2 h-11" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" maxLength={254} required /></label>
      <label className="admin-label mt-4">Password<input className="admin-input mt-2 h-11" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" maxLength={100} required /></label>
      {configured === false && <div className="admin-alert admin-alert-warning mt-4"><CircleHelp size={15} /><span>Local authentication is unavailable. Contact the server administrator.</span></div>}
      {error && <div className="admin-alert admin-alert-danger mt-4"><AlertTriangle size={15} />{error}</div>}
      <button disabled={busy || configured === false || !email || !password} className="admin-button admin-button-primary mt-5 h-11 w-full justify-center">{busy ? 'Verifying…' : <><LockKeyhole size={15} />Sign in securely</>}</button>
    </form>
  </section></main></LocalizedOutput>;
}

function ApiForm({ initial, onClose, onSaved }: { initial?: ApiRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || '');
  const [provider, setProvider] = useState(initial?.provider || 'openai-compatible');
  const [apiKey, setApiKey] = useState('');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [priority, setPriority] = useState(initial?.priority ?? 1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = { name, baseUrl, provider, isActive, priority };
      if (apiKey) body.apiKey = apiKey;
      if (!initial && !apiKey) throw new Error('An API key is required.');
      await adminRequest(initial ? `/api/admin/apis/${encodeURIComponent(initial.id)}` : '/api/admin/apis', { method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save API.'); }
    finally { setBusy(false); }
  };
  return <LocalizedOutput><Modal title={initial ? 'Edit API connection' : 'Add API connection'} onClose={onClose}>
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="admin-label">Name<input className="admin-input mt-1" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} /></label>
      <label className="admin-label">Base URL<input className="admin-input mt-1" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" required /></label>
      <label className="admin-label">Provider<input className="admin-input mt-1" value={provider} onChange={(event) => setProvider(event.target.value)} required maxLength={40} /></label>
      <label className="admin-label">Fallback priority (lower runs first)<input className="admin-input mt-1" type="number" min={1} max={1000} value={priority} onChange={(event) => setPriority(Number(event.target.value))} required /></label>
      <label className="admin-label">API key<input className="admin-input mt-1" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={initial ? `Stored key ${initial.apiKey}; leave blank to keep` : 'Paste the provider key'} autoComplete="new-password" required={!initial} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />Active</label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="admin-button" onClick={onClose}>Cancel</button><button disabled={busy} className="admin-button admin-button-primary">{busy ? 'Saving…' : 'Save API'}</button></div>
    </form>
  </Modal></LocalizedOutput>;
}

function ApiLogs({ api, onClose }: { api: ApiRow; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { void adminRequest<{ logs: any[] }>(`/api/admin/apis/${encodeURIComponent(api.id)}/logs`).then((result) => setLogs(result.logs)); }, [api.id]);
  return <LocalizedOutput><Modal title={`${api.name} · API logs`} onClose={onClose}>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Timestamp</th><th>Status</th><th>Response</th></tr></thead><tbody>{logs.map((log, index) => <tr key={`${log.createdAt}-${index}`}><td>{formatDate(log.createdAt)}</td><td><StatusBadge tone={log.status >= 200 && log.status < 400 ? 'success' : 'danger'}>{log.status || 'Failed'}</StatusBadge></td><td>{log.durationMs} ms</td></tr>)}{!logs.length && <tr><td colSpan={3} className="admin-muted py-8 text-center">No test calls recorded.</td></tr>}</tbody></table></div>
  </Modal></LocalizedOutput>;
}

function AdminUsersPage({ openConfirm }: { openConfirm: (title: string, description: string, action: (key: string) => Promise<void>) => void }) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    void adminRequest<{ users: AdminUserRow[] }>('/api/admin/admin-users')
      .then((result) => setUsers(result.users))
      .catch((cause) => setError(errorMessage(cause)));
  }, [refreshKey]);
  const addUser = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await adminRequest('/api/admin/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setEmail(''); setNotice('Email added to the administrator allowlist.');
      setRefreshKey((value) => value + 1);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <LocalizedOutput><>
    <PageHeading title="Administrator access" description="Only verified accounts with server-granted administrator access can use the dashboard. Passwords and sessions are managed by Cintra." />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}
    {notice && <div className="admin-alert admin-alert-success mb-4"><Check size={15} />{notice}</div>}
    <Panel className="mb-4 p-5">
      <h2 className="mb-4 text-sm font-semibold">Allow an administrator email</h2>
      <form onSubmit={(event) => void addUser(event)} className="flex flex-wrap items-end gap-3">
        <label className="admin-label min-w-64 flex-1">Administrator email<input className="admin-input mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="off" required /></label>
        <button className="admin-button admin-button-primary" disabled={busy || !email}>{busy ? 'Adding…' : 'Allow email'}</button>
      </form>
    </Panel>
    <Panel className="overflow-hidden"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Allowed email</th><th>Added</th><th>Actions</th></tr></thead><tbody>
      {users.map((user) => <tr key={user.id}><td className="font-medium">{user.email || user.username}</td><td>{formatDate(user.createdAt)}</td><td><button className="admin-button admin-button-danger" onClick={() => openConfirm('Remove administrator access', `Remove ${user.email || user.username} from the local administrator allowlist?`, async (confirmKey) => { await adminRequest(`/api/admin/admin-users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmKey }) }); setNotice(`Administrator access removed for ${user.email || user.username}.`); setRefreshKey((value) => value + 1); })}><Trash2 size={14} />Remove access</button></td></tr>)}
      {!users.length && <tr><td colSpan={3} className="admin-muted py-8 text-center">No administrator emails have been added.</td></tr>}
    </tbody></table></div></Panel>
  </></LocalizedOutput>;
}

function ApisPage({ openConfirm }: { openConfirm: (title: string, description: string, action: (key: string) => Promise<void>) => void }) {
  const [apis, setApis] = useState<ApiRow[]>([]);
  const [editing, setEditing] = useState<ApiRow | null | false>(false);
  const [viewingLogs, setViewingLogs] = useState<ApiRow | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyApiId, setBusyApiId] = useState<string | null>(null);
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const primaryApiId = [...apis].filter((api) => api.isActive).sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name))[0]?.id;
  const refresh = async () => { setLoading(true); try { const result = await adminRequest<{ apis: ApiRow[] }>('/api/admin/apis'); setApis(result.apis); setError(''); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, [refreshKey]);
  const savePriority = async (api: ApiRow, priority: number) => {
    if (!Number.isInteger(priority) || priority < 1) {
      setError('Priority must be a positive whole number.');
      return;
    }
    setBusyApiId(api.id);
    setError('');
    try {
      const ids = reorderApiIds(apis, api.id, priority);
      await adminRequest('/api/admin/apis-priority', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setNotice('API failover priority order saved.');
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyApiId(null);
    }
  };
  const update = async (api: ApiRow, patch: Record<string, unknown>) => {
    try { await adminRequest(`/api/admin/apis/${encodeURIComponent(api.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: api.name, baseUrl: api.baseUrl, provider: api.provider, isActive: api.isActive, priority: api.priority, ...patch }) }); setRefreshKey((value) => value + 1); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const test = async (api: ApiRow) => {
    setBusyApiId(api.id);
    setNotice(`Testing ${api.name}…`);
    try { const result = await adminRequest<{ success: boolean; durationMs: number; message: string }>(`/api/admin/apis/${encodeURIComponent(api.id)}/test`, { method: 'POST' }); setNotice(`${result.message} (${result.durationMs} ms)`); setRefreshKey((value) => value + 1); }
    catch (cause) { setNotice(errorMessage(cause)); }
    finally { setBusyApiId(null); }
  };
  const syncModels = async (api: ApiRow) => {
    setBusyApiId(api.id);
    setNotice(`Syncing models from ${api.name}…`);
    try { const result = await adminRequest<{ synchronized: number }>(`/api/admin/apis/${encodeURIComponent(api.id)}/sync-models`, { method: 'POST' }); setNotice(`${result.synchronized} models synchronized from ${api.name}.`); setRefreshKey((value) => value + 1); }
    catch (cause) { setNotice(errorMessage(cause)); }
    finally { setBusyApiId(null); }
  };
  const importApis = async () => {
    setImporting(true); setError(''); setNotice('');
    try {
      const entries = parseApiImport(importText);
      const failures: string[] = [];
      let added = 0;
      for (const [index, entry] of entries.entries()) {
        try {
          await adminRequest('/api/admin/apis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
          });
          added += 1;
        } catch (cause) {
          failures.push(`Entry ${index + 1}: ${errorMessage(cause)}`);
        }
      }
      setImportText('');
      setShowImport(false);
      setNotice(failures.length
        ? `Added ${added} of ${entries.length} API connections. ${failures.join(' ')}`
        : `Added ${added} API connections successfully.`);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setImporting(false);
    }
  };
  return <LocalizedOutput><>
    <PageHeading title="API management" description="Manage provider connections. Secrets are encrypted at rest and masked here." action={<div className="flex flex-wrap gap-2"><button className="admin-button" onClick={() => setShowImport((value) => !value)}><Upload size={15} />Import JSON/CSV</button><button className="admin-button admin-button-primary" onClick={() => setEditing(null)}><Plus size={15} />Add New API</button></div>} />
    {showImport && <Panel className="mb-4 space-y-3 p-4">
      <div><h2 className="text-sm font-semibold">Import API connections</h2><p className="admin-muted mt-1 text-xs">Paste a JSON array or CSV with name, baseUrl, apiKey, priority, and isActive columns. API keys are sent over the authenticated admin session and encrypted by the server.</p></div>
      <textarea className="admin-input min-h-40 font-mono text-xs" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={'[{"name":"Production","baseUrl":"https://api.example.com/v1","apiKey":"…","priority":1,"isActive":true}]\n\nor CSV:\nname,baseUrl,apiKey,priority,isActive'} autoComplete="off" spellCheck={false} />
      <div className="flex justify-end gap-2"><button className="admin-button" onClick={() => { setImportText(''); setShowImport(false); }}>Cancel</button><button className="admin-button admin-button-primary" disabled={importing || !importText.trim()} onClick={() => void importApis()}>{importing ? 'Importing…' : 'Validate and import'}</button></div>
    </Panel>}
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}{notice && <div className="admin-alert admin-alert-info mb-4">{notice}<IconButton label="Dismiss" onClick={() => setNotice('')}><X size={14} /></IconButton></div>}
    {loading && <div className="admin-muted mb-3"><AdminSpinner label="Loading API connections…" /></div>}
    <div className="space-y-3">{apis.map((api) => <Panel key={api.id} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{api.name}</h2>{api.id === primaryApiId && <StatusBadge tone="info">Primary API</StatusBadge>}<StatusBadge tone={api.isActive ? 'success' : 'neutral'}>{api.isActive ? 'Active' : 'Inactive'}</StatusBadge><span className="admin-muted text-xs">{api.provider}</span></div><p className="admin-muted mt-2 break-all font-mono text-xs">{api.baseUrl}</p><p className="admin-muted mt-2 text-xs">Key {api.apiKey} · {api.modelCount} models</p><label className="admin-label mt-3 inline-flex items-center gap-2">Priority <input aria-label={`Priority for ${api.name}`} className="admin-input w-20" type="number" min={1} max={Math.max(apis.length, 1)} value={priorityDrafts[api.id] ?? String(api.priority)} disabled={busyApiId !== null} onChange={(event) => setPriorityDrafts((current) => ({ ...current, [api.id]: event.target.value }))} onBlur={(event) => { const priority = Number(event.target.value); setPriorityDrafts((current) => { const next = { ...current }; delete next[api.id]; return next; }); if (priority !== api.priority) void savePriority(api, priority); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.currentTarget.blur(); } }} /><span className="admin-muted text-xs">1 = highest</span>{busyApiId === api.id && <AdminSpinner label="Saving…" />}</label></div>
        <div className="flex flex-wrap items-center gap-1">
            <button className="admin-button" disabled={busyApiId !== null} onClick={() => void test(api)}><Zap size={14} />Test</button>
            <button className="admin-button" disabled={!api.isActive || busyApiId !== null} onClick={() => void syncModels(api)}><RefreshCw size={14} />Sync models</button>
          <button className="admin-button" onClick={() => setViewingLogs(api)}><FileText size={14} />Logs</button>
          <IconButton label="Edit API" onClick={() => setEditing(api)}><Pencil size={15} /></IconButton>
          <IconButton label={api.isActive ? 'Disable API' : 'Enable API'} onClick={() => void update(api, { isActive: !api.isActive })}>{api.isActive ? <CircleX size={15} /> : <CircleCheck size={15} />}</IconButton>
          <IconButton label="Delete API" disabled={busyApiId !== null} onClick={() => openConfirm(
            'Delete API',
            api.id === primaryApiId
              ? `This is the primary API. Deleting "${api.name}" will promote the next active API. Model definitions and usage records will be kept.`
              : `Remove API connection "${api.name}"? Model definitions and usage records will be kept.`,
            async (confirmKey) => {
              await adminRequest(`/api/admin/apis/${encodeURIComponent(api.id)}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmKey }),
              });
              setRefreshKey((value) => value + 1);
            },
          )}><Trash2 size={15} /></IconButton>
        </div>
      </div>
      <div className="admin-muted mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs"><span>Success {api.successRate}%</span><span>Average {api.avgResponseMs} ms</span><span>Last call {formatDate(api.lastCall)}</span></div>
    </Panel>)}{!loading && !apis.length && <Panel className="admin-muted p-10 text-center">No API configurations.</Panel>}</div>
    {editing !== false && <ApiForm initial={editing || undefined} onClose={() => setEditing(false)} onSaved={() => setRefreshKey((value) => value + 1)} />}
    {viewingLogs && <ApiLogs api={viewingLogs} onClose={() => setViewingLogs(null)} />}
  </></LocalizedOutput>;
}

function ModelsPage({ openConfirm }: { openConfirm: (title: string, description: string, action: (key: string) => Promise<void>) => void }) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [apisLoading, setApisLoading] = useState(true);
  const [apis, setApis] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const [cintraRoutes, setCintraRoutes] = useState<CintraModelRoutes>({
    'cintra-core-v1': [],
    'cintra-research': [],
    'cintra-creative': [],
    'cintra-analyst': [],
  });
  const [cintraProviders, setCintraProviders] = useState<CintraRoutingProvider[]>([]);
  const [cintraLoading, setCintraLoading] = useState(true);
  const [cintraSaving, setCintraSaving] = useState(false);
  const [cintraNotice, setCintraNotice] = useState('');
  const [serviceRoutes, setServiceRoutes] = useState<ServiceApiRoutes>(DEFAULT_SERVICE_API_ROUTES);
  const [serviceRoutesSaving, setServiceRoutesSaving] = useState(false);
  const [serviceRoutesNotice, setServiceRoutesNotice] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [publicNameDrafts, setPublicNameDrafts] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importApiId, setImportApiId] = useState('');
  const [selectedApiId, setSelectedApiId] = useState<string | null>(null);
  const [importJson, setImportJson] = useState('[{"id":"model-id","name":"Model name","apiModelId":"provider-model-id","costTier":"medium"}]');
  const [usage, setUsage] = useState<{ name: string; items: any[] } | null>(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = async () => { setModelsLoading(true); try { const result = await adminRequest<{ models: ModelRow[] }>('/api/admin/models'); setModels(result.models.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))); setPublicNameDrafts(Object.fromEntries(result.models.map((model) => [model.id, model.publicName || '']))); setError(''); } catch (cause) { setError(errorMessage(cause)); } finally { setModelsLoading(false); } };
  useEffect(() => { void refresh(); }, [refreshKey]);
  useEffect(() => { void adminRequest<{ apis: ApiRow[] }>('/api/admin/apis').then((result) => {
    setApis(result.apis);
    const defaultApiId = result.apis.find((api) => api.isActive && api.priority === 1)?.id || result.apis.find((api) => api.isActive)?.id || result.apis[0]?.id || '';
    setImportApiId((current) => current || defaultApiId);
    setSelectedApiId((current) => current || defaultApiId);
  }).catch((cause) => setError(errorMessage(cause))).finally(() => setApisLoading(false)); }, []);
  useEffect(() => {
    void Promise.all([
      adminRequest<{ config: CintraModelRoutes; providers: CintraRoutingProvider[] }>('/api/admin/cintra-routes'),
      adminRequest<{ routes?: ServiceApiRoutes }>('/api/admin/service-api-routes'),
    ])
      .then(([result, serviceResult]) => {
        if (!result.config || !CINTRA_MODELS.every(({ id }) => Array.isArray(result.config[id])) || !Array.isArray(result.providers)) {
          throw new Error('The Cintra route configuration response is incomplete.');
        }
        const routes = serviceResult.routes;
        if (!routes || !['image', 'search', 'speech', 'transcription', 'embeddings'].every((capability) => (
          routes[capability as keyof ServiceApiRoutes] === null
          || typeof routes[capability as keyof ServiceApiRoutes] === 'string'
        ))) {
          throw new Error('Service API routes are unavailable. Restart the server and reload this page.');
        }
        setCintraRoutes(result.config);
        setCintraProviders(result.providers);
        setServiceRoutes(routes);
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setCintraLoading(false));
  }, [refreshKey]);
  const visibleModels = selectedApiId === null ? [] : filterModelsByApi(models, selectedApiId);
  const saveCintraRoutes = async () => {
    setCintraSaving(true);
    setError('');
    setCintraNotice('');
    try {
      await adminRequest('/api/admin/cintra-routes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cintraRoutes),
      });
      setCintraNotice('Cintra model routes saved. Primary and fallback providers follow API priority.');
      setRefreshKey((value) => value + 1);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setCintraSaving(false); }
  };
  const saveServiceRoutes = async () => {
    setServiceRoutesSaving(true);
    setError('');
    setServiceRoutesNotice('');
    try {
      await adminRequest('/api/admin/service-api-routes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceRoutes),
      });
      setServiceRoutesNotice('Service API routes saved and applied to the site.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setServiceRoutesSaving(false); }
  };
  const update = async (id: string, patch: Record<string, unknown>) => {
    try { await adminRequest(`/api/admin/models/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); setRefreshKey((value) => value + 1); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const bulk = async (isEnabled: boolean) => {
    try { await adminRequest('/api/admin/models/bulk', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, isEnabled }) }); setSelected([]); setRefreshKey((value) => value + 1); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const bulkTier = async (costTier: 'low' | 'medium' | 'high') => {
    try { await adminRequest('/api/admin/models/bulk', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, costTier }) }); setSelected([]); setRefreshKey((value) => value + 1); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const importModels = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const modelsToImport: unknown = JSON.parse(importJson);
      await adminRequest('/api/admin/models/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiId: importApiId, models: modelsToImport }) });
      setImportOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not import models.'); }
  };
  return <LocalizedOutput><>
    <PageHeading title="Models" description="Manage Cintra's public model policy, internal API routes, and model availability." action={<button className="admin-button admin-button-primary" onClick={() => setImportOpen(true)}><Plus size={15} />Import Models</button>} />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}
    <Panel className="mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Cintra model routing</h2><StatusBadge tone="info">Public model policy</StatusBadge></div>
          <p className="admin-muted mt-1 text-xs">Configure a separate primary and fallback route for each public model. The Cintra identity and model-disclosure policy applies to all four; upstream names are only used inside this admin page.</p>
        </div>
        <button className="admin-button admin-button-primary" onClick={() => void saveCintraRoutes()} disabled={cintraLoading || cintraSaving}>
          {cintraSaving ? <AdminSpinner label="Saving…" /> : 'Save Cintra routes'}
        </button>
      </div>
      {cintraLoading ? <AdminSpinner label="Loading Cintra routes…" /> : <>
        {cintraNotice && <div className="admin-alert admin-alert-success mb-3"><Check size={15} />{cintraNotice}</div>}
        <div className="space-y-3">
          {CINTRA_MODELS.map((publicModel) => <div key={publicModel.id} className="admin-detail">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold">{publicModel.name}</h3>
              <StatusBadge tone={cintraRoutes[publicModel.id].length ? 'success' : 'neutral'}>{cintraRoutes[publicModel.id].length ? 'Configured' : 'No routes'}</StatusBadge>
              <span className="admin-muted text-[10px]">{publicModel.description}</span>
            </div>
            <div className="space-y-2">
              {cintraProviders.map((api) => {
                const autoRouteId = `${AUTO_CINTRA_ROUTE_PREFIX}${api.id}`;
                const linkedId = cintraRoutes[publicModel.id].includes(autoRouteId)
                  ? autoRouteId
                  : api.models.find((model) => cintraRoutes[publicModel.id].includes(model.id))?.id || '';
                return <label key={`${publicModel.id}:${api.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border admin-border p-3">
                  <span className="min-w-0 flex-1"><span className="block text-xs font-medium">{api.name}</span><span className="admin-muted text-[10px]">Priority {api.priority} · {api.isActive ? 'Active' : 'Inactive'}</span></span>
                  <Select value={linkedId} disabled={!api.isActive} onChange={(modelId) => setCintraRoutes((current) => ({
                    ...current,
                    [publicModel.id]: [...current[publicModel.id].filter((id) => !api.models.some((model) => model.id === id) && id !== autoRouteId), ...(modelId ? [modelId] : [])],
                  }))}>
                    <option value="">Not linked</option>
                    <option value={autoRouteId}>Auto (provider-managed)</option>
                    {api.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </Select>
                </label>;
              })}
            </div>
          </div>)}
          {!cintraProviders.length && <p className="admin-muted text-xs">Add an API and sync or import its models to configure Cintra's four public model routes.</p>}
        </div>
      </>}
    </Panel>
    <Panel className="mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Service API routing</h2>
          <p className="admin-muted mt-1 text-xs">Connect separate API configurations to image, search, speech, and embedding endpoints. Unassigned services follow API priority.</p>
        </div>
        <button className="admin-button admin-button-primary" onClick={() => void saveServiceRoutes()} disabled={cintraLoading || serviceRoutesSaving}>
          {serviceRoutesSaving ? <AdminSpinner label="Saving…" /> : 'Save service routes'}
        </button>
      </div>
      {serviceRoutesNotice && <div className="admin-alert admin-alert-success mb-3"><Check size={15} />{serviceRoutesNotice}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['image', 'Image generation', 'POST /v1/images/generations'],
          ['search', 'Web search', 'POST /v1/search'],
          ['speech', 'Text-to-speech', 'POST /v1/audio/speech'],
          ['transcription', 'Speech-to-text', 'POST /v1/audio/transcriptions'],
          ['embeddings', 'Text embeddings', 'POST /v1/embeddings'],
        ] as const).map(([capability, label, endpoint]) => <label key={capability} className="admin-detail">
          <span className="block text-xs font-semibold">{label}</span>
          <span className="admin-muted mt-1 block font-mono text-[10px]">{endpoint}</span>
          <Select className="mt-2 w-full" value={serviceRoutes[capability] || ''} onChange={(apiId) => setServiceRoutes((current) => ({
            ...current,
            [capability]: apiId || null,
          }))}>
            <option value="">Use API priority (automatic fallback)</option>
            {cintraProviders.map((api) => <option key={api.id} value={api.id} disabled={!api.isActive}>
              {api.name} · Priority {api.priority}{api.isActive ? '' : ' · Inactive'}
            </option>)}
          </Select>
        </label>)}
      </div>
    </Panel>
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b admin-border p-3"><label className="admin-label">API connection <Select value={selectedApiId ?? ''} onChange={(value) => { setSelectedApiId(value); setSelected([]); setImportApiId(value); }}><option value="">All APIs</option>{apis.map((api) => <option key={api.id} value={api.id}>{api.name}{api.isActive ? '' : ' (inactive)'}</option>)}</Select></label><span className="admin-muted flex-1 text-xs">{selected.length} selected</span><button className="admin-button" disabled={!selected.length} onClick={() => void bulk(true)}><Check size={14} />Enable selected</button><button className="admin-button" disabled={!selected.length} onClick={() => void bulk(false)}><CircleX size={14} />Disable selected</button><label className="admin-muted text-xs">Set tier for selection<Select value="" disabled={!selected.length} onChange={(value) => { if (value) void bulkTier(value as 'low' | 'medium' | 'high'); }}><option value="">Choose tier</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></label></div>
      <div className="admin-table-wrap"><table className="admin-table min-w-[1080px]"><thead><tr><th><input type="checkbox" aria-label="Select all models" checked={visibleModels.length > 0 && visibleModels.every((model) => selected.includes(model.id))} onChange={(event) => setSelected(event.target.checked ? visibleModels.map((model) => model.id) : [])} /></th><th>Name</th><th>Provider</th><th>Public model name</th><th>Cost tier</th><th>Status</th><th>Usage</th><th>Avg tokens</th><th>Actions</th></tr></thead><tbody>
        {visibleModels.map((model, index) => <React.Fragment key={model.id}>
          {index === 0 || visibleModels[index - 1].provider !== model.provider ? <tr><td colSpan={9} className="admin-muted bg-neutral-50 font-semibold">{model.provider || 'Other'}</td></tr> : null}
          <tr>
            <td><input type="checkbox" aria-label={`Select ${model.name}`} checked={selected.includes(model.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, model.id] : current.filter((id) => id !== model.id))} /></td>
            <td className="font-medium">{editingName === model.id ? <div className="flex gap-1"><input className="admin-input h-8" aria-label={`Edit ${model.name}`} value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={120} /><button className="admin-button" onClick={() => { void update(model.id, { name: draftName }).then(() => setEditingName(null)); }}>Save</button><button className="admin-button" onClick={() => setEditingName(null)}>Cancel</button></div> : <button className="text-left hover:underline" onClick={() => { setEditingName(model.id); setDraftName(model.name); }}>{model.name}</button>}<div className="admin-muted mt-1 font-mono text-[10px]">{model.id}</div></td>
            <td>{model.provider || 'Other'}</td>
            <td><div className="flex min-w-56 items-center gap-2"><input className="admin-input h-8 min-w-0 flex-1" aria-label={`Public name for ${model.name}`} placeholder="Cintra model name" value={publicNameDrafts[model.id] ?? model.publicName ?? ''} maxLength={80} onChange={(event) => setPublicNameDrafts((current) => ({ ...current, [model.id]: event.target.value }))} onBlur={(event) => { const value = event.target.value.trim(); if (value !== (model.publicName || '') && value) void update(model.id, { publicName: value }); }} /><label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" aria-label={`Publish ${model.name}`} checked={model.isPublic} disabled={!model.isEnabled} onChange={(event) => { const publicName = (publicNameDrafts[model.id] || model.publicName || '').trim(); if (event.target.checked && !/^Cintra(?:\s|$)/i.test(publicName)) { setError('Enter a public name beginning with Cintra, then publish the model.'); return; } void update(model.id, event.target.checked ? { publicName, isPublic: true } : { isPublic: false }); }} />Publish</label></div><div className="admin-muted mt-1 text-[10px]">{model.isPublic ? 'Visible in the user model selector' : 'Not visible to users'}</div></td>
            <td><Select value={model.costTier} onChange={(value) => void update(model.id, { costTier: value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></td>
            <td><button className="admin-button" onClick={() => void update(model.id, { isEnabled: !model.isEnabled })}><StatusBadge tone={model.isEnabled ? 'success' : 'neutral'}>{model.isEnabled ? 'Enabled' : 'Disabled'}</StatusBadge></button></td>
            <td>{model.usageCount.toLocaleString()}</td><td>{model.averageTokens.toLocaleString()}</td>
            <td><div className="flex gap-1"><IconButton label="View usage" onClick={() => void adminRequest<{ usage: any[] }>(`/api/admin/models/${encodeURIComponent(model.id)}/usage`).then((result) => setUsage({ name: model.name, items: result.usage })).catch((cause) => setError(cause.message))}><BarChart3 size={15} /></IconButton><IconButton label="Delete model" onClick={() => openConfirm('Delete model', `Remove ${model.name} from the enabled model catalog?`, async (confirmKey) => { await adminRequest(`/api/admin/models/${encodeURIComponent(model.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmKey }) }); setRefreshKey((value) => value + 1); })}><Trash2 size={15} /></IconButton></div></td>
          </tr>
        </React.Fragment>)}
        {(modelsLoading || apisLoading || selectedApiId === null) && <tr><td colSpan={9} className="py-10 text-center"><AdminSpinner label="Loading models…" /></td></tr>}
        {!modelsLoading && !apisLoading && !visibleModels.length && <tr><td colSpan={9} className="admin-muted py-10 text-center">{selectedApiId ? 'No models are linked to this API.' : 'No models configured.'}</td></tr>}
      </tbody></table></div>
    </Panel>
    {importOpen && <Modal title="Import models" onClose={() => setImportOpen(false)}><form onSubmit={(event) => void importModels(event)} className="space-y-4"><label className="admin-label">Provider API<Select value={importApiId} onChange={setImportApiId}><option value="">Choose API</option>{apis.map((api) => <option key={api.id} value={api.id} disabled={!api.isActive}>{api.name}{api.isActive ? '' : ' (inactive)'}</option>)}</Select></label><label className="admin-label">Models JSON<textarea className="admin-input mt-1 min-h-48 w-full font-mono text-xs" value={importJson} onChange={(event) => setImportJson(event.target.value)} spellCheck={false} /></label><p className="admin-muted text-xs">Paste an array of objects with id, name, optional apiModelId, and optional costTier.</p><div className="flex justify-end gap-2"><button type="button" className="admin-button" onClick={() => setImportOpen(false)}>Cancel</button><button className="admin-button admin-button-primary" disabled={!importApiId}>Import</button></div></form></Modal>}
    {usage && <Modal title={`${usage.name} · usage`} onClose={() => setUsage(null)}><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Calls</th></tr></thead><tbody>{usage.items.map((item) => <tr key={item.date}><td>{item.date}</td><td>{item.count}</td></tr>)}</tbody></table></div></Modal>}
  </></LocalizedOutput>;
}

function LogsPage() {
  const [type, setType] = useState('api');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams({ type, search });
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    void adminRequest<{ logs: any[] }>(`/api/admin/logs?${params}`).then((result) => { setLogs(result.logs); setError(''); }).catch((cause) => setError(cause.message));
  }, [type, search, status, from, to, refreshKey]);
  return <LocalizedOutput><>
    <PageHeading title="Logs & monitoring" description="API request timings, user events, server errors, and admin actions." action={<IconButton label="Refresh logs" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={16} /></IconButton>} />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}
    <div className="mb-4 flex flex-wrap items-center gap-2"><Select value={type} onChange={setType}><option value="api">API logs</option><option value="user">User activity</option><option value="system">System logs</option><option value="admin">Admin actions</option></Select><SearchInput value={search} onChange={setSearch} placeholder="Search log entries" />{type === 'api' && <Select value={status} onChange={setStatus}><option value="">Any status</option><option value="200">200</option><option value="400">400</option><option value="401">401</option><option value="403">403</option><option value="429">429</option><option value="500">500</option></Select>}<label className="admin-label-inline">From<input type="date" className="admin-input" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="admin-label-inline">To<input type="date" className="admin-input" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
    <Panel className="overflow-hidden"><div className="admin-table-wrap"><table className="admin-table min-w-[800px]"><thead><tr>{type === 'api' ? <><th>Time</th><th>User</th><th>Method</th><th>Endpoint</th><th>Status</th><th>Duration</th></> : type === 'admin' ? <><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></> : type === 'user' ? <><th>Time</th><th>User</th><th>Event</th><th>Details</th></> : <><th>Time</th><th>Level</th><th>Message</th></>}</tr></thead><tbody>
      {logs.map((log, index) => <tr key={String(log.id || `${log.createdAt || log.timestamp}-${index}`)}>{type === 'api' ? <><td>{formatDate(log.createdAt)}</td><td>{log.userEmail || log.userId || 'System'}</td><td>{log.method}</td><td className="font-mono text-xs">{log.endpoint}</td><td><StatusBadge tone={log.status < 400 ? 'success' : log.status < 500 ? 'warning' : 'danger'}>{log.status}</StatusBadge></td><td>{log.durationMs} ms</td></> : type === 'admin' ? <><td>{formatDate(log.timestamp)}</td><td>{log.adminId}</td><td>{log.action}</td><td>{log.target}</td><td className="max-w-80 truncate">{log.details}</td></> : type === 'user' ? <><td>{formatDate(log.createdAt)}</td><td>{log.userEmail || log.userId || 'Deleted user'}</td><td>{log.event}</td><td>{log.details}</td></> : <><td>{formatDate(log.createdAt)}</td><td><StatusBadge tone={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'info'}>{log.level}</StatusBadge></td><td>{log.message}</td></>}</tr>)}
      {!logs.length && <tr><td colSpan={6} className="admin-muted py-10 text-center">No log entries match these filters.</td></tr>}
    </tbody></table></div></Panel>
  </></LocalizedOutput>;
}

function ContentPage({ openConfirm }: { openConfirm: (title: string, description: string, action: (key: string) => Promise<void>) => void }) {
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = async () => { try { const result = await adminRequest<{ conversations: ConversationRow[] }>(`/api/admin/conversations?search=${encodeURIComponent(search)}`); setConversations(result.conversations); setError(''); } catch (cause) { setError(errorMessage(cause)); } };
  useEffect(() => { void refresh(); }, [search, refreshKey]);
  const view = async (id: string) => { try { setSelected(await adminRequest(`/api/admin/conversations/${encodeURIComponent(id)}`)); } catch (cause) { setError(errorMessage(cause)); } };
  return <LocalizedOutput><>
    <PageHeading title="Conversations & messages" description="Read-only inspection of stored conversations, messages, token use, and attachments." />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}
    <Panel className="overflow-hidden"><div className="border-b admin-border p-3"><SearchInput value={search} onChange={setSearch} placeholder="Search ID, title, user name, or email" /></div><div className="admin-table-wrap"><table className="admin-table min-w-[950px]"><thead><tr><th>Conversation</th><th>User</th><th>Model</th><th>Messages</th><th>Tokens</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
      {conversations.map((conversation) => <tr key={conversation.id}><td><div className="max-w-80 truncate font-medium">{conversation.title}</div><div className="admin-muted mt-1 font-mono text-[10px]">{conversation.id}</div></td><td>{conversation.userName || conversation.userEmail || conversation.userId}</td><td>{conversation.model}</td><td>{conversation.messageCount}</td><td>{conversation.tokenCount}</td><td>{formatDate(conversation.updatedAt)}</td><td><div className="flex gap-1"><IconButton label="View conversation" onClick={() => void view(conversation.id)}><Eye size={15} /></IconButton><IconButton label="Delete conversation" onClick={() => openConfirm('Delete conversation', `Permanently delete “${conversation.title}” and its messages?`, async (confirmKey) => { await adminRequest(`/api/admin/conversations/${encodeURIComponent(conversation.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmKey }) }); setRefreshKey((value) => value + 1); })}><Trash2 size={15} /></IconButton></div></td></tr>)}
      {!conversations.length && <tr><td colSpan={7} className="admin-muted py-10 text-center">No conversations found.</td></tr>}
    </tbody></table></div></Panel>
    {selected && <Modal title={selected.conversation.title} onClose={() => setSelected(null)} wide><div className="admin-muted mb-4 text-xs">{selected.conversation.id} · {selected.conversation.userEmail || selected.conversation.userName} · {selected.messages.length} messages</div><div className="space-y-3">{selected.messages.map((message: any) => <article key={message.id} className="admin-detail"><div className="mb-2 flex items-center justify-between gap-2"><StatusBadge tone={message.role === 'assistant' ? 'info' : 'neutral'}>{message.role}</StatusBadge><span className="admin-muted text-xs">{formatDate(message.createdAt)} · {message.tokens || 0} tokens</span></div><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{message.content}</pre>{selected.attachments.filter((file: any) => file.messageId === message.id).map((file: any) => <a className="admin-attachment" key={file.id} href={`/api/admin/attachments/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer"><FileText size={14} />{file.fileName} · {formatBytes(file.fileSize)}</a>)}</article>)}</div></Modal>}
  </></LocalizedOutput>;
}

type AnnouncementRow = {
  message: string;
  durationHours: number;
  createdAt: string;
  expiresAt: string;
  active: boolean;
};

function AnnouncementPage() {
  const [announcement, setAnnouncement] = useState<AnnouncementRow | null>(null);
  const [message, setMessage] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ announcement: AnnouncementRow | null }>('/api/admin/announcements');
      setAnnouncement(result.announcement);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRequest<{ announcement: AnnouncementRow }>('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, durationHours: Number(durationHours) }),
      });
      setAnnouncement(result.announcement);
      setMessage('');
      setNotice('Announcement sent to all users.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await adminRequest('/api/admin/announcements', { method: 'DELETE' });
      setAnnouncement((current) => current ? { ...current, active: false } : current);
      setNotice('Announcement stopped.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return <LocalizedOutput>
    <PageHeading title="Announcements" description="Send a temporary in-app notice to everyone using Cintra." />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}
    {notice && <div className="admin-alert admin-alert-success mb-4">{notice}</div>}
    <Panel className="mb-5 p-5">
      <form onSubmit={(event) => void send(event)}>
        <label className="admin-label" htmlFor="announcement-message">Message for all users</label>
        <textarea
          id="announcement-message"
          className="admin-input mt-2 min-h-28 w-full resize-y"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          required
          placeholder="Write the announcement users will see in Cintra."
        />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <label className="admin-label">Visible duration
            <Select value={durationHours} onChange={setDurationHours} className="mt-1">
              <option value="1">1 hour</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
            </Select>
          </label>
          <button type="submit" className="admin-button admin-button-primary" disabled={busy || !message.trim()}>
            <Bell size={15} />{busy ? 'Sending…' : 'Send to all users'}
          </button>
        </div>
      </form>
    </Panel>
    {loading ? <p className="admin-muted py-5 text-center text-sm">Loading announcement…</p> : announcement && (
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Current announcement</h2>
            <StatusBadge tone={announcement.active ? 'success' : 'neutral'}>{announcement.active ? 'Active' : 'Expired or stopped'}</StatusBadge>
          </div>
          {announcement.active && <button type="button" className="admin-button" disabled={busy} onClick={() => void stop()}>Stop now</button>}
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm">{announcement.message}</p>
        <p className="admin-muted mt-3 text-xs">Expires {formatDate(announcement.expiresAt)} · {announcement.durationHours} hours</p>
      </Panel>
    )}
  </LocalizedOutput>;
}

type QuotaRow = {
  apiId: string;
  name: string;
  priority: number;
  isActive: boolean;
  quotaLimit: number;
  quotaPeriod: 'daily' | 'monthly';
  quotaUsed: number;
  remaining: number | null;
  percentUsed: number;
  daysUntilReset: number | null;
  lastFailover: string | null;
};

function QuotaManagement() {
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [failovers, setFailovers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [resetApiId, setResetApiId] = useState<string | null | undefined>();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const refresh = async () => {
    setLoading(true);
    try {
      const [quotaResult, failoverResult] = await Promise.all([
        adminRequest<{ quotas: QuotaRow[] }>('/api/admin/quota-status'),
        adminRequest<{ logs: any[] }>('/api/admin/failover-logs'),
      ]);
      setQuotas(quotaResult.quotas);
      setFailovers(failoverResult.logs);
      setError('');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const saveQuota = async (quota: QuotaRow) => {
    try {
      await adminRequest(`/api/admin/quota-status/${encodeURIComponent(quota.apiId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotaLimit: quota.quotaLimit, quotaPeriod: quota.quotaPeriod }),
      });
      setNotice(`Quota saved for ${quota.name}.`);
      await refresh();
    } catch (cause) { setError(errorMessage(cause)); }
  };
  const moveApi = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const reordered = [...quotas];
    const from = reordered.findIndex((quota) => quota.apiId === draggedId);
    const to = reordered.findIndex((quota) => quota.apiId === targetId);
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setQuotas(reordered);
    setDraggedId(null);
    try {
      await adminRequest('/api/admin/apis-priority', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map((quota) => quota.apiId) }),
      });
      setNotice('API failover priority order saved.');
    } catch (cause) { setError(errorMessage(cause)); await refresh(); }
  };
  const resetQuota = async () => {
    try {
      await adminRequest('/api/admin/quota-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(resetApiId ? { apiId: resetApiId } : {}) }),
      });
      setResetApiId(undefined);
      setNotice('Quota usage reset.');
      await refresh();
    } catch (cause) { setError(errorMessage(cause)); }
  };
  return <LocalizedOutput><Panel className="mb-5 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Provider quotas & failover</h2><p className="admin-muted mt-1 text-xs">Set a 0 limit for unlimited usage. Drag providers to change fallback order.</p></div><button className="admin-button" onClick={() => setResetApiId(null)}><RotateCcw size={14} />Reset all quotas</button></div>
    {error && <div className="admin-alert admin-alert-danger mt-4">{error}</div>}{notice && <div className="admin-alert admin-alert-success mt-4">{notice}</div>}
    <div className="mt-4 space-y-3">{quotas.map((quota) => <div key={quota.apiId} draggable onDragStart={() => setDraggedId(quota.apiId)} onDragOver={(event) => event.preventDefault()} onDrop={() => void moveApi(quota.apiId)} className="admin-detail">
      <div className="flex flex-wrap items-center gap-3"><span aria-label="Drag to reorder" className="cursor-grab text-neutral-400">⠿</span><strong className="min-w-36 flex-1">{quota.name}</strong><span className="admin-muted text-xs">Priority {quota.priority}</span><label className="admin-label">Quota limit<input className="admin-input mt-1 w-28" type="number" min={0} max={100000000} value={quota.quotaLimit} onChange={(event) => setQuotas((current) => current.map((item) => item.apiId === quota.apiId ? { ...item, quotaLimit: Number(event.target.value) } : item))} /></label><label className="admin-label">Period<Select value={quota.quotaPeriod} onChange={(value) => setQuotas((current) => current.map((item) => item.apiId === quota.apiId ? { ...item, quotaPeriod: value as 'daily' | 'monthly' } : item))}><option value="daily">Daily</option><option value="monthly">Monthly</option></Select></label><button className="admin-button" onClick={() => void saveQuota(quota)}>Save quota</button><button className="admin-button" onClick={() => setResetApiId(quota.apiId)}>Reset</button></div>
      <div className="mt-3"><div className="admin-muted mb-1 flex justify-between text-xs"><span>{quota.quotaUsed.toLocaleString()} used / {quota.quotaLimit > 0 ? quota.quotaLimit.toLocaleString() : 'Unlimited'}</span><span>{quota.quotaLimit > 0 ? `${quota.remaining?.toLocaleString()} remaining · ${quota.percentUsed}%` : 'Unlimited'} · reset in {quota.daysUntilReset ?? '—'} days</span></div><div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-neutral-800 transition-[width]" style={{ width: `${quota.percentUsed}%` }} /></div></div>
    </div>)}{loading && <p className="admin-muted py-5 text-center text-sm">Loading provider quotas...</p>}{!loading && !quotas.length && <p className="admin-muted py-5 text-center text-sm">No providers configured.</p>}</div>
    <div className="mt-6"><h3 className="text-sm font-semibold">Failover history</h3><div className="admin-table-wrap mt-2"><table className="admin-table"><thead><tr><th>Time</th><th>From</th><th>To</th><th>Model</th><th>Reason</th></tr></thead><tbody>{failovers.slice(0, 20).map((log, index) => <tr key={`${log.id}-${index}`}><td>{formatDate(log.createdAt)}</td><td>{log.requestedApiName || log.requestedApiId}</td><td>{log.selectedApiName || log.selectedApiId}</td><td className="font-mono text-xs">{log.modelId}</td><td>{log.reason}</td></tr>)}{!failovers.length && <tr><td colSpan={5} className="admin-muted py-5 text-center">No failovers recorded.</td></tr>}</tbody></table></div></div>
    {resetApiId !== undefined && <Modal title="Reset API quota" onClose={() => setResetApiId(undefined)}><p className="admin-muted mb-4 text-sm">Reset recorded provider usage? This will not change provider billing.</p><div className="mt-4 flex justify-end gap-2"><button className="admin-button" onClick={() => setResetApiId(undefined)}>Cancel</button><button className="admin-button admin-button-primary" onClick={() => void resetQuota()}>Confirm reset</button></div></Modal>}
  </Panel></LocalizedOutput>;
}

function SettingsPage({ onAdminEmailChange }: { onAdminEmailChange: (email: string) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [accountNotice, setAccountNotice] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [keyConfirm, setKeyConfirm] = useState('');
  const [activeSessions, setActiveSessions] = useState<any[] | null>(null);
  useEffect(() => { void adminRequest<{ settings: Settings }>('/api/admin/settings').then((result) => setSettings(result.settings)).catch((cause) => setError(cause.message)); }, []);
  useEffect(() => { void adminRequest<{ email: string }>('/api/admin/account').then((result) => setAdminEmail(result.email)).catch((cause) => setAccountError(errorMessage(cause))); }, []);
  const setNumber = (key: keyof Settings, value: string) => setSettings((current) => current ? { ...current, [key]: Number(value) } : current);
  const saveAdminAccount = async (event: FormEvent) => {
    event.preventDefault();
    setAccountBusy(true);
    setAccountError('');
    setAccountNotice('');
    try {
      const result = await adminRequest<{ email: string }>('/api/admin/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim(), password: adminPassword || undefined }),
      });
      setAdminEmail(result.email);
      onAdminEmailChange(result.email);
      setAdminPassword('');
      setAccountNotice('Admin account settings saved.');
    } catch (cause) {
      setAccountError(errorMessage(cause));
    } finally {
      setAccountBusy(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!settings) return; setBusy(true); setNotice(''); setError('');
    try { await adminRequest('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); setNotice('Settings saved. Runtime limits apply immediately; authentication sessions are managed by Cintra.'); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const rotateKey = async () => {
    setError(''); setNotice('');
    try {     await adminRequest('/api/admin/settings/admin-key', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentKey: keyConfirm, newKey }) }); setKeyConfirm(''); setNewKey(''); setNotice('Protected-action confirmation key updated. Administrator sign-in continues to use Cintra.'); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const numberField = (label: string, key: keyof Settings, min: number, max: number, suffix = '') => <label className="admin-label">{label}<div className="mt-1 flex items-center gap-2"><input className="admin-input w-40" type="number" min={min} max={max} value={settings?.[key] as number ?? ''} onChange={(event) => setNumber(key, event.target.value)} />{suffix && <span className="admin-muted text-xs">{suffix}</span>}</div></label>;
  if (!settings) return <LocalizedOutput><><PageHeading title="Settings & configuration" />{error ? <div className="admin-alert admin-alert-danger">{error}</div> : <p className="admin-muted">Loading settings…</p>}</></LocalizedOutput>;
  return <LocalizedOutput><>
    <PageHeading title="Settings & configuration" description="Changes are validated and stored in the application database." />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}{notice && <div className="admin-alert admin-alert-success mb-4"><Check size={15} />{notice}</div>}
    <Panel className="mb-4 p-5"><h2 className="mb-1 text-sm font-semibold">Admin Settings</h2><p className="admin-muted mb-4 text-xs">Update the administrator login email and password. Passwords are stored as bcrypt hashes; the bootstrap environment password is only used to create the initial account.</p>
      {accountError && <div className="admin-alert admin-alert-danger mb-3">{accountError}</div>}{accountNotice && <div className="admin-alert admin-alert-success mb-3"><Check size={15} />{accountNotice}</div>}
      <form onSubmit={(event) => void saveAdminAccount(event)} className="grid gap-4 sm:grid-cols-2">
        <label className="admin-label">Administrator email<input className="admin-input mt-1" type="email" required autoComplete="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} /></label>
        <label className="admin-label">New password <span className="admin-muted">(leave blank to keep current)</span><input className="admin-input mt-1" type="password" autoComplete="new-password" minLength={12} maxLength={72} value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="At least 12 characters" /></label>
        <div className="sm:col-span-2"><button type="submit" className="admin-button admin-button-primary" disabled={accountBusy || !adminEmail.trim()}>{accountBusy ? 'Saving…' : 'Save admin account'}</button></div>
      </form>
    </Panel>
    <QuotaManagement />
    <form onSubmit={(event) => void save(event)} className="space-y-4">
      <Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">System settings</h2><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{numberField('Daily free message limit', 'dailyMessageLimit', 0, 10000, 'messages / day')}{numberField('Maximum file size', 'maxUploadSizeMb', 1, 50, 'MB per file')}
        <label className="admin-label">Image generation model<input className="admin-input mt-1" value={settings.imageModel} onChange={(event) => setSettings({ ...settings, imageModel: event.target.value })} maxLength={120} placeholder="cf/black-forest-labs/flux-1-schnell" /><small className="admin-muted mt-1 block">Use the exact image model ID supported by your provider. It must accept POST /v1/images/generations; chat-only models will not work.</small></label>
        <label className="admin-toggle"><input type="checkbox" checked={settings.studyModeEnabled} onChange={(event) => setSettings({ ...settings, studyModeEnabled: event.target.checked })} /><span><b>Study Mode</b><small>Globally allow study tools</small></span></label>
        <label className="admin-toggle"><input type="checkbox" checked={settings.guestLoginEnabled} onChange={(event) => setSettings({ ...settings, guestLoginEnabled: event.target.checked })} /><span><b>Guest login</b><small>Allow new guest sessions</small></span></label>
      </div></Panel>
      <Panel className="p-5"><h2 className="mb-4 text-sm font-semibold">Credits & retention</h2><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{numberField('High-tier credits', 'highTierCredits', 0, 100000)}{numberField('Medium-tier credits', 'mediumTierCredits', 0, 100000)}{numberField('Low-tier credits', 'lowTierCredits', 0, 100000)}{numberField('Pro plan price', 'proPlanPrice', 0, 1000000, 'coming soon')}{numberField('Log retention', 'logRetentionDays', 1, 3650, 'days')}</div></Panel>
      <Panel className="p-5"><div className="mb-4 flex items-center gap-2"><Shield size={16} /><h2 className="text-sm font-semibold">Security</h2></div><p className="admin-muted mb-4 text-xs">Local Cintra accounts manage administrator passwords and sessions. The protected-action key confirms sensitive dashboard operations.</p>
        <div className="grid gap-5 sm:grid-cols-2"><div><label className="admin-label">New admin access key<input className="admin-input mt-1" type="password" autoComplete="new-password" minLength={32} value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder="At least 32 characters" /></label><label className="admin-label mt-3">Current key<input className="admin-input mt-1" type="password" autoComplete="current-password" value={keyConfirm} onChange={(event) => setKeyConfirm(event.target.value)} /></label><button type="button" className="admin-button mt-3" disabled={newKey.length < 32 || !keyConfirm} onClick={() => void rotateKey()}><KeyRound size={14} />Change admin key</button></div>
          <div className="admin-detail"><div className="font-medium">Recent account activity</div><p className="admin-muted mt-1 text-xs">Accounts seen in API request logs during the last 24 hours. Admin sign-in uses the local server-managed profile role.</p><button className="admin-button mt-3" type="button" onClick={() => void adminRequest<{ sessions: any[] }>('/api/admin/sessions').then((result) => setActiveSessions(result.sessions)).catch((cause) => setError(cause.message))}><Users size={14} />View recent activity</button></div>
        </div>
        {activeSessions && <div className="admin-table-wrap mt-4"><table className="admin-table"><thead><tr><th>User</th><th>Last activity</th><th>Requests</th></tr></thead><tbody>{activeSessions.map((session) => <tr key={session.userId}><td>{session.email || session.userId}</td><td>{formatDate(session.lastActivity)}</td><td>{session.requestCount}</td></tr>)}{!activeSessions.length && <tr><td colSpan={3} className="admin-muted py-4 text-center">No recent authenticated activity.</td></tr>}</tbody></table></div>}
        <div className="mt-5 border-t admin-border pt-4"><h3 className="text-sm font-medium">IP whitelist</h3><p className="admin-muted mt-1 text-xs">Optional exact IP addresses, comma-separated. CIDR ranges are not accepted.</p><textarea className="admin-input mt-2 min-h-20 w-full resize-y py-2" value={settings.ipWhitelist} onChange={(event) => setSettings({ ...settings, ipWhitelist: event.target.value })} placeholder="127.0.0.1, 203.0.113.10" /></div>
      </Panel>
      <div className="flex justify-end"><button disabled={busy} className="admin-button admin-button-primary">{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  </></LocalizedOutput>;
}

function DatabasePage({ openConfirm }: { openConfirm: (title: string, description: string, action: (key: string) => Promise<void>) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = async () => {
    try { setStats(await adminRequest('/api/admin/database/stats')); setError(''); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  useEffect(() => { void refresh(); }, [refreshKey]);
  return <LocalizedOutput><>
    <PageHeading title="Database management" description="Local SQLite records, uploaded files, persistent-disk backups, and retention cleanup." action={<IconButton label="Refresh database stats" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={16} /></IconButton>} />
    {error && <div className="admin-alert admin-alert-danger mb-4">{error}</div>}{notice && <div className="admin-alert admin-alert-info mb-4">{notice}</div>}
    {stats && <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="admin-panel p-4"><div className="admin-muted text-xs">Estimated SQLite record size</div><div className="mt-2 text-xl font-semibold">{stats.databaseMb} MB</div></div><div className="admin-panel p-4"><div className="admin-muted text-xs">Uploaded files</div><div className="mt-2 text-xl font-semibold">{stats.storageAvailable ? formatBytes(stats.storageBytes) : 'Unavailable'}</div></div><div className="admin-panel p-4"><div className="admin-muted text-xs">Backups</div><div className="mt-2 text-sm font-medium">Persistent host disk</div></div></div>}
    <Panel className="mb-4 overflow-hidden"><div className="flex items-center justify-between border-b admin-border p-4"><h2 className="text-sm font-semibold">Collections & estimated storage</h2><span className="admin-muted text-xs">Estimated from stored values</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Collection</th><th>Documents</th><th>Estimated size</th></tr></thead><tbody>{(stats?.tables || []).map((table: any) => <tr key={table.name}><td className="font-mono text-xs">{table.name}</td><td>{table.rowCount.toLocaleString()}</td><td>{formatBytes(table.estimatedBytes)}</td></tr>)}</tbody></table></div></Panel>
    <Panel className="overflow-hidden"><div className="p-4"><h2 className="text-sm font-semibold">Database backups</h2><p className="admin-muted mt-2 text-sm">SQLite data and uploaded files are stored on the persistent server disk. Configure off-site snapshots with your hosting provider; this application does not automate backups.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t admin-border p-4"><div><div className="text-sm font-medium">Old message cleanup</div><p className="admin-muted mt-1 text-xs">Delete messages older than 90 days and their attachments.</p></div><button className="admin-button admin-button-danger" onClick={() => openConfirm('Clean old messages', 'Delete messages and dependent records older than 90 days?', async (confirmKey) => { const result = await adminRequest<{ deletedMessages: number }>('/api/admin/database/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmKey }) }); setNotice(`${result.deletedMessages} old messages removed.`); setRefreshKey((value) => value + 1); })}><Trash2 size={14} />Clean old data</button></div>
    </Panel>
  </></LocalizedOutput>;
}

export function AdminDashboard() {
  const [route, setRoute] = useState(window.location.pathname);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [adminName, setAdminName] = useState('Zeyad');
  const [language, setLanguage] = useState<AdminLanguage>(() => localStorage.getItem('bayan_admin_language') === 'ar' ? 'ar' : 'en');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    const preference = localStorage.getItem('bayan_theme');
    return preference ? isDarkTheme(readThemePreference()) : localStorage.getItem('bayan_admin_dark') === 'true';
  });
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; action: (key: string) => Promise<void> } | null>(null);
  const [toast, setToast] = useState('');
  const requestsLoading = useAdminLoading();
  activeAdminLanguage = language;
  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    fetch('/api/admin/session', { credentials: 'same-origin' }).then(async (response) => {
      if (!response.ok) { setAuthenticated(false); return; }
      const result = await response.json(); setAdminName(result.adminName || 'Zeyad'); setAuthenticated(true);
    }).catch(() => setAuthenticated(false));
  }, []);
  useEffect(() => {
    localStorage.setItem('bayan_admin_dark', String(dark));
  }, [dark]);
  useEffect(() => {
    localStorage.setItem('bayan_admin_language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  const navigate = (path: string) => {
    window.history.pushState({}, '', path); setRoute(path); setMobileOpen(false);
  };
  const activeSection = (route.split('/')[2] || 'overview') as Section;
  const section = navItems.some((item) => item.id === activeSection) ? activeSection : 'overview';
  const openConfirm = (title: string, description: string, action: (key: string) => Promise<void>) => setConfirmation({ title, description, action });
  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    setAuthenticated(false); navigate('/admin/login');
  };
  if (authenticated === null) return translateAdminNode(<main className={`admin-login-stage ${dark ? 'admin-dark' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}><AdminSpinner label="Checking secure session…" /></main>, language) as React.ReactElement;
  if (!authenticated) return translateAdminNode(<div className={dark ? 'admin-dark' : ''} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}><div className="admin-language-login"><button className="admin-button" onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}>{language === 'ar' ? 'English' : 'العربية'}</button><button type="button" className="admin-button admin-theme-login" onClick={() => {
    const nextDark = !dark;
    setDark(nextDark);
    const nextTheme = nextDark ? 'dark' : 'light';
    saveThemePreference(nextTheme);
  }} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun size={15} /> : <Moon size={15} />}</button></div><LoginPage onLogin={() => { setAuthenticated(true); navigate('/admin/overview'); }} /></div>, language) as React.ReactElement;
  const activeItem = navItems.find((item) => item.id === section)!;
  const ActiveIcon = activeItem.icon;
  const dashboard = <div className={`admin-root ${dark ? 'admin-dark' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
    {mobileOpen && <button className="admin-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`admin-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="admin-sidebar-brand"><img className="admin-brand-mark small" src="/cintra-mark.png" alt="" aria-hidden="true" />{!collapsed && <div><div className="text-sm font-semibold">Cintra</div><div className="admin-muted text-[10px]">Admin workspace</div></div>}<button className="admin-sidebar-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)}><MoreHorizontal size={16} /></button></div>
      <nav className="admin-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} title={collapsed ? label : undefined} className={`admin-nav-item ${section === id ? 'active' : ''}`} onClick={() => navigate(`/admin/${id}`)}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <div className="admin-sidebar-bottom"><div className="admin-admin-identity"><div className="admin-avatar">{adminName.slice(0, 1).toUpperCase()}</div>{!collapsed && <div className="min-w-0"><div className="truncate text-xs font-medium">{adminName}</div><div className="admin-muted text-[10px]">Administrator</div></div>}</div><button className="admin-nav-item" title={collapsed ? 'Logout' : undefined} onClick={() => void logout()}><LogOut size={16} /><span>Logout</span></button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><div className="flex min-w-0 items-center gap-3"><IconButton label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={18} /></IconButton><div className="flex items-center gap-2"><ActiveIcon size={16} className="admin-muted" /><span className="truncate text-sm font-medium">{activeItem.label}</span></div></div><div className="flex items-center gap-2">{requestsLoading && <AdminSpinner label="Loading…" />}<span className="admin-muted hidden text-xs sm:inline">Cintra admin session</span><button type="button" className="admin-button admin-language-toggle" onClick={() => setLanguage((current) => current === 'ar' ? 'en' : 'ar')} aria-label={language === 'ar' ? 'Switch to English' : 'Switch to Arabic'}>{language === 'ar' ? 'English' : 'العربية'}</button><IconButton label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => {
        const nextDark = !dark;
        setDark(nextDark);
        const nextTheme = nextDark ? 'dark' : 'light';
        saveThemePreference(nextTheme);
      }}>{dark ? <Sun size={16} /> : <Moon size={16} />}</IconButton></div></header>
      <div className="admin-content" aria-busy={requestsLoading}>
        {section === 'overview' && <OverviewPage />}
        {section === 'users' && <UsersPage openConfirm={openConfirm} />}
        {section === 'admins' && <AdminUsersPage openConfirm={openConfirm} />}
        {section === 'apis' && <ApisPage openConfirm={openConfirm} />}
        {section === 'models' && <ModelsPage openConfirm={openConfirm} />}
        {section === 'content' && <ContentPage openConfirm={openConfirm} />}
        {section === 'announcements' && <AnnouncementPage />}
        {section === 'logs' && <LogsPage />}
        {section === 'settings' && <SettingsPage onAdminEmailChange={setAdminName} />}
        {section === 'database' && <DatabasePage openConfirm={openConfirm} />}
      </div>
    </main>
    {confirmation && <ConfirmationDialog title={confirmation.title} description={confirmation.description} onConfirm={confirmation.action} onClose={() => setConfirmation(null)} />}
    {toast && <div role="status" className="admin-toast">{toast}</div>}
  </div>;
  return translateAdminNode(dashboard, language) as React.ReactElement;
}
