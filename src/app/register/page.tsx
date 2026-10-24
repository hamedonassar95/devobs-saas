import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Link href="/" className="auth-brand" aria-label="Devobs SaaS home">
          <span className="auth-brand-mark" aria-hidden="true">d<span>.</span></span>
          <span>devobs</span>
        </Link>
        <section className="auth-card" aria-labelledby="register-title">
          <p className="auth-eyebrow">DEVOBS SAAS</p>
          <h1 id="register-title">Create your account</h1>
          <p className="auth-intro">Start your account setup. We’ll ask you to choose a password after you verify your email.</p>
          <AuthForm mode="register" />
          <p className="auth-switch">Already registered? <Link href="/login">Sign in</Link></p>
        </section>
      </div>
    </main>
  );
}
