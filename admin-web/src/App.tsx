import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { TeachersPage } from './pages/TeachersPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { BroadcastsPage } from './pages/BroadcastsPage';
import { GroupsPage } from './pages/GroupsPage';
import { DashboardPage } from './pages/DashboardPage';
import { TasksPage } from './pages/TasksPage';
import { AttendancePage } from './pages/AttendancePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { UsersPage } from './pages/UsersPage';
import { CoordinatorsPage } from './pages/CoordinatorsPage';
import { StudentsPage } from './pages/StudentsPage';
import { ChatPage } from './pages/ChatPage';
import { useAuth } from './core/auth/AuthContext';
import { ProtectedRoute, RoleGuard } from './core/auth/RoleGuard';
import { UnreadMessagesProvider } from './core/hooks/UnreadMessagesContext';

export default function App() {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            session && profile && ['admin', 'coordinator', 'teacher'].includes(profile.role) ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage onLoggedIn={() => {}} />
            )
          }
        />
        
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <UnreadMessagesProvider>
                <AdminLayout onSignOut={signOut} />
              </UnreadMessagesProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="users" element={
            <RoleGuard allowedRoles={['admin']}>
              <UsersPage />
            </RoleGuard>
          } />
          <Route path="coordinators" element={
            <RoleGuard allowedRoles={['admin']}>
              <CoordinatorsPage />
            </RoleGuard>
          } />
          <Route path="students" element={
            <RoleGuard allowedRoles={['admin', 'coordinator']}>
              <StudentsPage />
            </RoleGuard>
          } />
          <Route path="teachers" element={
            <RoleGuard allowedRoles={['admin', 'coordinator']}>
              <TeachersPage />
            </RoleGuard>
          } />
          <Route path="groups" element={
            <RoleGuard allowedRoles={['admin', 'coordinator', 'teacher']}>
              <GroupsPage />
            </RoleGuard>
          } />
          <Route path="broadcasts" element={
            <RoleGuard allowedRoles={['admin']}>
              <BroadcastsPage />
            </RoleGuard>
          } />
          <Route path="documents" element={
            <RoleGuard allowedRoles={['admin', 'coordinator', 'teacher']}>
              <DocumentsPage />
            </RoleGuard>
          } />
          <Route path="tasks" element={
            <RoleGuard allowedRoles={['admin', 'coordinator']}>
              <TasksPage />
            </RoleGuard>
          } />
          <Route path="attendance" element={
            <RoleGuard allowedRoles={['admin', 'coordinator', 'teacher']}>
              <AttendancePage />
            </RoleGuard>
          } />
          <Route path="chat" element={
            <RoleGuard allowedRoles={['admin', 'coordinator', 'teacher']}>
              <ChatPage />
            </RoleGuard>
          } />
          
          {/* Admin only routes */}
          <Route path="analytics" element={
             <RoleGuard allowedRoles={['admin', 'coordinator']}>
               <AnalyticsPage />
             </RoleGuard>
           } />
          
          <Route path="settings" element={
            <RoleGuard allowedRoles={['admin']}>
              <div className="p-8 text-slate-500">Settings Module (Coming Soon)</div>
            </RoleGuard>
          } />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
