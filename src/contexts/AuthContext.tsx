import React, { createContext, useContext, useEffect, useState } from 'react';

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: string | null;
  avatar: string | null;
  isGuest?: boolean;
  languagePreference: 'auto' | 'ar' | 'en';
  customInstructions: string | null;
  tone: 'Formal' | 'Conversational' | 'Creative' | 'Academic' | 'Professional';
  responseLength: 'Brief' | 'Normal' | 'Detailed';
  writingStyle: 'Simple' | 'Technical' | 'Poetic' | 'Casual';
  languageVariant: string | null;
  theme: 'light' | 'dark' | 'auto';
  accentColor: string;
  creditBalance: number;
  studyModeEnabled: boolean;
  highlightUserMessages: boolean;
  highlightAssistantAnswers: boolean;
  userMessageHighlightColor: string;
  assistantAnswerHighlightColor: string;
  voiceEnabled: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  preferredLanguage: string;
  plan: 'free' | 'pro' | 'pro_plus';
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  emailVerified: boolean | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string; verificationEmailSent?: boolean }>;
  sendEmailLoginCode: (email: string) => Promise<{ success: boolean; error?: string }>;
  loginWithEmailCode: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  continueAsGuest: (languagePreference?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<boolean>;
  refreshUser: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const guestDeviceStorageKey = 'bayan.guest-device-id';

type ApiResponse<T> = T & { error?: { message?: string; messageAr?: string } };

async function readResponse<T>(response: Response): Promise<ApiResponse<T>> {
  return response.json().catch(() => ({} as ApiResponse<T>));
}

function authErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return 'Could not connect. Check your internet connection and try again.';
  return fallback;
}

async function fetchCookieSession(): Promise<User | null> {
  const response = await fetch('/api/auth/me');
  if (response.status === 401 || response.status === 403) return null;
  const data = await readResponse<{ user: User }>(response);
  if (!response.ok) throw new Error(data.error?.message || 'Could not restore your session.');
  return data.user || null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const updateCurrentUser = (current: User | null) => {
    setUser(current);
    setEmailVerified(current ? Boolean(current.emailVerified) : null);
  };

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const resetPending = params.get('mode') === 'resetPassword' || hash.get('mode') === 'resetPassword';

    const restore = async () => {
      if (resetPending) return null;
      return fetchCookieSession();
    };

    void restore().then((current) => {
      if (active) updateCurrentUser(current);
    }).catch((error) => {
      console.error('Could not restore the current local session:', error);
      if (active) updateCurrentUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await readResponse<{ user: User }>(response);
      if (response.ok && data.user) {
        updateCurrentUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error?.message || 'Could not sign in. Please try again.' };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Could not sign in. Please try again.') };
    }
  };

  const signup = async (email: string, password: string, name?: string) => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, name: name?.trim() }),
      });
      const data = await readResponse<{ user: User; verificationEmailSent?: boolean }>(response);
      if (response.ok && data.user) {
        updateCurrentUser(data.user);
        return { success: true, verificationEmailSent: data.verificationEmailSent === true };
      }
      return { success: false, error: data.error?.message || 'Could not create your account. Please try again.' };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Could not create your account. Please try again.') };
    }
  };

  const sendEmailLoginCode = async (email: string) => {
    try {
      const response = await fetch('/api/auth/email-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await readResponse<unknown>(response);
      return response.ok
        ? { success: true }
        : { success: false, error: data.error?.message || 'Could not send the sign-in code. Please try again.' };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Could not send the sign-in code. Please try again.') };
    }
  };

  const loginWithEmailCode = async (email: string, code: string) => {
    try {
      const response = await fetch('/api/auth/email-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await readResponse<{ user: User }>(response);
      if (response.ok && data.user) {
        updateCurrentUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error?.message || 'The sign-in code is invalid or expired.' };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Could not complete email sign-in. Please try again.') };
    }
  };

  const continueAsGuest = async (languagePreference?: string) => {
    try {
      const response = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: getGuestDeviceId(),
          languagePreference: languagePreference || 'auto',
        }),
      });
      const data = await readResponse<{ user: User }>(response);
      if (!response.ok || !data.user) {
        return { success: false, error: data.error?.message || 'Guest session creation failed.' };
      }
      updateCurrentUser(data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Could not start a guest session. Please try again.') };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      updateCurrentUser(null);
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) return false;
      const result = await readResponse<{ user: User }>(response);
      if (!result.user) return false;
      updateCurrentUser(result.user);
      return true;
    } catch {
      return false;
    }
  };

  const refreshUser = async () => {
    try {
      updateCurrentUser(await fetchCookieSession());
    } catch (error) {
      console.error('Could not refresh the current local session:', error);
    }
  };

  const sendVerificationEmail = async () => {
    const response = await fetch('/api/auth/verification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await readResponse<unknown>(response);
    if (!response.ok) throw new Error(data.error?.message || 'Could not send the verification email. Please try again.');
  };

  const refreshEmailVerification = async (): Promise<boolean> => {
    await refreshUser();
    const current = await fetchCookieSession();
    if (!current) {
      updateCurrentUser(null);
      return false;
    }
    updateCurrentUser(current);
    return Boolean(current.emailVerified);
  };

  const getGuestDeviceId = (): string => {
    const existing = window.localStorage.getItem(guestDeviceStorageKey);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(guestDeviceStorageKey, generated);
    return generated;
  };

  return (
    <AuthContext.Provider value={{
      user,
      emailVerified,
      loading,
      login,
      signup,
      sendEmailLoginCode,
      loginWithEmailCode,
      continueAsGuest,
      logout,
      updateProfile,
      refreshUser,
      sendVerificationEmail,
      refreshEmailVerification,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
