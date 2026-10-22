import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Link href="/" className="auth-brand" aria-label="Devobs SaaS home">
          <span className="auth-brand-mark" aria-hidden="true">d<span>.</span></span>
          <span>devobs</span>
        </Link>
        <section className="auth-card" aria-labelledby="login-title">
          <p className="auth-eyebrow">DEVOBS SAAS</p>
          <h1 id="login-title">Sign in</h1>
          <p className="auth-intro">Sign in to continue to your workspace.</p>
          <AuthForm mode="login" />
          <p className="auth-switch">New to Devobs? <Link href="/register">Create an account</Link></p>
        </section>
      </div>
    </main>
  );
}
