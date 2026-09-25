/*
  Home page copy, in one place so a second language can mirror it later.
  "approved" = line from propostas/a-frequencia; "new" = written for the site.
  Nothing here states a client, a result or a metric: only what WUAVY offers
  and how it works.
*/

export const home = {
  hero: {
    details: ["Agência de crescimento digital", "Sites, tráfego e sistemas", "Um só ritmo"], // new
    lead: "Sites, tráfego pago e sistemas sob medida para empresas que querem crescer com constância, não com sorte.", // new
    secondary: { label: "Ver serviços", href: "#servicos" },
  },

  idea: {
    chapter: "Ideia",
    body: "Crescimento não é um estouro de ruído. É um sinal repetido com precisão: a mensagem certa, no canal certo, quantas vezes forem precisas para um mercado se mover.", // approved
    positioning:
      "A WUAVY é uma agência de crescimento digital. Criamos sites, operamos tráfego pago e construímos sistemas que ajudam a operação a vender mais, tudo no mesmo ritmo.", // new
    valuesTitle: "Valores",
    values: [
      { name: "Frequência", text: "Constância vence estouro. Repetimos o que funciona até o mercado responder." },
      { name: "Precisão", text: "Cada decisão tem um motivo e uma medida. Nada entra só para enfeitar." },
      { name: "Sem ruído", text: "Comunicação direta, escopo claro e o que está incluso dito desde o início." }, // "Performance sem ruído" (approved)
      { name: "Crescer junto", text: "Uma agência que cresce junto com o cliente, não à frente dele." }, // deslocamento (approved)
    ],
  },

  services: {
    chapter: "Serviços",
    headline: "Três formas de colocar o crescimento em movimento.", // new
    lead: "Você compra um resultado. As disciplinas são como chegamos lá.",
    includes: "O que inclui",
    cta: "Solicitar orçamento",
    more: "Conhecer sistemas",
  },

  systems: {
    chapter: "Sistemas de crescimento",
    headline: "Construímos sistemas personalizados para empresas que precisam ir além do marketing.", // new (from the brief)
    lead: "Quando o gargalo não é atenção, é operação: atendimento que não escala, vendas que dependem de planilha, dados espalhados. Desenhamos a solução e colocamos para rodar.", // new
    price: "Sob consulta",
    priceLabel: "Projeto personalizado",
    cta: "Solicitar diagnóstico",
    items: [
      { name: "Inteligência artificial", text: "IA aplicada ao seu negócio, onde ela economiza tempo ou vende mais." },
      { name: "Agentes de IA", text: "Agentes que respondem, qualificam e executam tarefas com as regras da sua operação." },
      { name: "Automações", text: "Processos repetitivos rodando sozinhos, sem copiar e colar entre ferramentas." },
      { name: "Atendimento", text: "Automação de atendimento que responde rápido e passa para a equipe quando precisa." },
      { name: "Comercial", text: "Automação comercial e funis que levam o contato do primeiro clique à venda." },
      { name: "CRM", text: "Cada contato, conversa e oportunidade em um só lugar, com o funil à vista." },
      { name: "Aplicativos", text: "Aplicativos web e mobile para clientes ou para a equipe." },
      { name: "Sistemas internos", text: "Ferramentas sob medida para o jeito que a sua empresa trabalha." },
      { name: "Integrações", text: "Site, anúncios, CRM, pagamentos e planilhas conversando entre si." },
      { name: "Dashboards", text: "Os números que importam em um painel, atualizados sem esforço manual." },
    ],
  },

  manifesto: {
    lines: ["Frequência", "vence", "volume."], // approved
  },

  differentials: {
    chapter: "Diferenciais",
    headline: "O que muda quando o crescimento vira sistema.", // new
    items: [
      {
        name: "Um só sistema",
        text: "Site, tráfego e automação planejados juntos. A mensagem que atrai é a mesma que converte.",
      },
      {
        name: "Diagnóstico antes da proposta",
        text: "Entendemos a operação antes de recomendar qualquer coisa. A proposta vem do que você precisa agora, não de um pacote pronto.",
      },
      {
        name: "Preço claro",
        text: "Sites e gestão de tráfego com valor publicado. O que não está incluso, como a verba de anúncios, fica dito desde o início.",
      },
      {
        name: "Decisão por dados",
        text: "Campanhas acompanhadas e analisadas continuamente. Ajustamos pelo que os números mostram, não por impressão.",
      },
      {
        name: "Além do marketing",
        text: "Quando atrair clientes não basta, construímos o que falta: IA, automações, CRM e aplicativos sob medida.",
      },
    ],
  },

  work: {
    chapter: "Projetos",
    title: "Projetos selecionados",
    lead: "Cada projeto é medido pelo que move, não pelo que mostra.",
    placeholderTag: "Em preparação",
    open: "Ver case",
  },

  faq: {
    chapter: "Perguntas frequentes",
    headline: "Antes de começar.",
    items: [
      {
        q: "Quanto custa um site?",
        a: "R$ 1.099, em investimento único. Inclui estratégia, design responsivo, desenvolvimento, estrutura pensada para conversão, otimização para desktop e mobile, publicação e configuração inicial.",
      },
      {
        q: "A verba de anúncios está inclusa na gestão de tráfego?",
        a: "Não. A gestão custa R$ 1.099 por mês e cobre estratégia, criação e organização das campanhas, otimizações, acompanhamento e análise de resultados. A verba é paga direto às plataformas de anúncio, e o valor é definido junto com você conforme o objetivo.",
      },
      {
        q: "Quais plataformas de anúncio vocês gerenciam?",
        a: "A gestão é feita em Meta Ads, que cobre Instagram e Facebook.",
      },
      {
        q: "Preciso contratar site e tráfego juntos?",
        a: "Não. Cada serviço pode ser contratado separadamente. Juntos, funcionam como um só sistema: o tráfego leva as pessoas certas a um site feito para convertê-las.",
      },
      {
        q: "Como funciona o orçamento dos sistemas de crescimento?",
        a: "Cada sistema é um projeto personalizado. Começamos por um diagnóstico da operação e, a partir dele, enviamos escopo, prazo e investimento.",
      },
      {
        q: "Em quanto tempo o projeto fica pronto?",
        a: "Depende do escopo e da entrega de conteúdo. O prazo é definido no diagnóstico e você recebe o cronograma antes de começar.",
      },
      {
        q: "Como começamos?",
        a: "Você envia uma mensagem contando o que quer mover. Marcamos uma conversa de diagnóstico e, depois dela, você recebe a proposta.",
      },
    ],
  },

  contact: {
    chapter: "Contato",
    lines: ["Faça o", "mercado", "se mover."], // approved
    body: "Conte o que você quer mover e para onde. A conversa começa pelo diagnóstico e termina com uma proposta clara.", // new
  },

  footer: {
    signature: "Um módulo, um ângulo, um intervalo.", // approved (the gesture)
    rights: "Todos os direitos reservados.",
    navTitle: "Navegação",
    servicesTitle: "Serviços",
    contactTitle: "Contato",
    socialTitle: "Redes",
    // TODO(legal): criar a página de privacidade. Sem href, o item aparece como texto.
    legal: [{ label: "Política de privacidade", href: "" }],
  },
} as const;
