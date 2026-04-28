import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminRoute } from "../features/auth/AdminRoute";
import { PublicOnlyRoute } from "../features/auth/PublicOnlyRoute";
import { AdminDashboardPage } from "../pages/main/AdminDashboardPage";
import { DisputeCenterPage } from "../pages/main/DisputeCenterPage";
import { AdminLoginPage } from "../pages/auth/AdminLoginPage";
import { RequestsBookingsPage } from "../pages/main/RequestsBookingsPage";
import { ServiceCatalogPage } from "../pages/main/ServiceCatalogPage";
import { TrustSafetyPage } from "../pages/main/TrustSafetyPage";
import { UserManagementPage } from "../pages/main/UserManagementPage";
import { VerificationQueuePage } from "../pages/main/VerificationQueuePage";
import { WalletTokenLedgerPage } from "../pages/main/WalletTokenLedgerPage";
import { VehicleManagementPage } from "../pages/main/VehicleManagementPage";
import { TransactionsOverviewPage } from "../pages/main/TransactionsOverviewPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route
          path="/admin/login"
          element={
            <PublicOnlyRoute>
              <AdminLoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <UserManagementPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/verification"
          element={
            <AdminRoute>
              <VerificationQueuePage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/bookings"
          element={
            <AdminRoute>
              <RequestsBookingsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/services"
          element={
            <AdminRoute>
              <ServiceCatalogPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/trust"
          element={
            <AdminRoute>
              <TrustSafetyPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/disputes"
          element={
            <AdminRoute>
              <DisputeCenterPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/wallet"
          element={
            <AdminRoute>
              <WalletTokenLedgerPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/transactions"
          element={
            <AdminRoute>
              <TransactionsOverviewPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/vehicles"
          element={
            <AdminRoute>
              <VehicleManagementPage />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
