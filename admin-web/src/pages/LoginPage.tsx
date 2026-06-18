import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import type { UserRole } from '../../../shared/types';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (mode === 'signup') {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName,
            role: role,
          }
        }
      });
      if (signUpErr) {
        setError(signUpErr.message);
        setLoading(false);
        return;
      }
      setMode('login');
      setError('Account created! Please check your email for verification, then sign in.');
      setLoading(false);
      return;
    }

    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signErr) {
      setError(signErr.message);
      setLoading(false);
      return;
    }

    const { data: user } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.user!.id)
      .single();

    const allowedRoles = ['admin', 'coordinator', 'teacher'];
    if (!profile || !allowedRoles.includes(profile.role)) {
      await supabase.auth.signOut();
      setError('Unauthorized access. Please contact your administrator.');
      setLoading(false);
      return;
    }

    setLoading(false);
    onLoggedIn();
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-white">
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed -right-32 -top-32 h-96 w-96 rounded-full bg-green-50/60" aria-hidden="true" />
      <div className="pointer-events-none fixed -bottom-32 -left-32 h-96 w-96 rounded-full bg-blue-50/60" aria-hidden="true" />

      {/* Left: Branding */}
      <div className="hidden flex-1 flex-col justify-center bg-gradient-to-br from-green-50/40 via-white to-blue-50/40 px-16 lg:flex">
        <div className="mx-auto max-w-md">
          <div className="mb-6">
            <img src={logo} alt="GenieClasses" className="h-16 w-auto" />
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">
            Manage your teaching community
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Broadcast messages, share documents, chat with teachers, and organize groups — all in one
            professional workspace.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-slate-600">
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
              </span>
              Secure admin access
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
              </span>
              Real-time teacher communication
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
              </span>
              Document & broadcast delivery
            </li>
          </ul>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex w-full flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <img src={logo} alt="GenieClasses" className="mx-auto h-14 w-auto" />
          </div>

          <form onSubmit={handleSubmit} className="card p-8 shadow-lg sm:p-10">
            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-sm lg:mx-0">
                <ShieldCheck className="h-6 w-6 text-white" strokeWidth={2} aria-hidden="true" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">GenieClasses Teachers Portal</h1>
              <p className="mt-1 text-sm text-slate-500">
                {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
              </p>
            </div>

            {error ? (
              <div
                className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
                  error.includes('created')
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
                role="alert"
              >
                {error}
              </div>
            ) : null}

            {mode === 'signup' && (
              <>
                <div className="mb-5">
                  <label className="label" htmlFor="displayName">
                    Full Name
                  </label>
                  <input
                    id="displayName"
                    className="input"
                    type="text"
                    placeholder="John Doe"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="mb-5">
                  <span className="label">Role</span>
                  <div className="flex gap-3" role="radiogroup" aria-label="Select role">
                    {(['teacher', 'coordinator'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`flex-1 rounded-lg border py-2.5 text-sm font-medium capitalize transition-all ${
                          role === r
                            ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                        role="radio"
                        aria-checked={role === r}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="mb-5">
              <label className="label" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="email"
                  className="input pl-10"
                  type="email"
                  placeholder="admin@genieclasses.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="password"
                  className="input pl-10 pr-10"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="mb-6 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-green-500"
                />
                Remember me
              </label>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                  Processing…
                </span>
              ) : mode === 'login' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setError('');
                }}
                className="text-sm font-medium text-blue-600 hover:text-green-700 transition-colors"
              >
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>

            <p className="mt-6 text-center text-xs text-slate-400">
              Teachers should use the mobile app to sign in.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
