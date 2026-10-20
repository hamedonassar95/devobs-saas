import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return <main><h1>Create your account</h1><AuthForm mode="register" /><p><Link href="/login">Already registered? Sign in</Link></p></main>;
}
