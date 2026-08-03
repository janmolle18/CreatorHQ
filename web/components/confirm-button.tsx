"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonVariant } from "@/components/ui";

type Props = {
  message: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
};

/**
 * Absende-Knopf mit nativer Rückfrage — für Aktionen, die etwas wegnehmen.
 * Bewusst ohne Modal-Framework: internes Werkzeug, ein confirm() reicht.
 *
 * Optik kommt aus buttonClasses, damit sie nicht von den übrigen Knöpfen
 * abdriftet; während der Aktion sperrt er sich wie SubmitButton.
 */
export function ConfirmButton({ message, children, variant = "danger", className = "" }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClasses(variant, className)}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? "Einen Moment …" : children}
    </button>
  );
}
