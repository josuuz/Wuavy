/*
  Wuavy Flow: the landing's copy. The product lives inside "Sistemas de
  crescimento"; its first market is aesthetic clinics. Every example here is
  illustrative and is labelled so on the page: no promised numbers.
*/

export const flow = {
  name: "Wuavy Flow",
  pitch: "CRM + IA + Automações",
  meta: {
    title: "Wuavy Flow",
    description:
      "CRM, automações, operação e inteligência para encontrar a receita que passa despercebida. Começando por clínicas de estética.",
  },

  hero: {
    label: "Wuavy Flow",
    market: "Começando por clínicas de estética",
    title: "Transforme oportunidades esquecidas em crescimento.",
    lead: "Leads que sumiram, pacientes que não voltaram, horários vazios e estoque próximo da validade. O Flow conecta os dados da sua operação e mostra onde agir.",
    cta: "Quero conhecer o Flow",
    secondary: { label: "Ver como funciona", href: "#como-funciona" },
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
        tag: "O Flow identifica",
        text: "O Flow percebe o silêncio antes que o lead esfrie e cruza o interesse com a agenda.",
        detail: ["Interesse alto", "Instagram", "Quinta, 10h livre"],
      },
      {
        tag: "Ação sugerida",
        text: "A próxima mensagem já vem pronta. A equipe revisa e decide enviar.",
        detail: ["Follow-up com horário sugerido"],
      },
    ],
    done: "Isso é o Flow: ver o que ficou para trás e sugerir o próximo passo.",
  },

  gaps: {
    chapter: "O que passa despercebido",
    title: "A receita já estava na clínica. Só ficou para trás.",
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
    title: "Não é mais um CRM. É o fluxo inteiro da clínica.",
    lead: "CRM, automações, operação e inteligência no mesmo lugar, conectados para mostrar onde agir.",
    stages: [
      { name: "Atrair", text: "Cada lead chega com origem e interesse registrados." },
      { name: "Organizar", text: "Pacientes, agenda, procedimentos e estoque conectados." },
      { name: "Converter", text: "Do orçamento ao agendamento, sem lead parado." },
      { name: "Recuperar", text: "O que ficou para trás volta como oportunidade." },
      { name: "Reter", text: "Retornos no tempo certo e pós-atendimento." },
    ],
    example: {
      title: "Um exemplo",
      note: "Exemplo ilustrativo",
      steps: [
        { label: "Problema", text: "Um lote de produto vence em 30 dias." },
        { label: "Flow identifica", text: "Os procedimentos que usam esse produto." },
        { label: "Flow cruza", text: "Pacientes com histórico compatível e retorno próximo." },
        { label: "Ação", text: "Uma campanha para esse grupo, pronta para revisar." },
        { label: "Resultado", text: "A oportunidade é recuperada antes do prejuízo." },
      ],
    },
  },

  close: {
    chapter: "Conhecer o Flow",
    title: "Veja onde sua clínica pode crescer.",
    lead: "Uma conversa curta para entender a sua operação e mostrar como o Flow encontra oportunidades nela.",
    cta: "Quero conhecer o Flow",
    // The navigable demo lives at /flow/demo; set `ready` once it exists.
    demo: { href: "/flow/demo", ready: true, label: "Ver a demo", soon: "Demo interativa em breve" },
  },
};
