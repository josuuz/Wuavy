import { redirect } from "next/navigation";

/* /cobrancas sozinho não mostra nada: Clientes é a primeira aba. */
export default function CobrancasIndex() {
  redirect("/cobrancas/clientes");
}
