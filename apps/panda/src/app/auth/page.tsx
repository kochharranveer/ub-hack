import { AuthForm } from "./auth-form";
export default function SignIn() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <AuthForm />
    </div>
  );
}
