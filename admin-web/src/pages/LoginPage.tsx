import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldUser, Lock, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
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

    if (profile?.role !== 'admin') {
      await supabase.auth.signOut();
      setError('This account is not an admin. Use the mobile app for teachers.');
      setLoading(false);
      return;
    }

    setLoading(false);
    onLoggedIn();
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-50" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 rounded-full bg-green-50" />

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

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="gc-card w-full max-w-md p-8 shadow-lg"
        >
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center bg-blue-500 justify-center rounded-2xl lg:mx-0">
              <ShieldUser className="h-7 w-7 text-white" strokeWidth={2} /> 
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Genieclasses Teachers Portal</h1>
            <p className="mt-1 text-sm text-slate-500">Admin sign in</p>
          </div>

          {error ? (
            <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          ) : null}

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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-6 text-center text-xs text-slate-400">
            Teachers should use the mobile app to sign in.
          </p>
        </form>
      </div>
    </div>
  );
}
