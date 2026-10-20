/*
  A prevenção de duplicidade de clientes da agência. Não é uma constraint de
  banco: nome parecido é comum e legítimo (duas clínicas podem se chamar
  quase igual), então só o que identifica de verdade — e-mail e WhatsApp —
  conta. A migration 0018 não tem unicidade nenhuma nessas colunas de
  propósito; é esta função que avisa antes de salvar, e quem administra
  decide se confirma mesmo assim.
*/

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() || null;

/*
  Os dígitos, sem DDI: "+55 19 99999-0001" e "19 99999-0001" são o mesmo
  número, um digitado com o código do Brasil e outro sem. Os últimos 11
  dígitos (DDD + 9 números) bastam para comparar.
*/
const normalizeWhatsapp = (value: string | null | undefined) => {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length > 11 ? digits.slice(-11) : digits;
};

export interface DuplicateCandidate {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  archived_at: string | null;
}

export interface NewClientInput {
  name: string;
  email: string | null;
  whatsapp: string | null;
}

/**
 * O primeiro cliente aberto (não arquivado) cujo e-mail ou WhatsApp bate com
 * o do novo cadastro, normalizando os dois antes de comparar. null quando
 * não há nenhum — inclusive quando o novo cadastro não tem e-mail nem
 * WhatsApp para comparar.
 */
export function findDuplicate(candidates: DuplicateCandidate[], input: NewClientInput): DuplicateCandidate | null {
  const email = normalizeEmail(input.email);
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!email && !whatsapp) return null;

  return (
    candidates.find((candidate) => {
      if (candidate.archived_at) return false;
      if (email && normalizeEmail(candidate.email) === email) return true;
      if (whatsapp && normalizeWhatsapp(candidate.whatsapp) === whatsapp) return true;
      return false;
    }) ?? null
  );
}
