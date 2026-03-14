import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function AdminRoute({ children }) {
  const { isAuthenticated, isCheckingSession } = useAuth();

  if (isCheckingSession) {
    return (
      <div className="route-loading-shell">
        <div className="route-loading-card">Checking admin session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
