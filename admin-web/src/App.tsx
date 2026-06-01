import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { TeachersPage } from './pages/TeachersPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { BroadcastsPage } from './pages/BroadcastsPage';
import { GroupsPage } from './pages/GroupsPage';

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLoggedIn={() => setSession(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <AdminLayout
              onSignOut={async () => {
                await supabase.auth.signOut();
                setSession(false);
              }}
            />
          }
        >
          <Route index element={<TeachersPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="broadcasts" element={<BroadcastsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
