import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/common/AuthLayout";
import { useAuth } from "../../features/auth/useAuth";
import "../../styles/admin-login.css";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    if (!username.trim() || !password.trim()) {
      setErrorMessage("Please enter both username and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn(username.trim(), password);
      navigate("/admin/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(error.message || "Unable to log in.");
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
          <p className="auth-error" role="alert">
            {errorMessage}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </AuthLayout>
  );
}
