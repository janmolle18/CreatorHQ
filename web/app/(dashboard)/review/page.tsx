import { redirect } from "next/navigation";

// Review ist ins Clip-Board gewandert (Abschnitt „Zur Freigabe").
// Die Route bleibt für Lesezeichen/Muskelgedächtnis als Umleitung bestehen.
export default function ReviewRedirect() {
  redirect("/clips#freigabe");
}
