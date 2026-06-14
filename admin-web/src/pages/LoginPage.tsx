import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
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
      <div className="pointer-events-none lg:block sm:hidden absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-50" />
      <div className="pointer-events-none lg:block sm:hidden absolute bottom-0 left-0 h-64 w-64 rounded-full bg-green-50" />

      <div className="hidden flex-1 flex-col justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 px-16 lg:flex">
        <div className="max-w-md">
          <div className="mb-4 flex h-30 w-30 items-center justify-center">
            <img src={logo} alt='GenieClasses'/>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Manage your teaching community
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Broadcast messages, share documents, chat with teachers, and organize groups — all in one
            professional workspace.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Secure admin access
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Real-time teacher communication
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Document & broadcast delivery
            </li>
          </ul>
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <form
          onSubmit={handleSubmit}
          className="gc-card w-full max-w-md p-6 shadow-lg sm:p-8"
        >
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center bg-white shadow-lg justify-center rounded-2xl lg:mx-0">
              {/* <ShieldUser className="h-7 w-7 text-white" strokeWidth={2} />  */}
              <img src={logo} alt='GenieClasses' className="h-14 w-14" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Genieclasses Teachers Portal</h1>
            <p className="mt-1 text-sm text-slate-500">{mode === 'login' ? 'Admin sign in' : 'Create an account'}</p>
          </div>

          {error ? (
            <p className={`mb-4 rounded-xl border px-3 py-2.5 text-sm ${
              error.includes('created') ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'
            }`}>
              {error}
            </p>
          ) : null}

          {mode === 'signup' && (
            <>
              <div className="mb-4">
                <label className="gc-label" htmlFor="displayName">
                  Full Name
                </label>
                <input
                  id="displayName"
                  className="gc-input"
                  type="text"
                  placeholder="John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="gc-label">Role</label>
                <div className="flex gap-2">
                  {(['teacher', 'coordinator'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                        role === r ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="gc-label" htmlFor="email">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                className="gc-input pl-10"
                type="email"
                placeholder="admin@genieclasses.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="gc-label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                className="gc-input pl-10 pr-10"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
              />
              Remember me
            </label>
          </div>

          <button type="submit" disabled={loading} className="gc-btn-primary w-full py-3">
            {loading ? 'Processing…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-sm font-medium text-green-600 hover:text-green-700"
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
  );
}
