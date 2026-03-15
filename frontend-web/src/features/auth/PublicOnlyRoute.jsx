import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isCheckingSession } = useAuth();

  if (isCheckingSession) {
    return (
      <div className="route-loading-shell">
        <div className="route-loading-card">Preparing admin portal...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}
