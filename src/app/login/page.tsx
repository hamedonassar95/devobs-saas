import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return <main><h1>Sign in</h1><AuthForm mode="login" /><p><Link href="/register">Create an account</Link></p></main>;
}
