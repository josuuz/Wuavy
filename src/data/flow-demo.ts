import { SLOT_TIMES, visitSummary } from "@/lib/flow/insights";
import type {
  ClinicalRecord,
  Activity,
  Appointment,
  AutomationRule,
  AutomationRun,
  FlowData,
  InventoryLot,
  Lead,
  LeadSource,
  LeadStage,
  Patient,
  Procedure,
  ProcedureProduct,
  Product,
  WaitlistEntry,
} from "@/lib/flow/types";

/*
  The demo clinic. Built the same on every run (a seeded random) and relative
  to `now`, so "vence em 28 dias" and "amanhã às 15h" stay true whenever the
  page was built. All names and numbers are illustrative. The counts the
  landing and the brief use (23 stuck leads, 37 returns, R$ 1.240 near expiry,
  today's 16h30 cancellation and 3 free slots tomorrow) come out of the data
  itself.

  One person, one record: most patients keep the contact they started as
  (their origin and first quote), and the contacts who just booked are
  patients already, with their first appointment on the agenda.
*/

const ORG = "org_aurora";
const DAY = 86_400_000;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana",
  "Larissa", "Mariana", "Natália", "Patrícia", "Renata", "Sabrina", "Tatiane", "Vanessa", "Aline", "Bruna",
  "Carolina", "Débora", "Elaine", "Flávia", "Giovana", "Luana", "Marcela", "Priscila", "Rafaela", "Simone",
  "Letícia", "Paula", "Rodrigo", "Thiago", "Lucas", "Marcos", "Cláudia", "Vitória", "Yasmin", "Lívia",
];
const LAST = [
  "Almeida", "Barbosa", "Cardoso", "Duarte", "Esteves", "Ferraz", "Gomes", "Lima", "Machado", "Nogueira",
  "Oliveira", "Pereira", "Queiroz", "Ribeiro", "Santos", "Teixeira", "Vieira", "Xavier", "Campos", "Rocha",
];
const SOURCES: LeadSource[] = ["instagram", "instagram", "instagram", "google", "indicacao", "whatsapp", "site"];

const procedures: Omit<Procedure, "organizationId">[] = [
  { id: "proc_limpeza", name: "Limpeza de pele", category: "facial", price: 22000, durationMin: 60, returnDays: 45 },
  { id: "proc_peeling", name: "Peeling químico", category: "facial", price: 38000, durationMin: 40, returnDays: 30 },
  { id: "proc_micro", name: "Microagulhamento", category: "facial", price: 45000, durationMin: 60, returnDays: 30 },
  { id: "proc_skin", name: "Skinbooster", category: "injetaveis", price: 110000, durationMin: 40, returnDays: 60 },
  { id: "proc_toxina", name: "Toxina botulínica", category: "injetaveis", price: 120000, durationMin: 30, returnDays: 120 },
  { id: "proc_labial", name: "Preenchimento labial", category: "injetaveis", price: 140000, durationMin: 45, returnDays: 180 },
  { id: "proc_harmo", name: "Harmonização facial", category: "injetaveis", price: 380000, durationMin: 90, returnDays: 180 },
  { id: "proc_bio", name: "Bioestimulador de colágeno", category: "injetaveis", price: 220000, durationMin: 45, returnDays: 90 },
  { id: "proc_drenagem", name: "Drenagem linfática", category: "corporal", price: 16000, durationMin: 50, returnDays: 7 },
];

const products: Omit<Product, "organizationId">[] = [
  { id: "prod_toxina", brand: "Neurolab", name: "Toxina botulínica 100U", unit: "frasco", unitCost: 68000 },
  { id: "prod_ah", brand: "Dermavia", name: "Ácido hialurônico 1 ml", unit: "seringa", unitCost: 42000 },
  { id: "prod_skin", brand: "Dermavia", name: "Ácido hialurônico skinbooster", unit: "seringa", unitCost: 9000 },
  { id: "prod_bio", brand: "Colagenix", name: "Bioestimulador de colágeno", unit: "frasco", unitCost: 95000 },
  { id: "prod_glicolico", brand: "Aurea Pharma", name: "Ácido glicólico 70%", unit: "frasco", unitCost: 6500 },
  { id: "prod_mascara", brand: "Aurea Pharma", name: "Máscara calmante", unit: "un", unitCost: 2000 },
  { id: "prod_anestesico", brand: "Nordlab", name: "Anestésico tópico", unit: "bisnaga", unitCost: 4500 },
  { id: "prod_agulhas", brand: "Nordlab", name: "Agulhas 30G", unit: "caixa", unitCost: 3800 },
  { id: "prod_serum", brand: "Vitalis", name: "Sérum vitamina C", unit: "frasco", unitCost: 12000 },
  { id: "prod_oleo", brand: "Vitalis", name: "Óleo de massagem", unit: "litro", unitCost: 5500 },
];

const uses: [string, string, number][] = [
  ["proc_limpeza", "prod_mascara", 1],
  ["proc_limpeza", "prod_serum", 0.1],
  ["proc_peeling", "prod_glicolico", 0.25],
  ["proc_peeling", "prod_mascara", 1],
  ["proc_micro", "prod_serum", 0.2],
  ["proc_micro", "prod_anestesico", 0.2],
  ["proc_micro", "prod_agulhas", 0.1],
  ["proc_skin", "prod_skin", 1],
  ["proc_skin", "prod_anestesico", 0.2],
  ["proc_toxina", "prod_toxina", 0.5],
  ["proc_labial", "prod_ah", 1],
  ["proc_labial", "prod_anestesico", 0.2],
  ["proc_harmo", "prod_ah", 3],
  ["proc_harmo", "prod_skin", 1],
  ["proc_harmo", "prod_toxina", 0.5],
  ["proc_harmo", "prod_anestesico", 0.3],
  ["proc_bio", "prod_bio", 1],
  ["proc_bio", "prod_anestesico", 0.2],
  ["proc_drenagem", "prod_oleo", 0.05],
];

// [product, lot, quantity, expires in (days)]: the first three are the R$ 1.240 near expiry.
const lotPlan: [string, string, number, number][] = [
  ["prod_skin", "SB-2407", 8, 28],
  ["prod_glicolico", "GL-2403", 4, 21],
  ["prod_mascara", "MC-2405", 13, 40],
  ["prod_bio", "BC-2409", 2, 75],
  ["prod_serum", "VC-2408", 4, 65],
  ["prod_toxina", "TB-2411", 3, 150],
  ["prod_ah", "AH-2412", 6, 210],
  ["prod_skin", "SB-2502", 10, 240],
  ["prod_anestesico", "AT-2410", 5, 120],
  ["prod_agulhas", "AG-2501", 1, 400],
  ["prod_oleo", "OM-2412", 3, 300],
];

const NEXT_ACTION: Record<LeadStage, string> = {
  novo: "Fazer o primeiro contato",
  contato: "Marcar a avaliação",
  avaliacao: "Enviar o orçamento",
  orcamento: "Aguardar resposta",
  agendado: "",
};

// Tomorrow's grid: [hour, minute, patient index, procedure, status]. 10h, 14h and 16h30 stay free;
// two bookings still wait for the patient's confirmation.
const TOMORROW: [number, number, number, string, Appointment["status"]][] = [
  [9, 0, 0, "proc_limpeza", "agendado"],
  [11, 0, 1, "proc_toxina", "confirmado"],
  [13, 0, 2, "proc_skin", "confirmado"],
  [15, 0, 3, "proc_micro", "confirmado"],
  [17, 30, 4, "proc_peeling", "agendado"],
];
// Yesterday: done, one no-show, and one the front desk has not recorded yet. 13h and 15h stayed free.
// Only procedures with a return of 30 days or more, so no one's return moves into the window.
const YESTERDAY: [number, number, number, string, Appointment["status"]][] = [
  [9, 0, 18, "proc_limpeza", "concluido"],
  [10, 0, 19, "proc_toxina", "concluido"],
  [11, 0, 20, "proc_peeling", "concluido"],
  [14, 0, 21, "proc_skin", "concluido"],
  [16, 30, 22, "proc_micro", "faltou"],
  [17, 30, 23, "proc_limpeza", "confirmado"],
];
// Today's: every slot booked except 16h30, cancelled this morning.
const TODAY: [number, number, number, string, Appointment["status"]][] = [
  [9, 0, 5, "proc_limpeza", "confirmado"],
  [10, 0, 6, "proc_bio", "confirmado"],
  [11, 0, 7, "proc_drenagem", "confirmado"],
  [13, 0, 8, "proc_labial", "confirmado"],
  [14, 0, 9, "proc_peeling", "agendado"],
  [15, 0, 10, "proc_skin", "agendado"],
  [16, 30, 11, "proc_limpeza", "cancelado"],
  [17, 30, 12, "proc_toxina", "agendado"],
];

/**
 * The automations to come, as rules: the demo's preview reads them, and a
 * real clinic gets them at onboarding, switched off. Nothing runs them yet
 * (Automações says so).
 */
export const RULE_TEMPLATES: Omit<AutomationRule, "organizationId" | "active">[] = [
  {
    id: "rule_reminder",
    kind: "reminder",
    name: "Lembrete de atendimento",
    when: "Falta 1 dia para o atendimento",
    conditions: ["Aguardando confirmação"],
    actions: ["Preparar mensagem de confirmação", "Avisar a recepção se não houver resposta"],
  },
  {
    id: "rule_lead",
    kind: "lead_followup",
    name: "Orçamento sem resposta",
    when: "Orçamento sem resposta por 3 dias",
    conditions: ["O orçamento continua aberto"],
    actions: ["Preparar follow-up com o procedimento de interesse", "Avisar a recepção"],
  },
  {
    id: "rule_idle",
    kind: "lead_idle",
    name: "Lead parado",
    when: "Um contato fica 2 dias sem conversa",
    conditions: ["Ainda não recebeu orçamento"],
    actions: ["Preparar mensagem retomando a conversa", "Avisar a recepção"],
  },
  {
    id: "rule_return",
    kind: "patient_return",
    name: "Retorno de paciente",
    when: "O retorno do procedimento chegou",
    conditions: ["Sem retorno marcado"],
    actions: ["Criar a oportunidade de retorno", "Avisar o responsável", "Preparar convite com horários livres"],
  },
  {
    id: "rule_noshow",
    kind: "no_show",
    name: "Falta sem remarcação",
    when: "Um paciente faltou",
    conditions: ["Nada remarcado no dia seguinte"],
    actions: ["Preparar convite para remarcar", "Avisar a recepção"],
  },
  {
    id: "rule_stock",
    kind: "stock_expiry",
    name: "Estoque próximo da validade",
    when: "Um lote chega a 45 dias da validade",
    conditions: ["Produto usado em procedimentos ativos"],
    actions: ["Cruzar pacientes com histórico compatível", "Sugerir campanha para revisão"],
  },
  {
    id: "rule_slot",
    kind: "open_slot",
    name: "Horário vago",
    when: "Um cancelamento abre um horário",
    conditions: ["Horário nas próximas 48 horas"],
    actions: ["Procurar na lista de espera", "Encontrar pacientes compatíveis", "Preparar convite"],
  },
  {
    id: "rule_post",
    kind: "post_visit",
    name: "Pós-atendimento",
    when: "Um atendimento é concluído",
    conditions: ["Esperar 2 dias"],
    actions: ["Preparar mensagem de cuidado", "Registrar o próximo retorno"],
  },
];

export function createDemoData(clock = new Date()): FlowData {
  const rand = seeded(20260929);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const midnight = Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate());
  const at = (day: number, h = 10, m = 0) => new Date(midnight + day * DAY + (h * 60 + m) * 60_000).toISOString();
  const now = at(0, 8, 30);
  const price = new Map(procedures.map((p) => [p.id, p]));
  const phone = () => `(19) 9${int(8000, 9999)}-${int(1000, 9999)}`;
  const names = new Set<string>();
  const name = () => {
    let n = "";
    do n = `${pick(FIRST)} ${pick(LAST)}`;
    while (names.has(n));
    names.add(n);
    return n;
  };
  const org = { organizationId: ORG };
  const appointments: Appointment[] = [];
  const taken = new Set<string>();
  // One room: a booking that lands on a taken time moves to the day's next free one.
  // The clinic is closed on Sundays: a booking ahead that falls on one moves to Monday.
  const book = (patientId: string, procedureId: string, when: string, status: Appointment["status"]) => {
    let startsAt = when;
    if (startsAt > now && new Date(startsAt).getUTCDay() === 0) startsAt = new Date(Date.parse(startsAt) + DAY).toISOString();
    if (taken.has(startsAt)) {
      const day = startsAt.slice(0, 10);
      const free = SLOT_TIMES.map(([h, m]) => `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`).find(
        (t) => !taken.has(t),
      );
      if (free) startsAt = free;
    }
    taken.add(startsAt);
    const procedure = price.get(procedureId)!;
    appointments.push({
      id: `apt_${appointments.length + 1}`,
      ...org,
      patientId,
      procedureId,
      // Injectables with the doctor, skin and body care with the aesthetician.
      professionalId: procedure.category === "injetaveis" ? "user_helena" : "user_marina",
      startsAt,
      durationMin: procedure.durationMin,
      status,
    });
  };

  /* Patients: 37 due for a return, 40 recently seen, 15 booked ahead. */
  // A patient's last procedure always has a return of 30 days or more, so a visit is always past.
  const facial = ["proc_limpeza", "proc_limpeza", "proc_peeling", "proc_micro"];
  const injectable = ["proc_toxina", "proc_skin", "proc_skin", "proc_labial", "proc_bio", "proc_harmo"];
  const earlier = [...facial, "proc_drenagem"];
  const groups: ["due" | "recent" | "booked", number][] = [
    ["due", 37],
    ["recent", 40],
    ["booked", 15],
  ];
  const patients: Patient[] = [];
  const firstProcedure = new Map<string, [number, string]>(); // patient → [day, procedure] of the first visit
  for (const [group, count] of groups) {
    for (let i = 0; i < count; i++) {
      const id = `pat_${patients.length + 1}`;
      const last = pick(rand() < 0.55 ? facial : injectable);
      const returnDays = price.get(last)!.returnDays;
      // Due: the return falls from 40 days ago to 12 days ahead. Recent: it is 15+ days away.
      const visit =
        group === "recent"
          ? -int(1, Math.min(returnDays - 15, 60))
          : (group === "due" ? int(-40, 12) : int(-8, 20)) - returnDays;
      const sessions = int(1, 4);
      let day = visit;
      for (let s = 0; s < sessions; s++) {
        const procedureId = s === 0 ? last : pick(rand() < 0.6 ? earlier : injectable);
        book(id, procedureId, at(day, pick([9, 10, 11, 13, 14, 15])), "concluido");
        firstProcedure.set(id, [day, procedureId]);
        day -= int(30, 110);
      }
      if (group === "booked") book(id, last, at(int(2, 14), pick([9, 10, 11, 14, 15])), "agendado");
      // Visits, spend and next return are filled in from the appointments below.
      patients.push({
        id,
        ...org,
        name: name(),
        phone: phone(),
        totalSpent: 0,
        notes: pick([
          "Prefere atendimento no fim da tarde.",
          "Responde melhor por WhatsApp.",
          "Indicou duas amigas no último ano.",
          "Costuma fechar pacotes de sessões.",
          "Pediu lembrete uma semana antes do retorno.",
          "Sensível a preço: valoriza condições de pacote.",
        ]),
      });
    }
  }

  // Yesterday, today and tomorrow are booked by recently seen patients (group "recent" starts at 37).
  const recent = (i: number) => patients[37 + i].id;
  for (const [h, m, i, procedureId, status] of TODAY) book(recent(i), procedureId, at(0, h, m), status);
  for (const [h, m, i, procedureId, status] of TOMORROW) book(recent(i + 13), procedureId, at(1, h, m), status);
  for (const [h, m, i, procedureId, status] of YESTERDAY) book(recent(i), procedureId, at(-1, h, m), status);

  /* Leads: 23 quotes unanswered for 3 days or more, the rest moving. */
  const leads: Lead[] = [];
  const plan: [LeadStage, number][] = [
    ["novo", 6],
    ["contato", 7],
    ["avaliacao", 5],
    ["orcamento", 27],
    ["agendado", 9],
  ];
  let stuck = 0;
  for (const [stage, count] of plan) {
    for (let i = 0; i < count; i++) {
      const procedureId = pick(rand() < 0.6 ? injectable : facial);
      const stale = stage === "orcamento" && stuck < 23;
      if (stale) stuck++;
      const carla = stale && stuck === 1;
      const contact = stale ? (carla ? -6 : int(-20, -3)) : int(-2, 0);
      const lead: Lead = {
        id: `lead_${leads.length + 1}`,
        ...org,
        name: carla ? "Carla Moreira" : name(),
        phone: phone(),
        source: carla ? "instagram" : pick(SOURCES),
        procedureId: carla ? "proc_harmo" : procedureId,
        potentialValue: price.get(carla ? "proc_harmo" : procedureId)!.price,
        stage,
        createdAt: at(contact - int(1, 12)),
        lastContactAt: at(contact, int(9, 18)),
        nextAction: stale ? "Follow-up do orçamento" : NEXT_ACTION[stage],
      };
      if (stage === "orcamento") lead.quoteSentAt = lead.lastContactAt;
      leads.push(lead);
    }
  }

  // The contacts who just booked are patients now: same name, same phone, first appointment ahead.
  const FIRST_AT: [number, number][] = [[10, 0], [14, 0], [9, 0], [15, 0], [11, 0], [13, 0], [16, 30], [10, 0], [14, 0]];
  leads
    .filter((l) => l.stage === "agendado")
    .forEach((lead, j) => {
      const id = `pat_${patients.length + 1}`;
      patients.push({ id, ...org, name: lead.name, phone: lead.phone, totalSpent: 0, notes: "" });
      const [h, m] = FIRST_AT[j % FIRST_AT.length];
      book(id, lead.procedureId, at(2 + j, h, m), "agendado");
      lead.patientId = id;
    });

  // Most earlier patients started as a contact too: that is where their origin comes from.
  // Every third one came before the Pulse and was registered straight as a patient.
  patients.forEach((patient, i) => {
    const first = firstProcedure.get(patient.id);
    if (!first || i % 3 === 2) return;
    const [day, procedureId] = first;
    leads.push({
      id: `lead_${leads.length + 1}`,
      ...org,
      name: patient.name,
      phone: patient.phone,
      source: SOURCES[i % SOURCES.length],
      procedureId,
      potentialValue: price.get(procedureId)!.price,
      stage: "agendado",
      createdAt: at(day - 3 - (i % 9)),
      lastContactAt: at(day - 1 - (i % 3), 10 + (i % 8)),
      nextAction: "",
      patientId: patient.id,
    });
  });

  for (const patient of patients) {
    const visits = appointments
      .filter((a) => a.patientId === patient.id && a.status === "concluido")
      .map((a) => ({ startsAt: a.startsAt, price: price.get(a.procedureId)!.price, returnDays: price.get(a.procedureId)!.returnDays }));
    Object.assign(patient, visitSummary(visits));
  }

  const waitlist: WaitlistEntry[] = [
    { id: "wait_1", ...org, patientId: patients[3].id, procedureId: "proc_limpeza", period: "tarde", createdAt: at(-9) },
    { id: "wait_2", ...org, patientId: patients[8].id, procedureId: "proc_toxina", period: "manha", createdAt: at(-5) },
    { id: "wait_3", ...org, patientId: patients[14].id, procedureId: "proc_skin", period: "tarde", createdAt: at(-4) },
    { id: "wait_4", ...org, patientId: patients[21].id, procedureId: "proc_peeling", period: "tarde", createdAt: at(-2) },
  ];

  const lots: InventoryLot[] = lotPlan.map(([productId, lotCode, quantity, days], i) => ({
    id: `lot_${i + 1}`,
    ...org,
    productId,
    lotCode,
    quantity,
    expiresAt: at(days),
  }));

  const automationRules: AutomationRule[] = RULE_TEMPLATES.map((rule) => ({ ...rule, ...org, active: true }));

  // The recovery tracking to come, as the demo's preview shows it (Visão geral, marked "Em breve").
  const automationRuns: AutomationRun[] = (
    [
      ["rule_lead", -2, "5 follow-ups preparados, 2 orçamentos retomados", 250000, 2],
      ["rule_slot", -1, "Horário das 14h sugerido à lista de espera e ocupado", 22000, 1],
      ["rule_return", -3, "8 convites de retorno preparados, 3 retornos marcados", 156000, 3],
      ["rule_post", -4, "6 mensagens de cuidado preparadas", 0, 0],
      ["rule_idle", -5, "4 conversas retomadas, 2 avaliações marcadas", 76000, 2],
      ["rule_stock", -6, "Campanha de peeling sugerida para 11 pacientes, 4 agendaram", 152000, 4],
      ["rule_noshow", -8, "2 faltas remarcadas", 60000, 2],
      ["rule_lead", -9, "3 follow-ups preparados, 1 agendamento", 110000, 1],
      ["rule_slot", -12, "2 horários vagos preenchidos", 60000, 2],
      ["rule_return", -20, "5 convites preparados, 2 retornos marcados", 96000, 2],
    ] as const
  ).map(([ruleId, day, summary, value, converted], i) => ({
    id: `run_${i + 1}`,
    ...org,
    ruleId,
    ranAt: at(day, 9),
    summary,
    recovered: value,
    converted,
  }));

  const activities: Activity[] = (
    [
      [0, 8, "O Pulse encontrou 23 orçamentos sem resposta."],
      [0, 8, "O lote SB-2407 de skinbooster entrou nos 30 dias finais de validade."],
      [0, 8, "Cancelamento de hoje às 16h30: o horário está livre."],
      [-1, 18, "A recepção confirmou 3 atendimentos de amanhã."],
      [-1, 11, "O horário das 14h foi ocupado pela lista de espera."],
      [-2, 9, "5 follow-ups de orçamento preparados em Oportunidades e enviados pela recepção."],
    ] as const
  ).map(([day, h, text], i) => ({ id: `act_${i + 1}`, ...org, at: at(day, h), text }));

  // Clinical records for the last visits of the first patients: a chief complaint and what was done.
  const COMPLAINT: Record<string, [string, string]> = {
    proc_limpeza: ["Oleosidade e cravos na zona T.", "Limpeza com extração. Pele reagiu bem, sem vermelhidão persistente."],
    proc_peeling: ["Manchas de sol nas maçãs do rosto.", "Peeling aplicado em duas camadas. Reforçado o uso diário de protetor solar."],
    proc_micro: ["Marcas de acne e poros dilatados.", "Microagulhamento em toda a face. Leve vermelhidão esperada por 48 horas."],
    proc_skin: ["Pele desidratada e sem viço.", "Skinbooster em pontos distribuídos. Sem intercorrências."],
    proc_toxina: ["Rugas de expressão na testa e entre as sobrancelhas.", "Aplicação em testa e glabela. Retorno em 15 dias para avaliar."],
    proc_labial: ["Quer mais volume nos lábios, com naturalidade.", "Preenchimento em contorno e corpo labial. Edema leve orientado."],
    proc_harmo: ["Quer equilibrar o contorno do rosto.", "Harmonização em mento e mandíbula. Fotos registradas."],
    proc_bio: ["Flacidez leve na face e no pescoço.", "Bioestimulador em terço inferior. Massagem orientada por 5 dias."],
    proc_drenagem: ["Inchaço nas pernas no fim do dia.", "Drenagem em membros inferiores. Sugerido pacote semanal."],
  };
  const records: ClinicalRecord[] = patients.slice(0, 40).flatMap((patient) =>
    appointments
      .filter((a) => a.patientId === patient.id && a.status === "concluido")
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .slice(0, 2)
      .map((a) => {
        const [chiefComplaint, notes] = COMPLAINT[a.procedureId] ?? ["Avaliação estética.", "Atendimento sem intercorrências."];
        return { id: `rec_${a.id}`, ...org, patientId: patient.id, recordedAt: a.startsAt, chiefComplaint, notes, authorId: a.professionalId };
      }),
  );

  return {
    now,
    organization: { id: ORG, name: "Clínica Aurora", segment: "estetica", city: "Campinas" },
    users: [
      { id: "user_helena", ...org, name: "Dra. Helena Prado", role: "owner" },
      { id: "user_marina", ...org, name: "Marina Costa", role: "professional" },
      { id: "user_julia", ...org, name: "Júlia", role: "reception" },
    ],
    leads,
    patients,
    appointments,
    waitlist,
    procedures: procedures.map((p) => ({ ...p, ...org })),
    products: products.map((p) => ({ ...p, ...org })),
    lots,
    procedureProducts: uses.map(([procedureId, productId, quantity]): ProcedureProduct => ({
      ...org,
      procedureId,
      productId,
      quantity,
    })),
    automationRules,
    automationRuns,
    activities,
    records,
  };
}
