"use client";

import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonVariant } from "@/components/ui";

/**
 * Absende-Knopf mit Rückmeldung: zeigt während der Aktion, dass etwas
 * passiert, und sperrt sich selbst gegen Doppelklicks.
 *
 * Bewusst nur der Knopf als Client-Komponente — die Server Actions bleiben
 * unverändert. `useActionState` hätte jedes Formular umbauen müssen.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  /** Text während der Aktion, z. B. „Wird gespeichert …". */
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // Während der Aktion läuft ein Balken an der Unterkante durch (siehe
      // .knopf[data-laeuft] in globals.css). Ein Kreisel würde denselben Zweck
      // erfüllen, aber die Knopfbreite verändern und die Zeile umbrechen —
      // der Balken liegt darüber und lässt das Maß in Ruhe.
      data-laeuft={pending ? "ja" : undefined}
      aria-busy={pending}
      className={buttonClasses(variant, `${pending ? "!opacity-100" : ""} ${className}`)}
    >
      {pending ? (pendingLabel ?? "Einen Moment …") : children}
    </button>
  );
}
