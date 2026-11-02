import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailShape } from "@/lib/flow/email-shape";

/*
  Achar as assinaturas e as clínicas de uma pessoa a partir do e-mail dela ou
  do id da conta, e só isso. Existe porque o painel de reconciliação
  (/clinavy/admin) só sabia consultar por id — o id da nossa linha, ou o id de
  um pagamento do Mercado Pago. Quando a pessoa do suporte tem apenas o e-mail
  do cliente (o caso normal: é o que ela recebe no WhatsApp), não havia por
  onde começar, e foi exatamente a lacuna que travou a investigação das recusas
  e das duas contas da primeira cliente.

  SOMENTE LEITURA, e deliberadamente estreita:

  - nunca devolve conteúdo clínico. De prontuário, paciente e agenda devolve
    CONTAGEM, que é o que responde "onde estão os dados" sem abrir nada de
    ninguém;
  - nunca devolve cartão, token ou credencial — essas não estão nem gravadas;
  - nunca escreve. Juntar, transferir ou apagar conta é decisão de gente, com
    autorização, e não tem função neste arquivo.

  Os limites do e-mail como chave. O e-mail da conta vive em auth.users, que
  este arquivo não lê (não há Admin API aqui). Aparece em dois lugares que ele
  lê: a participação da pessoa numa clínica (members.email) e o pagador de uma
  assinatura (payer_email, desde a migration 0023). Logo, UMA CONTA QUE AINDA
  NÃO CRIOU CLÍNICA, com tentativas anteriores à 0023, não é achada pelo
  e-mail — e é justamente o caso da segunda conta da cliente. Para ela existe
  auditByUserId: o id vem do painel do Supabase (Authentication → Users, busca
  por e-mail), que é o caminho legítimo de quem tem acesso a ele.

  Quem pode chamar isto é o painel, que já exige WUAVY_ADMIN_EMAILS.
*/

/** Uma linha de assinatura como o suporte precisa ver: o estado e a última recusa, nunca dado de pagamento. */
export interface AuditSubscription {
  id: string;
  status: string | null;
  organization_id: string | null;
  user_id: string;
  provider_subscription_id: string | null;
  /** O e-mail que foi ao Mercado Pago como pagador desta linha (migration 0023). */
  payer_email: string | null;
  current_period_end: string | null;
  creation_blocked_at: string | null;
  creation_claimed_at: string | null;
  /** O que o Mercado Pago respondeu na última recusa de criação (migration 0020). */
  last_refusal_http_status: number | null;
  last_refusal_detail: string | null;
  created_at: string;
}

/** Uma clínica da pessoa, e o tamanho do que existe dentro dela — nunca o conteúdo. */
export interface AuditClinic {
  id: string;
  name: string | null;
  /** O papel desta pessoa nesta clínica, e se o acesso dela está ativo. */
  role: string | null;
  memberStatus: string | null;
  /** null = a contagem FALHOU: nao e zero, e nao se sabe. */
  counts: { patients: number | null; clinicalRecords: number | null; appointments: number | null };
}

export interface Audit {
  /** Por onde a busca entrou, e o valor usado (já normalizado). */
  by: "email" | "user";
  query: string;
  /** Os ids de usuário do Supabase Auth encontrados (mais de um = mais de uma conta). */
  userIds: string[];
  clinics: AuditClinic[];
  subscriptions: AuditSubscription[];
  /**
   * As leituras que FALHARAM. Uma lista vazia aqui quer dizer que tudo respondeu; uma
   * leitura que falha NAO pode aparecer na tela como zero ou como nenhuma: este painel
   * serve para decidir o que fazer com contas e dados, e decidir sobre uma leitura
   * incompleta apaga coisas que existem.
   */
  failed: string[];
}

const SUBSCRIPTION_COLUMNS =
  "id, status, organization_id, user_id, provider_subscription_id, payer_email, current_period_end, creation_blocked_at, creation_claimed_at, last_refusal_http_status, last_refusal_detail, created_at";

type Admin = ReturnType<typeof createAdminClient>;

interface MemberRow {
  organization_id: string;
  user_id: string;
  role: string | null;
  status: string | null;
  email: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A forma de e-mail é a do checkout (email-shape.ts): "%" e "*" ficam de fora porque são
// curingas do LIKE — o que faria "%@gmail.com" casar o domínio inteiro.

/**
 * O e-mail como texto literal num LIKE: "_" (qualquer letra) e "\" (o escape)
 * deixam de valer como curinga. "%" e "*" já foram recusados pela forma. Sem
 * isto, joao_silva@x.com também casaria joaoXsilva@x.com. O casamento final é
 * sempre conferido por igualdade exata depois (sameEmail), então o LIKE só
 * estreita a busca — nunca decide o que o suporte vê.
 */
const likeLiteral = (value: string) => value.replace(/[\\_]/g, (char) => `\\${char}`);

const sameEmail = (stored: string | null | undefined, wanted: string) => (stored ?? "").trim().toLowerCase() === wanted;

/** Quantas linhas existem numa tabela para uma clínica. Só o número: head + count, nenhum dado vem. */
async function countFor(admin: Admin, table: "patients" | "clinical_records" | "appointments", organizationId: string, failed: string[]): Promise<number | null> {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (error) {
    console.error("audit: contar", table, organizationId, error.message);
    failed.push("contagem de " + table);
    return null;
  }
  return count ?? 0;
}

/**
 * O quadro a partir do que a busca achou. Cada consulta é separada e usa o
 * filtro tipado do cliente (`in`, `eq`, `ilike`): o e-mail nunca é colado numa
 * string de filtro, onde uma vírgula ou um parêntese mudaria a consulta.
 */
async function assemble(
  admin: Admin,
  seeds: { by: Audit["by"]; query: string; userIds: string[]; members: MemberRow[]; payerRows: AuditSubscription[]; failed: string[] },
): Promise<Audit> {
  const userIds = [...new Set([...seeds.userIds, ...seeds.members.map((m) => m.user_id), ...seeds.payerRows.map((r) => r.user_id)])];
  const memberOrgIds = [...new Set(seeds.members.map((m) => m.organization_id))];

  const byUser = userIds.length ? await admin.from("subscriptions").select(SUBSCRIPTION_COLUMNS).in("user_id", userIds) : { data: [], error: null };
  if (byUser.error) {
    console.error("audit: assinaturas por conta", byUser.error.message);
    seeds.failed.push("assinaturas por conta");
  }
  const byOrg = memberOrgIds.length
    ? await admin.from("subscriptions").select(SUBSCRIPTION_COLUMNS).in("organization_id", memberOrgIds)
    : { data: [], error: null };
  if (byOrg.error) {
    console.error("audit: assinaturas por clínica", byOrg.error.message);
    seeds.failed.push("assinaturas por clínica");
  }

  const merged = new Map<string, AuditSubscription>();
  for (const row of [...seeds.payerRows, ...((byUser.data ?? []) as AuditSubscription[]), ...((byOrg.data ?? []) as AuditSubscription[])]) {
    merged.set(row.id, row);
  }
  const subscriptions = [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Uma assinatura pode apontar para uma clínica de que a busca não participa
  // (uma tentativa de outra conta para a mesma clínica): ela entra também, ou
  // o quadro ficaria incompleto.
  const everyOrgId = [...new Set([...memberOrgIds, ...subscriptions.map((r) => r.organization_id).filter((id): id is string => Boolean(id))])];

  const organizations = everyOrgId.length ? await admin.from("organizations").select("id, name").in("id", everyOrgId) : { data: [], error: null };
  if (organizations.error) {
    console.error("audit: organizations", organizations.error.message);
    seeds.failed.push("nomes das clínicas");
  }

  const clinics: AuditClinic[] = [];
  for (const id of everyOrgId) {
    const member = seeds.members.find((m) => m.organization_id === id) ?? null;
    const [patients, clinicalRecords, appointments] = await Promise.all([
      countFor(admin, "patients", id, seeds.failed),
      countFor(admin, "clinical_records", id, seeds.failed),
      countFor(admin, "appointments", id, seeds.failed),
    ]);
    clinics.push({
      id,
      name: (organizations.data ?? []).find((o) => o.id === id)?.name ?? null,
      role: member?.role ?? null,
      memberStatus: member?.status ?? null,
      counts: { patients, clinicalRecords, appointments },
    });
  }

  // Só conta como ENCONTRADA a conta que alguma linha prova: a participação numa clínica ou uma
  // assinatura. A conta de uma assinatura pré-clínica não aparece em members: entra por aqui. O id
  // digitado na busca por conta serve para consultar, não como prova: um uuid sem nenhuma linha
  // (um erro de digitação) não pode aparecer no painel como uma conta que existe.
  const everyUserId = [...new Set([...seeds.members.map((m) => m.user_id), ...seeds.payerRows.map((r) => r.user_id), ...subscriptions.map((r) => r.user_id)])];

  return { by: seeds.by, query: seeds.query, userIds: everyUserId, clinics, subscriptions, failed: [...new Set(seeds.failed)] };
}

/**
 * Tudo o que o suporte precisa saber sobre um e-mail: as contas, as clínicas,
 * quanto dado clínico há em cada uma e as assinaturas. Devolve null quando o
 * texto não tem forma de e-mail — nunca varre a tabela por um texto solto.
 */
export async function auditByEmail(rawEmail: string): Promise<Audit | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!isEmailShape(email)) return null;

  const admin = createAdminClient();
  const pattern = likeLiteral(email);

  const { data: memberRows, error: membersError } = await admin
    .from("members")
    .select("organization_id, user_id, role, status, email")
    .ilike("email", pattern);
  const failed: string[] = [];
  if (membersError) {
    console.error("audit: members", membersError.message);
    failed.push("participacao em clinicas");
  }
  const members = ((memberRows ?? []) as MemberRow[]).filter((m) => sameEmail(m.email, email));

  const { data: payerData, error: payerError } = await admin.from("subscriptions").select(SUBSCRIPTION_COLUMNS).ilike("payer_email", pattern);
  if (payerError) {
    console.error("audit: pagador", payerError.message);
    failed.push("assinaturas pelo pagador");
  }
  const payerRows = ((payerData ?? []) as AuditSubscription[]).filter((r) => sameEmail(r.payer_email, email));

  return assemble(admin, { by: "email", query: email, userIds: [], members, payerRows, failed });
}

/**
 * O mesmo quadro a partir do id de uma conta (auth.users.id). É o caminho para
 * uma conta que nunca criou clínica, que o e-mail não alcança (ver o topo).
 * Devolve null quando o texto não é um uuid.
 */
export async function auditByUserId(rawId: string): Promise<Audit | null> {
  const id = rawId.trim().toLowerCase();
  if (!UUID.test(id)) return null;

  const admin = createAdminClient();
  const { data: memberRows, error: membersError } = await admin
    .from("members")
    .select("organization_id, user_id, role, status, email")
    .eq("user_id", id);
  const failed: string[] = [];
  if (membersError) {
    console.error("audit: members", membersError.message);
    failed.push("participacao em clinicas");
  }

  return assemble(admin, { by: "user", query: id, userIds: [id], members: (memberRows ?? []) as MemberRow[], payerRows: [], failed });
}
