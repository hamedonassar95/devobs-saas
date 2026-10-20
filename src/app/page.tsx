import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Devobs SaaS</h1>
      <p>Tenant-aware CI/CD automation, monitoring, and AI-assisted analysis.</p>
      <Link href="/login">Sign in</Link>
      {" · "}
      <Link href="/register">Create an account</Link>
      {" · "}
      <Link href="/billing">Billing</Link>
    </main>
  );
}
