import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

interface AuthCardProps {
  onSuccess?: (verificationEmailSent?: boolean) => void;
}

export function AuthCard({ onSuccess }: AuthCardProps) {
  const { login, signup, sendEmailLoginCode, loginWithEmailCode, continueAsGuest } = useAuth();
  const { t, currentLang, setLanguageMode, isRtl } = useLanguage();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset' | 'otp' | 'otp-verify'>(() => (
    new URLSearchParams(window.location.search).get('mode') === 'resetPassword'
      || new URLSearchParams(window.location.search).has('secret')
      || new URLSearchParams(window.location.hash.replace(/^#/, '')).get('mode') === 'resetPassword'
      || new URLSearchParams(window.location.hash.replace(/^#/, '')).has('secret')
      ? 'reset'
      : 'login'
  ));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const handleGuestLogin = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const res = await continueAsGuest(currentLang);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to start guest session');
      } else {
        onSuccess?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start guest session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResetSuccess(null);
    setIsSubmitting(true);

    try {
      if (mode === 'signup') {
        const res = await signup(email, password, name.trim() || undefined);
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to sign up');
        } else {
          onSuccess?.(res.verificationEmailSent);
        }
      } else if (mode === 'login') {
        const res = await login(email, password);
        if (!res.success) {
          setErrorMsg(res.error || 'Invalid credentials');
        } else {
          onSuccess?.();
        }
      } else if (mode === 'otp') {
        const res = await sendEmailLoginCode(email);
        if (!res.success) {
          setErrorMsg(res.error || 'Could not send a sign-in code.');
        } else {
          setMode('otp-verify');
          setResetSuccess(currentLang === 'ar'
            ? 'إذا كان الحساب موجودًا، فسيصل رمز تسجيل الدخول إلى بريدك.'
            : 'If an account exists, a sign-in code will be sent to your email.');
        }
      } else if (mode === 'otp-verify') {
        const res = await loginWithEmailCode(email, otpCode);
        if (!res.success) {
          setErrorMsg(res.error || 'Could not sign in with this code.');
        } else {
          onSuccess?.();
        }
      } else if (mode === 'reset') {
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const userId = query.get('userId') || hash.get('userId');
        const token = query.get('secret') || hash.get('secret');
        if (!userId || !token) throw new Error('The password reset link is invalid or has expired.');
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, userId, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Could not reset the password.');
        window.history.replaceState(null, '', window.location.pathname);
        setPassword('');
        setMode('login');
        setResetSuccess(data.message || 'Password updated. You can now sign in.');
      } else if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok) {
          setResetSuccess(data.message || 'Reset link dispatched');
        } else {
          setErrorMsg(data.error?.message || 'Error requesting reset');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center p-4 bg-[#fafafa]">
      {/* Primary Authentication Capsule */}
      <div className="w-full max-w-[440px] bg-white rounded-2xl p-8 sm:p-10 shadow-[0_2px_16px_rgba(0,0,0,0.04)] border border-[#e5e5e5] transition-all duration-300">
        {/* Wordmark Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="h-8 mb-6 flex items-center justify-center gap-2 select-none">
            <span className="text-xl font-bold tracking-tight text-neutral-900 font-sans">
              Cintra
            </span>
            <span className="text-neutral-300 font-light">|</span>
            <span className="text-2xl font-bold text-neutral-900 font-heading">
              Cintra
            </span>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">
              {mode === 'forgot'
                ? t('forgotPasswordTitle')
                    : mode === 'reset'
                    ? 'Choose a new password'
                    : mode === 'otp' || mode === 'otp-verify'
                    ? currentLang === 'ar' ? 'تسجيل الدخول برمز البريد' : 'Sign in with an email code'
                    : mode === 'signup'
                ? currentLang === 'ar'
                  ? 'إنشاء حساب في Cintra'
                  : 'Welcome to Cintra'
                : t('welcomeTitle')}
            </h1>
            <p className="text-base text-neutral-500 font-normal">
              {mode === 'forgot'
                ? t('forgotPasswordDesc')
                : mode === 'reset'
                ? 'Set a new password for your Cintra account.'
                : mode === 'otp' || mode === 'otp-verify'
                ? currentLang === 'ar' ? 'أرسل رمزًا مؤقتًا إلى بريدك لإكمال تسجيل الدخول.' : 'Get a one-time code by email to complete sign-in.'
                : mode === 'signup'
                ? currentLang === 'ar'
                  ? 'انضم إلى الجيل القادم من الذكاء الاصطناعي ثنائي اللغة'
                  : 'Join the next generation of bilingual intelligence'
                : t('loginSubtitle')}
            </p>
          </div>
        </div>

        {(mode === 'login' || mode === 'signup') && (
          <>
            {/* Mode Selector Tabs (Sign In / Create Account) */}
            <div className="mt-6 p-1 bg-neutral-100 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 text-sm rounded-lg transition-all duration-200 font-medium text-center ${
                  mode === 'login'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {t('signInTab')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 text-sm rounded-lg transition-all duration-200 font-medium text-center ${
                  mode === 'signup'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {t('createAccountTab')}
              </button>
            </div>

          </>
        )}

        {/* Feedback message banner */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs leading-relaxed">
            {errorMsg}
          </div>
        )}

        {resetSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs leading-relaxed">
            {resetSuccess}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="flex flex-col space-y-1.5 text-left">
              <label
                htmlFor="name"
                className={`text-xs font-medium text-neutral-700 ${isRtl ? 'text-right' : 'text-left'}`}
              >
                {t('fullNameLabel')}
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('fullNamePlaceholder')}
                className="w-full h-11 px-3.5 bg-white text-neutral-900 text-sm rounded-xl border border-[#e5e5e5] focus:outline-none focus:border-neutral-900 transition-colors placeholder:text-neutral-400"
              />
            </div>
          )}

          {mode !== 'reset' && <div className="flex flex-col space-y-1.5">
            <label
              htmlFor="email"
              className={`text-xs font-medium text-neutral-700 ${isRtl ? 'text-right' : 'text-left'}`}
            >
              {t('emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="w-full h-11 px-3.5 bg-white text-neutral-900 text-sm rounded-xl border border-[#e5e5e5] focus:outline-none focus:border-neutral-900 transition-colors placeholder:text-neutral-400"
            />
          </div>}

          {(mode === 'login' || mode === 'signup') && (
            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-neutral-700">
                  {t('passwordLabel')}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg(null);
                    }}
                    className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
                  >
                    {t('forgotPasswordLink')}
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 px-3.5 bg-white text-neutral-900 text-sm rounded-xl border border-[#e5e5e5] focus:outline-none focus:border-neutral-900 transition-colors placeholder:text-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute ${isRtl ? 'left-3' : 'right-3'} text-neutral-400 hover:text-neutral-700 transition-colors`}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {mode === 'otp-verify' && (
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="email-otp" className={`text-xs font-medium text-neutral-700 ${isRtl ? 'text-right' : 'text-left'}`}>
                {currentLang === 'ar' ? 'رمز تسجيل الدخول' : 'Sign-in code'}
              </label>
              <input
                id="email-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full h-11 px-3.5 bg-white text-neutral-900 text-sm tracking-[0.3em] text-center rounded-xl border border-[#e5e5e5] focus:outline-none focus:border-neutral-900 transition-colors placeholder:text-neutral-400"
              />
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-neutral-950 text-white text-sm font-medium rounded-xl hover:bg-neutral-800 active:bg-black transition-colors duration-150 flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : mode === 'forgot' ? (
                t('sendResetLink')
              ) : mode === 'otp' ? (
                currentLang === 'ar' ? 'إرسال رمز الدخول' : 'Send sign-in code'
              ) : mode === 'otp-verify' ? (
                currentLang === 'ar' ? 'تسجيل الدخول بالرمز' : 'Sign in with code'
              ) : mode === 'reset' ? (
                'Update password'
              ) : mode === 'signup' ? (
                t('createAccountButton')
              ) : (
                t('continueButton')
              )}
            </button>
          </div>
        </form>

        {/* Context Switcher */}
        <div className="mt-5 text-center">
          {mode === 'forgot' || mode === 'reset' ? (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setResetSuccess(null);
              }}
              className="text-xs text-neutral-600 hover:text-neutral-950 font-medium hover:underline"
            >
              {t('backToLogin')}
            </button>
          ) : mode === 'otp' || mode === 'otp-verify' ? (
            <div className="flex items-center justify-center gap-4 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setOtpCode('');
                  setErrorMsg(null);
                  setResetSuccess(null);
                }}
                className="text-neutral-600 hover:text-neutral-950 font-medium hover:underline"
              >
                {currentLang === 'ar' ? 'العودة لتسجيل الدخول بكلمة المرور' : 'Back to password sign-in'}
              </button>
              {mode === 'otp-verify' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('otp');
                    setOtpCode('');
                    setErrorMsg(null);
                    setResetSuccess(null);
                  }}
                  className="text-neutral-600 hover:text-neutral-950 font-medium hover:underline"
                >
                  {currentLang === 'ar' ? 'إعادة إرسال الرمز' : 'Resend code'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              {mode === 'signup' ? t('alreadyHaveAccount') : t('dontHaveAccount')}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signup' ? 'login' : 'signup');
                  setErrorMsg(null);
                }}
                className="text-neutral-950 font-medium hover:underline ml-1"
              >
                {mode === 'signup' ? t('signInAction') : t('signUpAction')}
              </button>
            </p>
          )}
        </div>

        {mode === 'login' && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => {
                setMode('otp');
                setErrorMsg(null);
                setResetSuccess(null);
              }}
              className="text-xs text-neutral-600 hover:text-neutral-950 font-medium hover:underline"
            >
              {currentLang === 'ar' ? 'تسجيل الدخول برمز على البريد' : 'Sign in with an email code'}
            </button>
          </div>
        )}

        {/* Skip Login / Continue as Guest */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="mt-4 pt-3 border-t border-[#f0f0f0] text-center">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGuestLogin}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 font-medium py-1.5 px-3 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <span>{t('continueAsGuest')}</span>
              <span className="text-neutral-300">·</span>
              <span className="text-[11px] text-neutral-400">{t('skipForNow')}</span>
            </button>
          </div>
        )}

        {/* Fine Print Links */}
        <div className="mt-7 pt-4 border-t border-[#e5e5e5] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <span className="text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer">
            {t('termsOfService')}
          </span>
          <span className="text-neutral-300 text-[10px]">•</span>
          <span className="text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer">
            {t('privacyPolicy')}
          </span>
          <span className="text-neutral-300 text-[10px]">•</span>
          <span className="text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer">
            {t('security')}
          </span>
        </div>
      </div>

      {/* Floating Bottom Language Switcher */}
      <div className="mt-5 flex items-center justify-center">
        <div className="inline-flex items-center bg-white p-1 rounded-full border border-[#e5e5e5] shadow-sm">
          <button
            type="button"
            onClick={() => setLanguageMode('en')}
            className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
              currentLang === 'en'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguageMode('ar')}
            className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
              currentLang === 'ar'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            العربية
          </button>
        </div>
      </div>
    </div>
  );
}
