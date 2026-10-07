import Link from "next/link";

import type { PassoCopy } from "@/data/passo";
import type { ServiceId, ServiceText } from "@/data/services";
import type { NavItem } from "@/lib/types";
import type { LegalContext, LegalDoc } from "../types";

/*
  Português (Brasil): every word of the public site, in one place. The
  pt-PT dictionary has the same shape (TypeScript checks it), so a line added
  here and forgotten there fails the build instead of mixing languages.
  "approved" = line from propostas/a-frequencia; "new" = written for the site.
  Nothing here states a client, a result or a metric: only what WUAVY offers
  and how it works.
*/

const nav: NavItem[] = [
  { label: "Pulse", href: "/pulse", hint: "Crescimento para clínicas" },
  { label: "Serviços", href: "/#servicos" },
  { label: "Sistemas", href: "/#sistemas" },
  { label: "Projetos", href: "/#projetos" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contato", href: "/#contato" },
];

const services: Record<ServiceId, ServiceText> = {
  sites: {
    name: "Sites",
    outcome: "Converter a atenção.",
    summary: "Um site estratégico e personalizado, desenhado em torno de uma ação e pronto para receber tráfego.",
    deliverables: [
      "Site estratégico e personalizado",
      "Design responsivo",
      "Desenvolvimento",
      "Estrutura pensada para conversão",
      "Otimização para desktop e mobile",
      "Publicação e configuração inicial",
    ],
  },
  "trafego-pago": {
    name: "Gestão de tráfego",
    outcome: "Encontrar o mercado.",
    summary: "Campanhas planejadas por frequência: o público certo vê a mensagem certa quantas vezes for preciso.",
    deliverables: [
      "Estratégia de campanhas",
      "Gestão de Meta Ads",
      "Criação e organização das campanhas",
      "Otimizações",
      "Acompanhamento",
      "Análise de resultados",
    ],
    note: "A verba de anúncios é paga direto às plataformas e não está inclusa na gestão.",
  },
  sistemas: {
    name: "Sistemas de crescimento",
    outcome: "Manter o movimento.",
    summary: "IA, automações, CRM, aplicativos e integrações feitos sob medida para a operação vender mais.",
    deliverables: ["Atendimento & Vendas", "Automação", "Sistemas & CRM", "IA & Dados"],
  },
};

const BRAND = "Sua marca já tem uma identidade visual bem definida?";
const brandYes = "Minha marca já tem identidade visual definida.";
const brandNo = "Minha marca ainda não tem uma identidade visual definida.";

const passo: PassoCopy = {
  guide: {
    name: "PASSO",
    kicker: "Diagnóstico",
    hello: "Posso te ajudar a descobrir o que sua empresa precisa agora?",
    start: "Quero descobrir",
    later: "Agora não",
    resultKicker: "O PASSO recomenda",
    path: "Caminho de crescimento",
    pathNext: "depois",
    ask: "Quer que a Wuavy monte isso para você?",
    cta: "Falar com a Wuavy",
    restart: "Refazer",
    close: "Fechar",
    open: "Falar com o PASSO: descubra o que sua empresa precisa",
    hint: "Oi, posso ajudar?",
    back: "← Voltar",
    progress: "Pergunta {done} de {total}.",
    now: "(agora)",
  },
  stages: { identidade: "Identidade", website: "Website", trafego: "Tráfego", automacao: "Automação" },
  questions: {
    goal: {
      text: "O que você mais quer melhorar hoje?",
      answers: [
        { label: "Conseguir mais clientes", say: "Meu objetivo é conseguir mais clientes.", next: "hasSite" },
        { label: "Ter um site melhor", say: "Quero um site melhor.", next: "brandForSite" },
        { label: "Melhorar minha marca", say: "Quero melhorar minha marca.", next: "brandSite" },
        { label: "Automatizar processos", say: "Quero automatizar processos.", next: "bottleneck" },
        { label: "Não sei ainda", say: "Ainda não sei bem o que preciso.", next: "pain" },
      ],
    },
    hasSite: {
      text: "Você já tem um site ou landing page preparada para receber visitantes?",
      answers: [
        { label: "Sim, e funciona bem", say: "Já tenho um site que funciona bem.", next: "handling" },
        { label: "Tenho, mas não converte", say: "Já tenho um site, mas ele não converte bem.", next: "websiteTrafego" },
        { label: "Ainda não tenho", say: "Ainda não tenho site.", next: "brandForAds" },
      ],
    },
    handling: {
      text: "E quando um contato chega, como ele é atendido?",
      answers: [
        { label: "Rápido e organizado", say: "O atendimento hoje é rápido e organizado.", next: "trafego" },
        { label: "Na mão, e alguns se perdem", say: "O atendimento é manual e alguns contatos se perdem.", next: "trafegoCrm" },
      ],
    },
    brandForAds: {
      text: BRAND,
      answers: [
        { label: "Sim, bem definida", say: brandYes, next: "websiteTrafego" },
        { label: "Não, ou precisa renovar", say: brandNo, next: "identidadeWebsite" },
      ],
    },
    brandForSite: {
      text: BRAND,
      answers: [
        { label: "Sim, bem definida", say: brandYes, next: "siteAds" },
        { label: "Não, ou precisa renovar", say: brandNo, next: "identidadeWebsite" },
      ],
    },
    siteAds: {
      text: "Com o site no ar, você pretende investir em anúncios para atrair clientes?",
      answers: [
        { label: "Sim, quero atrair clientes", say: "Depois do site, quero investir em anúncios.", next: "websiteTrafego" },
        { label: "Por enquanto, só o site", say: "Por enquanto quero só o site.", next: "website" },
      ],
    },
    brandSite: {
      text: "Você pretende também criar ou renovar o site?",
      answers: [
        { label: "Sim, junto com a marca", say: "Também quero criar ou renovar o site.", next: "identidadeWebsite" },
        { label: "Por enquanto, só a marca", say: "Por enquanto quero cuidar só da marca.", next: "identidade" },
      ],
    },
    bottleneck: {
      text: "Onde está o maior gargalo hoje?",
      answers: [
        { label: "Atendimento", say: "Meu maior gargalo é o atendimento.", next: "atendimento" },
        { label: "Organização de leads (CRM)", say: "Meu maior gargalo é organizar os leads.", next: "crm" },
        { label: "Tarefas repetitivas", say: "Meu maior gargalo são as tarefas repetitivas.", next: "processos" },
      ],
    },
    pain: {
      text: "Qual destes pesa mais hoje?",
      answers: [
        { label: "Poucas vendas", say: "Meu maior problema hoje são poucas vendas.", next: "salesSite" },
        { label: "Marca pouco profissional", say: "Sinto que minha marca não passa profissionalismo.", next: "brandSite" },
        { label: "Site ruim ou inexistente", say: "Meu site é ruim ou não existe.", next: "brandCheck" },
        { label: "Muito trabalho manual", say: "Gasto muito tempo com trabalho manual.", next: "bottleneck" },
      ],
    },
    salesSite: {
      text: "Você já tem um site preparado para vender?",
      answers: [
        { label: "Sim, tenho", say: "Já tenho um site preparado para vender.", next: "trafego" },
        { label: "Não, ou não converte", say: "Não tenho um site que converta.", next: "websiteTrafego" },
      ],
    },
    brandCheck: {
      text: BRAND,
      answers: [
        { label: "Sim, bem definida", say: brandYes, next: "website" },
        { label: "Não, ou precisa renovar", say: brandNo, next: "identidadeWebsite" },
      ],
    },
  },
  results: {
    trafego: {
      title: "Tráfego Pago",
      service: "Tráfego Pago",
      why: "Seu site já está pronto para receber visitas; o que falta é levar as pessoas certas até ele. Com campanhas acompanhadas de perto, cada real vai para onde traz retorno.",
      now: ["trafego"],
    },
    trafegoCrm: {
      title: "Tráfego Pago + CRM",
      service: "Tráfego Pago + CRM e Automação",
      why: "Mais contatos só viram vendas se nenhum se perder no caminho. O tráfego traz as oportunidades, e um CRM com automação garante que cada uma seja respondida e acompanhada.",
      now: ["trafego", "automacao"],
    },
    websiteTrafego: {
      title: "Website + Tráfego",
      service: "Website + Tráfego",
      why: "Seu próximo passo é um site focado em conversão antes de aumentar o investimento em tráfego. Assim, quem chega pelos anúncios encontra uma estrutura pronta para virar oportunidade.",
      now: ["website", "trafego"],
    },
    identidadeWebsite: {
      title: "Identidade Visual + Website",
      service: "Identidade Visual + Website",
      why: "Antes de atrair mais gente, a marca precisa transmitir a confiança que o seu trabalho já tem. Identidade e site feitos juntos falam a mesma língua, e o tráfego entra depois sobre uma base sólida.",
      now: ["identidade", "website"],
    },
    website: {
      title: "Website",
      service: "Website",
      why: "Sua marca já está definida; falta um site à altura dela. Rápido, claro e pensado para conversão, ele transforma visitas em contatos e prepara o terreno para o tráfego.",
      now: ["website"],
    },
    identidade: {
      title: "Identidade Visual",
      service: "Identidade Visual",
      why: "Uma identidade bem construída faz a empresa parecer tão profissional quanto ela é. Ela vira a base de tudo o que vem depois: site, redes e anúncios.",
      now: ["identidade"],
    },
    atendimento: {
      title: "Automação do atendimento",
      service: "CRM / Automação / IA (atendimento)",
      why: "Responder rápido é o que separa um contato de uma venda. Com IA e automação no WhatsApp, ninguém fica esperando, e sua equipe entra só quando faz diferença.",
      now: ["automacao"],
    },
    crm: {
      title: "CRM e organização de leads",
      service: "CRM / Automação / IA (organização de leads)",
      why: "Hoje as oportunidades ficam espalhadas e algumas se perdem. Um CRM sob medida mostra cada contato, em que etapa ele está e o que fazer a seguir.",
      now: ["automacao"],
    },
    processos: {
      title: "Automação de processos",
      service: "CRM / Automação / IA (tarefas repetitivas)",
      why: "O tempo que vai para tarefas repetitivas sai do que faz a empresa crescer. Automatizamos o que se repete para sua equipe focar no que só ela faz.",
      now: ["automacao"],
    },
  },
  message: {
    hello: "Olá! Fiz o diagnóstico no site da Wuavy.",
    recommended: "O PASSO recomendou {service}.",
  },
};

const privacy = ({ email, whatsapp, talk }: LegalContext): LegalDoc => ({
  metaTitle: "Política de Privacidade",
  metaDescription: "Como a Wuavy trata dados pessoais no site e no Wuavy Pulse, de acordo com a LGPD.",
  title: "Política de Privacidade",
  updated: "Atualizada em 7 de outubro de 2026",
  lead: (
    <>
      Como a Wuavy trata dados pessoais no site wuavy.com e no Wuavy Pulse, o sistema de gestão e crescimento para
      clínicas, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).
    </>
  ),
  sections: [
    {
      title: "Quem faz o quê",
      body: (
        <p>
          No Wuavy Pulse, a <strong>clínica é a controladora</strong> dos dados dos seus pacientes e contatos: é ela quem
          decide o que cadastrar e para quê. A <strong>Wuavy é a operadora</strong>: trata esses dados só para prestar o
          serviço, conforme as instruções da clínica. Sobre os dados da conta de quem usa o Pulse e de quem fala com a Wuavy
          pelo site, a Wuavy é a controladora.
        </p>
      ),
    },
    {
      title: "Que dados tratamos",
      body: (
        <ul>
          <li>
            <strong>Conta:</strong> nome, e-mail e senha de quem cria uma conta, inclusive só para conhecer a demonstração (a
            senha é guardada de forma criptografada pelo provedor de autenticação; a Wuavy não a vê). Registramos também por
            onde a conta chegou e as etapas que percorreu (acessou a demonstração, abriu a assinatura, assinou, configurou a
            clínica).
          </li>
          <li>
            <strong>Clínica:</strong> nome, WhatsApp, especialidade, tamanho da equipe, horário de atendimento e logo.
          </li>
          <li>
            <strong>Cadastrados pela clínica:</strong> pacientes e contatos (nome, telefone, observações comerciais),
            agendamentos, orçamentos, procedimentos e estoque. Como o procedimento agendado pode revelar informação de saúde,
            o acesso a esses dados é restrito à equipe da própria clínica.
          </li>
          <li>
            <strong>Prontuário, se a clínica usar:</strong> queixa principal e anotações de cada atendimento. São dados de
            saúde, sensíveis pela LGPD: só o responsável e os profissionais da clínica leem ou escrevem, nunca a recepção, e a
            restrição é aplicada no banco de dados. A clínica é a controladora e responde pelas regras do seu conselho
            profissional sobre prontuário; o registro no Pulse não tem certificação digital.
          </li>
          <li>
            <strong>Pagamento:</strong> quando a assinatura é feita online, o cartão é digitado no formulário do Mercado Pago;
            a Wuavy não vê nem guarda o número do cartão, só a situação da assinatura.
          </li>
          <li>
            <strong>Uso técnico:</strong> cookies essenciais para manter a sessão aberta e as preferências de tema e de
            idioma. Não usamos cookies de publicidade.
          </li>
        </ul>
      ),
    },
    {
      title: "Para que usamos",
      body: (
        <p>
          Para prestar o serviço contratado (agenda, pacientes, oportunidades e mensagens prontas), autenticar o acesso,
          cobrar a assinatura, dar suporte, manter a segurança e cumprir obrigações legais. As bases legais são a execução do
          contrato, o legítimo interesse (segurança e prevenção de fraude) e o cumprimento de obrigação legal. Para os dados
          dos pacientes, a base legal é definida pela clínica, como controladora. Com a conta criada para a demonstração, a
          Wuavy pode entrar em contato sobre o Pulse (legítimo interesse).
        </p>
      ),
    },
    {
      title: "Com quem compartilhamos",
      body: (
        <p>
          Só com os provedores necessários para o serviço funcionar: Supabase (banco de dados e autenticação), Vercel
          (hospedagem) e Mercado Pago (pagamentos, quando a assinatura é online). Alguns desses provedores podem processar
          dados em servidores fora do Brasil. As mensagens preparadas pelo Pulse são enviadas pela própria clínica, no
          WhatsApp dela: o Pulse não envia mensagens. A Wuavy não vende dados pessoais.
        </p>
      ),
    },
    {
      title: "Segurança",
      body: (
        <p>
          Cada clínica só acessa os próprios dados: o isolamento é aplicado no banco de dados, a cada consulta. A conexão é
          criptografada (HTTPS), as senhas não ficam em texto e as chaves de acesso ficam só no servidor.
        </p>
      ),
    },
    {
      title: "Por quanto tempo",
      body: (
        <p>
          Enquanto a conta estiver ativa. Se a assinatura for cancelada, os dados continuam disponíveis para consulta até a
          clínica pedir a exclusão. Pedida a exclusão, os dados são apagados em até 30 dias, salvo o que a lei obrigar a
          guardar.
        </p>
      ),
    },
    {
      title: "Seus direitos",
      body: (
        <>
          <p>
            Você pode pedir a confirmação de que tratamos seus dados, o acesso, a correção, a anonimização, o bloqueio ou a
            eliminação, a portabilidade (uma cópia), informação sobre com quem compartilhamos e a revogação de um
            consentimento. Peça pelo e-mail <a href={`mailto:${email}`}>{email}</a> ou pelo{" "}
            <a href={talk} target="_blank" rel="noopener noreferrer">
              WhatsApp {whatsapp}
            </a>
            . Se você é paciente de uma clínica que usa o Pulse, faça o pedido à clínica: a Wuavy ajuda a clínica a atender.
          </p>
          <p>A exportação dos dados da clínica direto pelo Pulse chega em breve; até lá, ela é feita a pedido.</p>
        </>
      ),
    },
    {
      title: "Mudanças nesta política",
      body: <p>Quando esta política mudar, a data acima muda e as mudanças importantes são avisadas no Pulse.</p>,
    },
  ],
});

const terms = ({ talk, price, privacyHref }: LegalContext): LegalDoc => ({
  metaTitle: "Termos de Uso",
  metaDescription: "Os termos de uso do Wuavy Pulse, o sistema de gestão e crescimento para clínicas.",
  title: "Termos de Uso",
  updated: "Atualizados em 6 de outubro de 2026",
  lead: (
    <>
      Estes termos valem para o uso do Wuavy Pulse. Ao criar uma conta, você concorda com eles e com a{" "}
      <Link href={privacyHref}>Política de Privacidade</Link>.
    </>
  ),
  sections: [
    {
      title: "O serviço",
      body: (
        <p>
          O Wuavy Pulse é um sistema na web para clínicas organizarem pacientes, vendas, agenda, procedimentos e estoque, e
          encontrarem oportunidades a partir desses dados. O que aparece no Pulse marcado como <strong>Em breve</strong> ainda
          não faz parte do serviço.
        </p>
      ),
    },
    {
      title: "A conta",
      body: (
        <p>
          Quem cria a conta responde pela clínica no Pulse e pelas informações cadastradas. Mantenha a senha em segredo e
          avise a Wuavy se suspeitar de acesso indevido.
        </p>
      ),
    },
    {
      title: "Plano e pagamento",
      body: (
        <p>
          O plano Wuavy Pulse custa {price} por mês, cobrados mensalmente. A contratação é feita com a Wuavy ou, quando
          disponível, online, com cobrança recorrente no cartão pelo Mercado Pago. Com a assinatura em atraso ou cancelada, o
          Pulse fica disponível só para consulta: nenhum dado é apagado por isso. O cancelamento interrompe as cobranças
          seguintes.
        </p>
      ),
    },
    {
      title: "Uso adequado",
      body: (
        <ul>
          <li>Cadastre só dados de que a clínica precisa para atender e vender, com base legal para isso (LGPD).</li>
          <li>
            O prontuário do Pulse (queixa principal e anotações) é um registro de apoio, sem certificação digital: não
            substitui o prontuário exigido pelo conselho profissional da clínica, que continua responsável por ele. Só o
            responsável e os profissionais acessam esses registros.
          </li>
          <li>
            As mensagens preparadas pelo Pulse são enviadas pela clínica, no WhatsApp dela, e são de responsabilidade da
            clínica. Não use o Pulse para mensagens em massa sem consentimento.
          </li>
          <li>Não tente acessar dados de outra clínica nem interferir no funcionamento do serviço.</li>
        </ul>
      ),
    },
    {
      title: "Os dados são da clínica",
      body: (
        <p>
          Os dados cadastrados pertencem à clínica. A Wuavy os trata só para prestar o serviço, como operadora, nos termos da
          Política de Privacidade.
        </p>
      ),
    },
    {
      title: "O que o Pulse não promete",
      body: (
        <p>
          O Pulse sugere ações a partir dos dados cadastrados. A receita potencial que ele mostra é uma estimativa do que está
          ao alcance, não uma garantia de faturamento; as decisões e os contatos são da clínica. A Wuavy trabalha para manter
          o serviço disponível, sem garantir funcionamento ininterrupto.
        </p>
      ),
    },
    {
      title: "Mudanças e contato",
      body: (
        <p>
          Quando estes termos mudarem, a data acima muda e as mudanças importantes são avisadas no Pulse. Estes termos seguem
          a legislação brasileira. Dúvidas:{" "}
          <a href={talk} target="_blank" rel="noopener noreferrer">
            fale com a Wuavy
          </a>
          .
        </p>
      ),
    },
  ],
});

export const ptBR = {
  meta: {
    title: "WUAVY: sites, tráfego pago e sistemas de crescimento",
    description:
      "Agência de crescimento digital. Sites, gestão de tráfego pago e sistemas sob medida com IA, automações e CRM, no mesmo ritmo.",
  },

  ui: {
    skip: "Pular para o conteúdo",
    home: "WUAVY, página inicial",
    navMain: "Principal",
    menu: "Menu",
    menuNav: "Menu principal",
    close: "Fechar",
    footerNav: "Rodapé",
    backToTop: "Voltar ao topo ↑",
    loading: "Carregando",
    language: "Idioma",
    // The switch: short in the header, whole in the menu, and what a screen reader hears.
    languages: {
      "pt-BR": { short: "BR", name: "Brasil", label: "Português do Brasil" },
      "pt-PT": { short: "PT", name: "Portugal", label: "Português de Portugal" },
    },
    sections: {
      hero: "Início",
      services: "Serviços",
      systems: "Sistemas",
      manifesto: "Manifesto",
      faq: "FAQ",
      footer: "Rodapé",
    },
  },

  nav,
  cta: { label: "Falar sobre meu projeto", short: "WhatsApp" },

  contact: {
    // Pre-filled in every WhatsApp chat opened from the site.
    whatsapp: "Olá! Vim pelo site da Wuavy.",
    topics: { question: "Dúvida", privacy: "privacidade e dados", terms: "termos do Wuavy Pulse" },
  },

  home: {
    hero: {
      title: "Frequência vence volume.", // approved
      imageAlt: "Multidão atravessando uma rua, vista de cima, em preto e branco.",
      details: ["Agência de crescimento digital", "Sites, tráfego e sistemas", "Um só ritmo"], // new
      lead: "Sites, tráfego pago e sistemas sob medida para empresas que querem crescer com constância, não com sorte.", // new
      cta: "Quero melhorar meu negócio",
      secondary: { label: "Ver serviços", href: "#servicos" },
    },

    idea: {
      chapter: "Sobre",
      body: "Crescimento não é um estouro de ruído. É um sinal repetido com precisão: a mensagem certa, no canal certo, quantas vezes forem precisas para um mercado se mover.", // approved
      // Words of the body set in Signal as they light up.
      accents: ["precisão:"],
      positioning:
        "A WUAVY é uma agência de crescimento digital. Criamos sites, operamos tráfego pago e construímos sistemas que ajudam a operação a vender mais, tudo no mesmo ritmo.", // new
      valuesTitle: "Valores",
      values: [
        { name: "Frequência", text: "Constância vence estouro." },
        { name: "Precisão", text: "Nada entra só para enfeitar." },
        { name: "Sem ruído", text: "Direto, sem letra miúda." }, // "Performance sem ruído" (approved)
        { name: "Crescer junto", text: "Com o cliente, não à frente dele." }, // deslocamento (approved)
      ],
    },

    services: {
      chapter: "Serviços",
      headline: "Três formas de colocar o crescimento em movimento.", // new
      lead: "Você compra um resultado. As disciplinas são como chegamos lá.",
      includes: "O que inclui",
      cta: "Falar sobre meu projeto",
      more: "Conhecer sistemas",
    },

    systems: {
      chapter: "Sistemas de crescimento",
      headline: "Construímos sistemas personalizados para empresas que precisam ir além do marketing.", // new (from the brief)
      lead: "Quando o gargalo não é atenção, é operação: atendimento que não escala, vendas que dependem de planilha, dados espalhados. Desenhamos a solução e colocamos para rodar.", // new
      cta: "Solicitar diagnóstico",
      examples: "Exemplos",
      items: [
        {
          name: "Atendimento & Vendas",
          text: "Responder rápido e levar cada contato até a venda.",
          examples: [
            "Atendimento automatizado no WhatsApp",
            "Qualificação de leads",
            "Funis e automação comercial",
            "Passagem para a equipe na hora certa",
          ],
        },
        {
          name: "Automação",
          text: "Processos repetitivos rodando sozinhos.",
          examples: [
            "Tarefas repetitivas sem copiar e colar",
            "Site, anúncios, CRM e pagamentos integrados",
            "Planilhas e ferramentas conversando entre si",
          ],
        },
        {
          name: "Sistemas & CRM",
          text: "Ferramentas sob medida para o jeito que sua empresa trabalha.",
          examples: ["CRM com o funil à vista", "Sistemas internos", "Aplicativos web e mobile para clientes ou para a equipe"],
        },
        {
          name: "IA & Dados",
          text: "IA onde ela economiza tempo, e os números à vista.",
          examples: [
            "IA aplicada ao seu negócio",
            "Agentes de IA com as regras da sua operação",
            "Dashboards atualizados sem esforço manual",
          ],
        },
      ],
    },

    manifesto: {
      lines: ["Crescer", "é sair do", "lugar."], // deslocamento (approved)
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
          name: "Proposta clara",
          text: "Escopo, prazo e investimento definidos antes de começar. O que não está incluso, como a verba de anúncios, fica dito desde o início.",
        },
        {
          name: "Decisão por dados",
          text: "Campanhas acompanhadas e analisadas continuamente. Ajustamos pelo que os números mostram, não por impressão.",
        },
      ],
    },

    work: {
      chapter: "Projetos",
      title: "Projetos recentes.",
      combo: "Combo",
      before: "Antes",
      after: "Depois",
    },

    faq: {
      chapter: "Perguntas frequentes",
      headline: "Antes de começar.",
      more: "Ficou alguma dúvida?",
      ask: "Pergunte direto",
      items: [
        {
          q: "Quanto custa um site?",
          a: "O investimento vem na proposta, depois de uma conversa sobre o projeto. Todo site inclui estratégia, design responsivo, desenvolvimento, estrutura pensada para conversão, otimização para desktop e mobile, publicação e configuração inicial.",
        },
        {
          q: "A verba de anúncios está inclusa na gestão de tráfego?",
          a: "Não. A gestão cobre estratégia, criação e organização das campanhas, otimizações, acompanhamento e análise de resultados. A verba é paga direto às plataformas de anúncio, e o valor é definido junto com você conforme o objetivo.",
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
      cta: "Solicitar diagnóstico",
    },

    footer: {
      signature: "Um módulo, um ângulo, um intervalo.", // approved (the gesture)
      rights: "Todos os direitos reservados.",
      navTitle: "Navegação",
      servicesTitle: "Serviços",
      contactTitle: "Contato",
      socialTitle: "Redes",
      // A link without href shows as plain text, until its page exists.
      legal: [
        { label: "Política de privacidade", href: "/privacidade" },
        { label: "Termos de uso", href: "/termos" },
      ] as { label: string; href: string }[],
    },
  },

  services,
  passo,

  /*
    Wuavy Pulse: the landing's copy. The product lives inside "Sistemas de
    crescimento"; its first market is aesthetic clinics. Every example here is
    illustrative and is labelled so on the page: no promised numbers. (The
    product was called Wuavy Flow; the code keeps that name inside.)
  */
  pulse: {
    name: "Wuavy Pulse",
    pitch: "Sistema operacional de crescimento para clínicas",
    meta: {
      title: "Wuavy Pulse",
      description:
        "Wuavy Pulse é o sistema operacional de crescimento para clínicas: agenda, pacientes, vendas e estoque trabalhando juntos para encontrar oportunidades antes que elas virem prejuízo.",
    },

    hero: {
      label: "Wuavy Pulse",
      market: "Começando por clínicas de estética",
      title: "O Pulse observa a operação e mostra o que merece atenção agora.",
      lead: "Agenda, pacientes, vendas e estoque trabalhando juntos para encontrar oportunidades antes que elas virem prejuízo.",
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
        { name: "Leads que sumiram", text: "Pediram orçamento, não responderam e ninguém voltou a chamar.", action: "Follow-up" },
        {
          name: "Pacientes que não voltaram",
          text: "O intervalo do procedimento passou e o retorno não foi marcado.",
          action: "Reativação",
        },
        { name: "Horários vazios", text: "Um cancelamento abre a agenda e o horário fica parado.", action: "Preenchimento de agenda" },
        {
          name: "Estoque perto da validade",
          text: "Produto parado vira prejuízo quando a data chega.",
          action: "Campanha antes do vencimento",
        },
      ],
    },

    how: {
      chapter: "Como funciona",
      title: "Observa a operação, identifica oportunidades e mostra onde agir.",
      lead: "Cada parte alimenta a próxima: um atendimento finalizado baixa o estoque, calcula o retorno e deixa a próxima oportunidade pronta.",
      stages: [
        { name: "Atrair", text: "Cada lead chega com origem e interesse registrados." },
        { name: "Organizar", text: "Pacientes, agenda, procedimentos e estoque conectados." },
        { name: "Identificar", text: "Silêncio, retorno vencido, horário vago, validade: o Pulse lê os sinais." },
        { name: "Agir", text: "A próxima ação chega pronta. A equipe revisa e aprova." },
        { name: "Recuperar", text: "O que ficou para trás volta como oportunidade." },
        { name: "Reter", text: "Retornos no tempo certo. Pós-atendimento automático em breve." },
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
  },

  // Each case's words; its facts and media are in src/data/cases.ts.
  cases: {
    melde: {
      tagline: "Marca, rótulo e landing de lançamento de um mel cremoso.",
      segment: "Alimentos · mel cremoso",
      scope: ["Identidade visual", "Landing page"],
      summary:
        "Uma marca de mel cremoso criada do zero: o nome em minúsculas com o ê como assinatura, o rótulo, o design system e a landing que valida o lançamento antes da loja.",
      body: {
        challenge:
          "Mel cremoso é pouco conhecido e, quando aparece, vem vestido de rústico: abelha, favo, papel kraft. A Meldê precisava parecer um produto de prateleira desejável, perto do doce de leite no uso e longe da loja natural e do suplemento.",
        approach:
          "Criamos a identidade do zero e fizemos da página o rótulo do pote aberto em plano: fundos branco de rótulo e marrom de tampa, o dourado guardado para o produto e para a ação, fotografia macro da textura e um único fio de mel que atravessa a página do topo até o pedido final.",
        outcome:
          "Uma marca pronta para a prateleira e para a loja: logo, rótulo, manual de marca, design system documentado e uma landing leve com lista de espera, que mede o interesse antes do e-commerce.",
      },
      highlights: [
        {
          title: "Um fio de mel que acompanha a leitura",
          text: "Desenhado em SVG a partir do layout real, o fio cresce com o scroll: grosso na colher, afinando com o peso, com borda âmbar e uma gota na ponta. A cada quadro só o trecho da ponta é redesenhado.",
        },
        {
          title: "Rótulo aplicado por código",
          text: "O pote de referência foi gerado com o rótulo em branco. O rótulo real foi enrolado no vidro por projeção cilíndrica e recortado com máscara própria, num script em Python.",
        },
        {
          title: "Design system pronto para a loja",
          text: "Cores, tipografia, espaçamento e movimento em tokens CSS; botões, campos, tabelas e janelas como componentes separados da página. O e-commerce nasce sobre a mesma base.",
        },
        {
          title: "Leve, sem framework",
          text: "HTML, CSS e JavaScript puros, sem build: uma única fonte variável hospedada no projeto, imagens WebP responsivas e nenhuma dependência externa.",
        },
        {
          title: "Acessível por padrão",
          text: "Contraste AA verificado nos pares de texto, seletor de momentos navegável pelo teclado e, com “reduzir movimento” ativo, a página aparece pronta e o fio já desenhado.",
        },
      ],
      alt: {
        film: "Gravação da landing da Meldê rolando do topo ao rodapé, no computador e no celular.",
        cover: "Topo da landing da Meldê: o título “Mel, só que cremoso.” ao lado do pote e de uma colher puxando o mel.",
        label:
          "A frente do pote em escala de parede: rótulo meldê, Original, mel cremoso, 100% mel e 250 g, com o creme aparecendo pelo vidro.",
        phones: "Três telas da landing no celular: o topo com o pote, a frente do rótulo e a lista de espera.",
        brandbook: "Capa do manual de marca: o wordmark meldê em creme sobre marrom, com o circunflexo dourado.",
        colours: "Página de cor do manual: mel dourado, marrom profundo, branco e creme.",
      },
    },
    "vida-natural": {
      tagline: "Redesign do site de uma fábrica de méis com mais de 40 anos.",
      segment: "Méis e produtos naturais",
      scope: ["Redesign de site"],
      summary:
        "A fábrica, a marca e os produtos já existiam; o site não mostrava o peso deles. Redesenhamos o site existente para apresentar tudo com clareza.",
      body: {
        challenge:
          "O site anterior funcionava como um catálogo: um banner decorativo no topo, as categorias concentradas em um único menu e os produtos listados sem contexto. A história de uma fábrica com quatro décadas não aparecia na tela.",
        approach:
          "Partimos do site e da marca que já existiam. Reorganizamos a navegação em torno do que o cliente procura (méis, própolis e abelhas sem ferrão), demos à fotografia de produto o papel principal e alinhamos cores e tipografia do site à identidade da marca.",
        outcome:
          "Um site à altura da fábrica: visual moderno, conteúdo organizado, navegação direta e produtos apresentados como protagonistas.",
      },
      highlights: [
        {
          title: "Catálogo real, nada inventado",
          text: "Produtos, preços, descrições e fotos foram extraídos do site antigo e levados para um banco de dados. Um script recorta o fundo branco das fotos, para as embalagens flutuarem sobre a página.",
        },
        {
          title: "Preço calculado no servidor",
          text: "O navegador nunca envia preço: o carrinho é recalculado a partir do banco a cada mudança e de novo antes de o pedido ser gravado.",
        },
        {
          title: "Checkout pronto para ativar",
          text: "Mercado Pago com PIX, cartão e boleto e webhook assinado. Sem as credenciais, o pedido segue pelo WhatsApp, como a loja já opera.",
        },
        {
          title: "Testado de ponta a ponta",
          text: "Fluxo de compra, interface e links cobertos por testes automatizados, sem quebra de layout em cinco larguras de tela.",
        },
      ],
      changes: [
        "Visual moderno",
        "Conteúdo organizado",
        "Navegação mais clara",
        "Produtos em destaque",
        "Apresentação mais profissional",
      ],
      alt: {
        before: "Página inicial antiga da Vida Natural: banner decorativo e menu de categorias.",
        cover: "Nova página inicial da Vida Natural: título editorial e os produtos em destaque.",
      },
    },
  },

  // The case page's frame, the same for every case.
  caseStudy: {
    back: "Projetos",
    live: "Ver o site no ar ↗",
    client: "Cliente",
    segment: "Segmento",
    combo: "Combo",
    service: "Serviço",
    services: "Serviços",
    year: "Ano",
    beforeAfter: "Antes e depois",
    before: "Antes",
    after: "Depois",
    challenge: "Desafio",
    approach: "O que fizemos",
    film: "Em movimento",
    highlights: "Destaques técnicos",
    stack: "Stack",
    outcome: "O que mudou",
    preparing: "Em preparação",
    preparingText:
      "Este case ainda está sendo escrito. Quando publicado, esta página mostra o desafio, o que construímos e o que mudou, com resultados verificados.",
    next: "Próximo case",
    sections: { intro: "Case", content: "Conteúdo" },
  },

  notFound: {
    meta: "Página não encontrada",
    section: "Não encontrada",
    title: "Esta página não existe.",
    back: "Voltar ao início",
  },

  legal: { privacy, terms },
};
