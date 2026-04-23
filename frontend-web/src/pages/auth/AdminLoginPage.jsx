import { useState } from "react";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/common/AuthLayout";
import { useAuth } from "../../features/auth/useAuth";
import { ApiError } from "../../services/httpClient";
import "../../styles/admin-login.css";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setErrorKind("none");

    if (!username.trim() || !password.trim()) {
      setErrorKind("validation");
      setErrorMessage("Please enter both username and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn(username.trim(), password);
      navigate("/admin/dashboard", { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setErrorKind("rateLimit");
        setErrorMessage(error.message || "Too many attempts. Please wait before trying again.");
      } else if (error instanceof ApiError && error.status === 403) {
        setErrorKind("forbidden");
        setErrorMessage(error.message || "Access denied.");
      } else {
        setErrorKind("error");
        setErrorMessage(error.message || "Unable to log in.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Control Room Access"
      subtitle="Use an account with an admin role to continue."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="admin.username"
          className="auth-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />

        <label className="auth-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          className="auth-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {errorMessage && (
          <div
            className={
              errorKind === "rateLimit"
                ? "auth-alert auth-alert--rate-limit"
                : errorKind === "validation"
                  ? "auth-alert auth-alert--validation"
                  : errorKind === "forbidden"
                    ? "auth-alert auth-alert--forbidden"
                    : "auth-alert auth-alert--error"
            }
            role="alert"
          >
            {errorKind === "rateLimit" ? (
              <ShieldAlert className="auth-alert__icon" aria-hidden />
            ) : (
              <AlertCircle className="auth-alert__icon" aria-hidden />
            )}
            <p className="auth-alert__text">{errorMessage}</p>
          </div>
        )}

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </AuthLayout>
  );
}
