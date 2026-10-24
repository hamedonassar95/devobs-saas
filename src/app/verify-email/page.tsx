import Link from "next/link";
import { VerifyEmailForm } from "./verify-email-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Verify your email | Devobs",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default function VerifyEmailPage() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Link href="/" className="auth-brand" aria-label="Devobs SaaS home">
          <span className="auth-brand-mark" aria-hidden="true">d<span>.</span></span>
          <span>devobs</span>
        </Link>
        <section className="auth-card" aria-labelledby="verify-email-title">
          <p className="auth-eyebrow">DEVOBS SAAS</p>
          <h1 id="verify-email-title">Verify your email</h1>
          <p className="auth-intro">Open your verification link in this browser and choose a password for your account. If it expired or did not arrive, request another link below. For privacy, we use the same response whether or not an address has a pending registration.</p>
          <VerifyEmailForm />
        </section>
      </div>
    </main>
  );
}
