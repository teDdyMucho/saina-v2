import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/useAuthStore'
import { Layout } from './components/Layout'
import ModernLogin from './features/auth/ModernLogin'
import EmployeeRegister from './features/auth/EmployeeRegister'
import { EmployeeHome } from './features/employee/EmployeeHome'
import { Timesheet } from './features/employee/Timesheet'
import SelfieCapture from './features/employee/SelfieCapture'
import { AdminDashboardPage } from './features/admin/AdminDashboardPage'
import { Schedules } from './features/admin/Schedules'
import { Reports } from './features/admin/Reports'
import ReportUserDetail from './features/admin/ReportUserDetail'
import ProfilePage from './features/profile/ProfilePage'

function ProtectedRoute({
  children,
  requireAuth = true,
  requireRole,
}: {
  children: React.ReactNode
  requireAuth?: boolean
  requireRole?: 'admin' | 'employee'
}) {
  const { isAuthenticated, user } = useAuthStore()

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requireRole && user?.role !== requireRole) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/employee'} replace />
  }

  return <>{children}</>
}

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/employee" replace />
            ) : (
              <ModernLogin />
            )
          }
        />
        
        {/* Registration is admin-only now; public route removed */}

        {/* Employee Routes */}
        <Route
          path="/employee"
          element={
            <ProtectedRoute requireRole="employee">
              <Layout>
                <EmployeeHome />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/selfie"
          element={
            <ProtectedRoute requireRole="employee">
              {/* Standalone capture without layout for cleaner mobile UI */}
              <SelfieCapture />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/timesheet"
          element={
            <ProtectedRoute requireRole="employee">
              <Layout>
                <Timesheet />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <AdminDashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        {/* Admin: Add New Employee */}
        <Route
          path="/admin/employees/new"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <EmployeeRegister />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/schedules"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <Schedules />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports/:userName"
          element={
            <ProtectedRoute requireRole="admin">
              <Layout>
                <ReportUserDetail />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Profile */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
