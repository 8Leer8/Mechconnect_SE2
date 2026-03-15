export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-background-shape auth-background-shape-one" aria-hidden="true" />
      <div className="auth-background-shape auth-background-shape-two" aria-hidden="true" />

      <section className="auth-panel" aria-label="Admin authentication panel">
        <p className="auth-kicker">MechConnect Admin</p>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </section>
    </div>
  );
}
