import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(!!s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLoggedIn={() => setSession(true)} />;
  }

  return (
    <DashboardPage
      onSignOut={async () => {
        await supabase.auth.signOut();
        setSession(false);
      }}
    />
  );
}
