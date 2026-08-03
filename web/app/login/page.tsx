import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Button, Input, StatusText } from "@/components/ui";
import { loginAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Falsches Passwort.",
  rate: "Zu viele Versuche. Bitte 15 Minuten warten.",
  config: "ADMIN_PASSWORD_HASH ist nicht gesetzt — siehe README.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "Anmeldung fehlgeschlagen." : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Creator Dashboard — David vor Kamera
        </p>
        <h1 className="mt-2 text-5xl font-bold tracking-tight">CreatorHQ</h1>

        <form action={loginAction} className="mt-12 space-y-6">
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint"
            >
              Passwort
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Admin-Passwort"
            />
          </div>
          {errorMessage && <StatusText tone="err">{errorMessage}</StatusText>}
          <Button type="submit" className="w-full">
            Anmelden
          </Button>
        </form>
      </div>
    </main>
  );
}
