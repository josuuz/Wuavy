/*
  Wuavy Pulse: the landing's copy. The product lives inside "Sistemas de
  crescimento"; its first market is aesthetic clinics. Every example here is
  illustrative and is labelled so on the page: no promised numbers. (The
  product was called Wuavy Flow; the code keeps that name inside.)
*/

export const flow = {
  name: "Wuavy Pulse",
  pitch: "CRM + IA + Automações",
  meta: {
    title: "Wuavy Pulse",
    description:
      "Wuavy Pulse identifica os sinais da operação e transforma dados em próximas ações. CRM, IA e automações, começando por clínicas de estética.",
  },

  hero: {
    label: "Wuavy Pulse",
    market: "Começando por clínicas de estética",
    title: "Transforme os sinais da sua operação em crescimento.",
    lead: "Leads esquecidos, pacientes que não retornaram, horários vazios e estoque próximo da validade. O Pulse identifica oportunidades e mostra onde agir.",
    cta: "Quero testar o Pulse",
    secondary: { label: "Ver a demo", href: "/pulse/demo" },
  },

  // What PASSO walks through in the hero: one forgotten lead, three steps.
  guide: {
    invite: "Sua clínica pode estar deixando oportunidades passarem. Quer ver uma?",
    start: "Me mostra",
    next: "Próximo",
    restart: "Ver de novo",
    note: "Exemplo ilustrativo",
    steps: [
      {
        tag: "Lead esquecido",
        text: "Ela pediu orçamento de harmonização facial e ninguém voltou a falar com ela.",
        detail: ["Carla M.", "Harmonização facial", "Orçamento há 6 dias", "Sem resposta"],
      },
      {
        tag: "O Pulse identifica",
        text: "O Pulse percebe o silêncio antes que o lead esfrie e cruza o interesse com a agenda.",
        detail: ["Interesse alto", "Instagram", "Quinta, 10h livre"],
      },
      {
        tag: "Ação sugerida",
        text: "A próxima mensagem já vem pronta. A equipe revisa e decide enviar.",
        detail: ["Follow-up com horário sugerido"],
      },
    ],
    done: "Isso é o Pulse: ler os sinais do que ficou para trás e sugerir o próximo passo.",
  },

  gaps: {
    chapter: "Os sinais que passam despercebidos",
    title: "Seu negócio já dá os sinais. O Pulse mostra onde agir.",
    items: [
      {
        name: "Leads que sumiram",
        text: "Pediram orçamento, não responderam e ninguém voltou a chamar.",
        action: "Follow-up",
      },
      {
        name: "Pacientes que não voltaram",
        text: "O intervalo do procedimento passou e o retorno não foi marcado.",
        action: "Reativação",
      },
      {
        name: "Horários vazios",
        text: "Um cancelamento abre a agenda e o horário fica parado.",
        action: "Preenchimento de agenda",
      },
      {
        name: "Estoque perto da validade",
        text: "Produto parado vira prejuízo quando a data chega.",
        action: "Campanha antes do vencimento",
      },
    ],
  },

  how: {
    chapter: "Como funciona",
    title: "Não é só um CRM. É o pulso da operação inteira.",
    lead: "Wuavy Pulse identifica os sinais da operação e transforma dados em próximas ações.",
    stages: [
      { name: "Atrair", text: "Cada lead chega com origem e interesse registrados." },
      { name: "Organizar", text: "Pacientes, agenda, procedimentos e estoque conectados." },
      { name: "Identificar", text: "Silêncio, retorno vencido, horário vago, validade: o Pulse lê os sinais." },
      { name: "Agir", text: "A próxima ação chega pronta para a equipe revisar." },
      { name: "Recuperar", text: "O que ficou para trás volta como oportunidade." },
      { name: "Reter", text: "Retornos no tempo certo e pós-atendimento." },
    ],
    example: {
      title: "Um exemplo",
      note: "Exemplo ilustrativo",
      steps: [
        { label: "Sinal", text: "Um lote de produto vence em 30 dias." },
        { label: "Pulse identifica", text: "Os procedimentos que usam esse produto." },
        { label: "Pulse cruza", text: "Pacientes com histórico compatível e retorno próximo." },
        { label: "Ação", text: "Uma campanha para esse grupo, pronta para revisar." },
        { label: "Resultado", text: "A oportunidade é recuperada antes do prejuízo." },
      ],
    },
  },

  close: {
    chapter: "Conhecer o Pulse",
    title: "Veja o Pulse com os dados da sua clínica.",
    lead: "Explore a demo com dados fictícios. Depois, a sua clínica testa o Pulse com os próprios dados, com o acompanhamento da Wuavy.",
    cta: "Quero testar o Pulse",
    demo: { href: "/pulse/demo", ready: true, label: "Conhecer o Pulse na demo", soon: "Demo interativa em breve" },
  },
};
