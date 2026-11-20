import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RoleCode, useAuth } from './context/AuthContext';
import { AppShell } from './components/Navbar';
import { GlobalErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/DesignSystem';
import { InitialAppLoader } from './components/brand/MarkSureLoader';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { StudentDashboard } from './pages/StudentDashboard';
import { MarksheetPage } from './pages/MarksheetPage';
import { VerifyPage } from './pages/VerifyPage';
import { CorrectionsPage } from './pages/CorrectionsPage';
import { AuditDashboardPage } from './pages/AuditDashboardPage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import {
  ForbiddenPage,
  NotFoundPage,
  ServerErrorPage,
  ServiceUnavailablePage,
} from './pages/ErrorPages';

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: RoleCode[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <InitialAppLoader message="Securing your academic records" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role_code)) {
    return <ForbiddenPage requiredRole={allowedRoles.join(' or ')} />;
  }

  return <>{children}</>;
}

function RootStartupGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return <InitialAppLoader message="Securing your academic records" />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppShell>
              <RootStartupGate>
                <Routes>
                  {/* Redesigned Homepage & Hero */}
                  <Route path="/" element={<HomePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/verify" element={<VerifyPage />} />
                  <Route path="/verify/:resultId" element={<VerifyPage />} />

                  <Route
                    path="/registry"
                    element={
                      <ProtectedRoute
                        allowedRoles={['ADMIN', 'APPROVER_1', 'APPROVER_2']}
                      >
                        <AdminDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/student"
                    element={
                      <ProtectedRoute allowedRoles={['STUDENT']}>
                        <StudentDashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/marksheet/:resultId"
                    element={
                      <ProtectedRoute>
                        <MarksheetPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/corrections"
                    element={
                      <ProtectedRoute
                        allowedRoles={['ADMIN', 'APPROVER_1', 'APPROVER_2']}
                      >
                        <CorrectionsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/audit"
                    element={
                      <ProtectedRoute
                        allowedRoles={['ADMIN', 'APPROVER_1', 'APPROVER_2']}
                      >
                        <AuditDashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <AccountSettingsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Dedicated HTTP Error Views */}
                  <Route path="/403" element={<ForbiddenPage />} />
                  <Route path="/500" element={<ServerErrorPage />} />
                  <Route path="/503" element={<ServiceUnavailablePage />} />

                  {/* 404 Catch-All Fallback */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </RootStartupGate>
            </AppShell>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </GlobalErrorBoundary>
  );
}
