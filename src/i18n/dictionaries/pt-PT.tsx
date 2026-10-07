import Link from "next/link";

import type { PassoCopy } from "@/data/passo";
import type { ServiceId, ServiceText } from "@/data/services";
import type { NavItem } from "@/lib/types";
import type { LegalContext, LegalDoc } from "../types";
import type { ptBR } from "./pt-BR";

/*
  Português (Portugal). Written for Portugal, not converted: the same voice
  (short, direct, a strong verb) in the words people use there: equipa,
  contacto, telemóvel, ecrã, stock, à medida, registar. Marketing and tech
  terms that are the same on both sides stay as they are (site, landing,
  leads, CRM, design system, tráfego pago). Addressed with "você" implied,
  never said: the usual register for a company talking to a business there.
  Same shape as pt-BR, checked by TypeScript.
*/

const nav: NavItem[] = [
  { label: "Pulse", href: "/pulse", hint: "Crescimento para clínicas" },
  { label: "Serviços", href: "/#servicos" },
  { label: "Sistemas", href: "/#sistemas" },
  { label: "Projetos", href: "/#projetos" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contacto", href: "/#contato" },
];

const services: Record<ServiceId, ServiceText> = {
  sites: {
    name: "Sites",
    outcome: "Converter a atenção.",
    summary: "Um site estratégico e à medida, desenhado em torno de uma ação e pronto para receber tráfego.",
    deliverables: [
      "Site estratégico e à medida",
      "Design responsivo",
      "Desenvolvimento",
      "Estrutura pensada para a conversão",
      "Otimização para desktop e mobile",
      "Publicação e configuração inicial",
    ],
  },
  "trafego-pago": {
    name: "Gestão de tráfego",
    outcome: "Encontrar o mercado.",
    summary: "Campanhas planeadas por frequência: o público certo vê a mensagem certa tantas vezes quantas forem precisas.",
    deliverables: [
      "Estratégia de campanhas",
      "Gestão de Meta Ads",
      "Criação e organização das campanhas",
      "Otimizações",
      "Acompanhamento",
      "Análise de resultados",
    ],
    note: "O orçamento dos anúncios é pago diretamente às plataformas e não está incluído na gestão.",
  },
  sistemas: {
    name: "Sistemas de crescimento",
    outcome: "Manter o movimento.",
    summary: "IA, automações, CRM, aplicações e integrações feitos à medida para a operação vender mais.",
    deliverables: ["Atendimento & Vendas", "Automação", "Sistemas & CRM", "IA & Dados"],
  },
};

const BRAND = "A sua marca já tem uma identidade visual bem definida?";
const brandYes = "A minha marca já tem identidade visual definida.";
const brandNo = "A minha marca ainda não tem uma identidade visual definida.";

const passo: PassoCopy = {
  guide: {
    name: "PASSO",
    kicker: "Diagnóstico",
    hello: "Posso ajudar a descobrir do que a sua empresa precisa agora?",
    start: "Quero descobrir",
    later: "Agora não",
    resultKicker: "O PASSO recomenda",
    path: "Caminho de crescimento",
    pathNext: "depois",
    ask: "Quer que a Wuavy ponha isto de pé?",
    cta: "Falar com a Wuavy",
    restart: "Refazer",
    close: "Fechar",
    open: "Falar com o PASSO: descubra do que a sua empresa precisa",
    hint: "Olá, posso ajudar?",
    back: "← Voltar",
    progress: "Pergunta {done} de {total}.",
    now: "(agora)",
  },
  stages: { identidade: "Identidade", website: "Website", trafego: "Tráfego", automacao: "Automação" },
  questions: {
    goal: {
      text: "O que mais quer melhorar hoje?",
      answers: [
        { label: "Conseguir mais clientes", say: "O meu objetivo é conseguir mais clientes.", next: "hasSite" },
        { label: "Ter um site melhor", say: "Quero um site melhor.", next: "brandForSite" },
        { label: "Melhorar a minha marca", say: "Quero melhorar a minha marca.", next: "brandSite" },
        { label: "Automatizar processos", say: "Quero automatizar processos.", next: "bottleneck" },
        { label: "Ainda não sei", say: "Ainda não sei bem do que preciso.", next: "pain" },
      ],
    },
    hasSite: {
      text: "Já tem um site ou uma landing page preparada para receber visitas?",
      answers: [
        { label: "Sim, e funciona bem", say: "Já tenho um site que funciona bem.", next: "handling" },
        { label: "Tenho, mas não converte", say: "Já tenho um site, mas não converte bem.", next: "websiteTrafego" },
        { label: "Ainda não tenho", say: "Ainda não tenho site.", next: "brandForAds" },
      ],
    },
    handling: {
      text: "E quando chega um contacto, como é atendido?",
      answers: [
        { label: "Rápido e organizado", say: "Hoje, o atendimento é rápido e organizado.", next: "trafego" },
        { label: "À mão, e alguns perdem-se", say: "O atendimento é manual e alguns contactos perdem-se.", next: "trafegoCrm" },
      ],
    },
    brandForAds: {
      text: BRAND,
      answers: [
        { label: "Sim, bem definida", say: brandYes, next: "websiteTrafego" },
        { label: "Não, ou precisa de renovar", say: brandNo, next: "identidadeWebsite" },
      ],
    },
    brandForSite: {
      text: BRAND,
      answers: [
        { label: "Sim, bem definida", say: brandYes, next: "siteAds" },
        { label: "Não, ou precisa de renovar", say: brandNo, next: "identidadeWebsite" },
      ],
    },
    siteAds: {
      text: "Com o site online, pretende investir em anúncios para atrair clientes?",
      answers: [
        { label: "Sim, quero atrair clientes", say: "Depois do site, quero investir em anúncios.", next: "websiteTrafego" },
        { label: "Para já, só o site", say: "Para já, quero só o site.", next: "website" },
      ],
    },
    brandSite: {
      text: "Pretende também criar ou renovar o site?",
      answers: [
        { label: "Sim, com a marca", say: "Também quero criar ou renovar o site.", next: "identidadeWebsite" },
        { label: "Para já, só a marca", say: "Para já, quero tratar só da marca.", next: "identidade" },
      ],
    },
    bottleneck: {
      text: "Onde está hoje o maior entrave?",
      answers: [
        { label: "Atendimento", say: "O meu maior entrave é o atendimento.", next: "atendimento" },
        { label: "Organização de leads (CRM)", say: "O meu maior entrave é organizar os leads.", next: "crm" },
        { label: "Tarefas repetitivas", say: "O meu maior entrave são as tarefas repetitivas.", next: "processos" },
      ],
    },
    pain: {
      text: "Qual destes pesa mais hoje?",
      answers: [
        { label: "Poucas vendas", say: "O meu maior problema hoje são as poucas vendas.", next: "salesSite" },
        { label: "Marca pouco profissional", say: "Sinto que a minha marca não transmite profissionalismo.", next: "brandSite" },
        { label: "Site fraco ou inexistente", say: "O meu site é fraco ou não existe.", next: "brandCheck" },
        { label: "Muito trabalho manual", say: "Perco muito tempo com trabalho manual.", next: "bottleneck" },
      ],
    },
    salesSite: {
      text: "Já tem um site preparado para vender?",
      answers: [
        { label: "Sim, tenho", say: "Já tenho um site preparado para vender.", next: "trafego" },
        { label: "Não, ou não converte", say: "Não tenho um site que converta.", next: "websiteTrafego" },
      ],
    },
    brandCheck: {
      text: BRAND,
      answers: [
        { label: "Sim, bem definida", say: brandYes, next: "website" },
        { label: "Não, ou precisa de renovar", say: brandNo, next: "identidadeWebsite" },
      ],
    },
  },
  results: {
    trafego: {
      title: "Tráfego Pago",
      service: "Tráfego Pago",
      why: "O seu site já está pronto para receber visitas; falta levar-lhe as pessoas certas. Com campanhas acompanhadas de perto, cada euro vai para onde dá retorno.",
      now: ["trafego"],
    },
    trafegoCrm: {
      title: "Tráfego Pago + CRM",
      service: "Tráfego Pago + CRM e Automação",
      why: "Mais contactos só se tornam vendas se nenhum se perder pelo caminho. O tráfego traz as oportunidades, e um CRM com automação garante que cada uma é respondida e acompanhada.",
      now: ["trafego", "automacao"],
    },
    websiteTrafego: {
      title: "Website + Tráfego",
      service: "Website + Tráfego",
      why: "O seu próximo passo é um site focado na conversão, antes de aumentar o investimento em tráfego. Assim, quem chega pelos anúncios encontra uma estrutura pronta para se tornar oportunidade.",
      now: ["website", "trafego"],
    },
    identidadeWebsite: {
      title: "Identidade Visual + Website",
      service: "Identidade Visual + Website",
      why: "Antes de atrair mais gente, a marca tem de transmitir a confiança que o seu trabalho já tem. Identidade e site feitos em conjunto falam a mesma língua, e o tráfego entra depois sobre uma base sólida.",
      now: ["identidade", "website"],
    },
    website: {
      title: "Website",
      service: "Website",
      why: "A sua marca já está definida; falta um site à altura. Rápido, claro e pensado para a conversão, transforma visitas em contactos e prepara o terreno para o tráfego.",
      now: ["website"],
    },
    identidade: {
      title: "Identidade Visual",
      service: "Identidade Visual",
      why: "Uma identidade bem construída faz a empresa parecer tão profissional como é. Passa a ser a base de tudo o que vem depois: site, redes e anúncios.",
      now: ["identidade"],
    },
    atendimento: {
      title: "Automação do atendimento",
      service: "CRM / Automação / IA (atendimento)",
      why: "Responder depressa é o que separa um contacto de uma venda. Com IA e automação no WhatsApp, ninguém fica à espera, e a sua equipa só entra quando faz a diferença.",
      now: ["automacao"],
    },
    crm: {
      title: "CRM e organização de leads",
      service: "CRM / Automação / IA (organização de leads)",
      why: "Hoje as oportunidades andam dispersas e algumas perdem-se. Um CRM à medida mostra cada contacto, em que etapa está e o que fazer a seguir.",
      now: ["automacao"],
    },
    processos: {
      title: "Automação de processos",
      service: "CRM / Automação / IA (tarefas repetitivas)",
      why: "O tempo que vai para tarefas repetitivas sai do que faz a empresa crescer. Automatizamos o que se repete para a sua equipa se concentrar no que só ela faz.",
      now: ["automacao"],
    },
  },
  message: {
    hello: "Olá! Fiz o diagnóstico no site da Wuavy.",
    recommended: "O PASSO recomendou {service}.",
  },
};

/*
  Legal pages: the language is Portugal's (responsável pelo tratamento,
  subcontratante, palavra-passe, subscrição), the substance is still the
  Brazilian one. Before selling in Portugal, a lawyer must review (nothing
  below was invented to fill these gaps):
  - RGPD (Reg. UE 2016/679) instead of / beside the LGPD: legal bases (art. 6),
    health data (art. 9), DPO, the right to complain to the CNPD, transfers
    outside the EEA (Supabase, Vercel, Mercado Pago) and their safeguards.
  - Who the controller is (company, NIF, address) as RGPD art. 13 requires.
  - Cookies under the Portuguese ePrivacy law (Lei 41/2004).
  - Terms: governing law and courts (today Brazilian law), consumer rights
    (Decreto-Lei 24/2014: withdrawal), price in euros with VAT; today the
    plan is in R$ through Mercado Pago, which does not charge in Portugal.
*/
const privacy = ({ email, whatsapp, talk }: LegalContext): LegalDoc => ({
  metaTitle: "Política de Privacidade",
  metaDescription: "Como a Wuavy trata dados pessoais no site e no Wuavy Pulse, nos termos da LGPD.",
  title: "Política de Privacidade",
  updated: "Atualizada a 7 de outubro de 2026",
  lead: (
    <>
      Como a Wuavy trata dados pessoais no site wuavy.com e no Wuavy Pulse, o sistema de gestão e crescimento para
      clínicas, nos termos da Lei Geral de Proteção de Dados do Brasil (Lei 13.709/2018).
    </>
  ),
  sections: [
    {
      title: "Quem faz o quê",
      body: (
        <p>
          No Wuavy Pulse, a <strong>clínica é a responsável pelo tratamento</strong> dos dados dos seus pacientes e
          contactos: é ela que decide o que registar e para quê. A <strong>Wuavy é a subcontratante</strong>: trata esses
          dados apenas para prestar o serviço, de acordo com as instruções da clínica. Quanto aos dados da conta de quem usa
          o Pulse e de quem fala com a Wuavy através do site, a responsável é a Wuavy.
        </p>
      ),
    },
    {
      title: "Que dados tratamos",
      body: (
        <ul>
          <li>
            <strong>Conta:</strong> nome, e-mail e palavra-passe de quem cria uma conta, incluindo apenas para conhecer a
            demonstração (a palavra-passe é guardada encriptada pelo fornecedor de autenticação; a Wuavy não a vê).
            Registamos também por onde a conta chegou e as etapas que percorreu (acedeu à demonstração, abriu a subscrição,
            subscreveu, configurou a clínica).
          </li>
          <li>
            <strong>Clínica:</strong> nome, WhatsApp, especialidade, dimensão da equipa, horário de funcionamento e logótipo.
          </li>
          <li>
            <strong>Registados pela clínica:</strong> pacientes e contactos (nome, telefone, notas comerciais), marcações,
            orçamentos, procedimentos e stock. Como o procedimento marcado pode revelar informação de saúde, o acesso a estes
            dados está restrito à equipa da própria clínica.
          </li>
          <li>
            <strong>Processo clínico, se a clínica o usar:</strong> queixa principal e notas de cada consulta. São dados de
            saúde, sensíveis à luz da LGPD: só o responsável e os profissionais da clínica os leem ou escrevem, nunca a
            receção, e a restrição é aplicada na base de dados. A clínica é a responsável pelo tratamento e responde pelas
            regras da sua ordem profissional sobre registos clínicos; o registo no Pulse não tem certificação digital.
          </li>
          <li>
            <strong>Pagamento:</strong> quando a subscrição é feita online, o cartão é introduzido no formulário do Mercado
            Pago; a Wuavy não vê nem guarda o número do cartão, apenas o estado da subscrição.
          </li>
          <li>
            <strong>Uso técnico:</strong> cookies essenciais para manter a sessão iniciada e as preferências de tema e de
            idioma. Não usamos cookies de publicidade.
          </li>
        </ul>
      ),
    },
    {
      title: "Para que os usamos",
      body: (
        <p>
          Para prestar o serviço contratado (agenda, pacientes, oportunidades e mensagens prontas), autenticar o acesso,
          cobrar a subscrição, dar apoio, manter a segurança e cumprir obrigações legais. Os fundamentos são a execução do
          contrato, o interesse legítimo (segurança e prevenção de fraude) e o cumprimento de obrigações legais. Para os
          dados dos pacientes, o fundamento é definido pela clínica, enquanto responsável. Com a conta criada para a
          demonstração, a Wuavy pode entrar em contacto consigo sobre o Pulse (interesse legítimo).
        </p>
      ),
    },
    {
      title: "Com quem partilhamos",
      body: (
        <p>
          Apenas com os fornecedores necessários para o serviço funcionar: Supabase (base de dados e autenticação), Vercel
          (alojamento) e Mercado Pago (pagamentos, quando a subscrição é online). Alguns destes fornecedores podem tratar
          dados em servidores fora do Brasil. As mensagens preparadas pelo Pulse são enviadas pela própria clínica, no
          WhatsApp dela: o Pulse não envia mensagens. A Wuavy não vende dados pessoais.
        </p>
      ),
    },
    {
      title: "Segurança",
      body: (
        <p>
          Cada clínica só acede aos próprios dados: o isolamento é aplicado na base de dados, em cada consulta. A ligação é
          encriptada (HTTPS), as palavras-passe não ficam em texto simples e as chaves de acesso ficam apenas no servidor.
        </p>
      ),
    },
    {
      title: "Durante quanto tempo",
      body: (
        <p>
          Enquanto a conta estiver ativa. Se a subscrição for cancelada, os dados continuam disponíveis para consulta até a
          clínica pedir que sejam eliminados. Feito o pedido, os dados são apagados no prazo de 30 dias, exceto o que a lei
          obrigue a guardar.
        </p>
      ),
    },
    {
      title: "Os seus direitos",
      body: (
        <>
          <p>
            Pode pedir a confirmação de que tratamos os seus dados, o acesso, a retificação, a anonimização, o bloqueio ou a
            eliminação, a portabilidade (uma cópia), informação sobre com quem os partilhamos e a revogação de um
            consentimento. Faça o pedido por e-mail para <a href={`mailto:${email}`}>{email}</a> ou por{" "}
            <a href={talk} target="_blank" rel="noopener noreferrer">
              WhatsApp, {whatsapp}
            </a>
            . Se é paciente de uma clínica que usa o Pulse, faça o pedido à clínica: a Wuavy ajuda a clínica a responder.
          </p>
          <p>A exportação dos dados da clínica diretamente no Pulse chega em breve; até lá, é feita a pedido.</p>
        </>
      ),
    },
    {
      title: "Alterações a esta política",
      body: (
        <p>Quando esta política mudar, a data acima é atualizada e as alterações importantes são avisadas no Pulse.</p>
      ),
    },
  ],
});

const terms = ({ talk, price, privacyHref }: LegalContext): LegalDoc => ({
  metaTitle: "Termos de Utilização",
  metaDescription: "Os termos de utilização do Wuavy Pulse, o sistema de gestão e crescimento para clínicas.",
  title: "Termos de Utilização",
  updated: "Atualizados a 6 de outubro de 2026",
  lead: (
    <>
      Estes termos aplicam-se à utilização do Wuavy Pulse. Ao criar uma conta, aceita estes termos e a{" "}
      <Link href={privacyHref}>Política de Privacidade</Link>.
    </>
  ),
  sections: [
    {
      title: "O serviço",
      body: (
        <p>
          O Wuavy Pulse é um sistema web para as clínicas organizarem pacientes, vendas, agenda, procedimentos e stock, e
          encontrarem oportunidades a partir desses dados. O que aparece no Pulse marcado como <strong>Em breve</strong> ainda
          não faz parte do serviço.
        </p>
      ),
    },
    {
      title: "A conta",
      body: (
        <p>
          Quem cria a conta responde pela clínica no Pulse e pela informação registada. Mantenha a palavra-passe em segredo e
          avise a Wuavy se suspeitar de um acesso indevido.
        </p>
      ),
    },
    {
      title: "Plano e pagamento",
      body: (
        <p>
          O plano Wuavy Pulse custa {price} por mês, cobrados mensalmente. A contratação é feita com a Wuavy ou, quando
          disponível, online, com cobrança recorrente no cartão através do Mercado Pago. Com a subscrição em atraso ou
          cancelada, o Pulse fica disponível apenas para consulta: nenhum dado é apagado por isso. O cancelamento interrompe
          as cobranças seguintes.
        </p>
      ),
    },
    {
      title: "Utilização adequada",
      body: (
        <ul>
          <li>Registe apenas os dados de que a clínica precisa para atender e vender, com fundamento legal para isso (LGPD).</li>
          <li>
            O processo clínico do Pulse (queixa principal e notas) é um registo de apoio, sem certificação digital: não
            substitui o registo clínico exigido pela ordem profissional da clínica, que continua responsável por ele. Só o
            responsável e os profissionais acedem a estes registos.
          </li>
          <li>
            As mensagens preparadas pelo Pulse são enviadas pela clínica, no WhatsApp dela, e são da responsabilidade da
            clínica. Não use o Pulse para mensagens em massa sem consentimento.
          </li>
          <li>Não tente aceder a dados de outra clínica nem interferir no funcionamento do serviço.</li>
        </ul>
      ),
    },
    {
      title: "Os dados são da clínica",
      body: (
        <p>
          Os dados registados pertencem à clínica. A Wuavy trata-os apenas para prestar o serviço, como subcontratante, nos
          termos da Política de Privacidade.
        </p>
      ),
    },
    {
      title: "O que o Pulse não promete",
      body: (
        <p>
          O Pulse sugere ações a partir dos dados registados. A receita potencial que mostra é uma estimativa do que está ao
          alcance, não uma garantia de faturação; as decisões e os contactos são da clínica. A Wuavy trabalha para manter o
          serviço disponível, sem garantir funcionamento ininterrupto.
        </p>
      ),
    },
    {
      title: "Alterações e contacto",
      body: (
        <p>
          Quando estes termos mudarem, a data acima é atualizada e as alterações importantes são avisadas no Pulse. Estes
          termos regem-se pela legislação brasileira. Dúvidas:{" "}
          <a href={talk} target="_blank" rel="noopener noreferrer">
            fale com a Wuavy
          </a>
          .
        </p>
      ),
    },
  ],
});

export const ptPT: typeof ptBR = {
  meta: {
    title: "WUAVY: sites, tráfego pago e sistemas de crescimento",
    description:
      "Agência de crescimento digital. Sites, gestão de tráfego pago e sistemas à medida com IA, automações e CRM, ao mesmo ritmo.",
  },

  ui: {
    skip: "Saltar para o conteúdo",
    home: "WUAVY, página inicial",
    navMain: "Principal",
    menu: "Menu",
    menuNav: "Menu principal",
    close: "Fechar",
    footerNav: "Rodapé",
    backToTop: "Voltar ao topo ↑",
    loading: "A carregar",
    language: "Idioma",
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
  cta: { label: "Falar do meu projeto", short: "WhatsApp" },

  contact: {
    whatsapp: "Olá! Cheguei através do site da Wuavy.",
    topics: { question: "Dúvida", privacy: "privacidade e dados", terms: "termos do Wuavy Pulse" },
  },

  home: {
    hero: {
      title: "Frequência vence volume.",
      imageAlt: "Multidão a atravessar uma rua, vista de cima, a preto e branco.",
      details: ["Agência de crescimento digital", "Sites, tráfego e sistemas", "Um só ritmo"],
      lead: "Sites, tráfego pago e sistemas à medida para empresas que querem crescer com constância, não com sorte.",
      cta: "Quero melhorar o meu negócio",
      secondary: { label: "Ver serviços", href: "#servicos" },
    },

    idea: {
      chapter: "Sobre",
      body: "Crescimento não é uma explosão de ruído. É um sinal repetido com precisão: a mensagem certa, no canal certo, tantas vezes quantas forem precisas para um mercado se mover.",
      accents: ["precisão:"],
      positioning:
        "A WUAVY é uma agência de crescimento digital. Criamos sites, gerimos tráfego pago e construímos sistemas que ajudam a operação a vender mais, tudo ao mesmo ritmo.",
      valuesTitle: "Valores",
      values: [
        { name: "Frequência", text: "Constância vence picos." },
        { name: "Precisão", text: "Nada entra só para enfeitar." },
        { name: "Sem ruído", text: "Direto, sem letra miudinha." },
        { name: "Crescer juntos", text: "Com o cliente, não à frente dele." },
      ],
    },

    services: {
      chapter: "Serviços",
      headline: "Três formas de pôr o crescimento em movimento.",
      lead: "O que compra é um resultado. As disciplinas são como lá chegamos.",
      includes: "O que inclui",
      cta: "Falar do meu projeto",
      more: "Conhecer sistemas",
    },

    systems: {
      chapter: "Sistemas de crescimento",
      headline: "Construímos sistemas à medida para empresas que precisam de ir além do marketing.",
      lead: "Quando o entrave não é a atenção, é a operação: atendimento que não escala, vendas que dependem de folhas de cálculo, dados dispersos. Desenhamos a solução e pomo-la a funcionar.",
      cta: "Pedir diagnóstico",
      examples: "Exemplos",
      items: [
        {
          name: "Atendimento & Vendas",
          text: "Responder depressa e levar cada contacto até à venda.",
          examples: [
            "Atendimento automatizado no WhatsApp",
            "Qualificação de leads",
            "Funis e automação comercial",
            "Passagem para a equipa no momento certo",
          ],
        },
        {
          name: "Automação",
          text: "Processos repetitivos a correr sozinhos.",
          examples: [
            "Tarefas repetitivas sem copiar e colar",
            "Site, anúncios, CRM e pagamentos integrados",
            "Folhas de cálculo e ferramentas a falar entre si",
          ],
        },
        {
          name: "Sistemas & CRM",
          text: "Ferramentas à medida da forma como a sua empresa trabalha.",
          examples: ["CRM com o funil à vista", "Sistemas internos", "Aplicações web e mobile para clientes ou para a equipa"],
        },
        {
          name: "IA & Dados",
          text: "IA onde poupa tempo, e os números à vista.",
          examples: [
            "IA aplicada ao seu negócio",
            "Agentes de IA com as regras da sua operação",
            "Dashboards atualizados sem esforço manual",
          ],
        },
      ],
    },

    manifesto: {
      lines: ["Crescer", "é sair do", "lugar."],
    },

    differentials: {
      chapter: "Diferenciais",
      headline: "O que muda quando o crescimento se torna sistema.",
      items: [
        {
          name: "Um só sistema",
          text: "Site, tráfego e automação planeados em conjunto. A mensagem que atrai é a mesma que converte.",
        },
        {
          name: "Diagnóstico antes da proposta",
          text: "Percebemos a operação antes de recomendar seja o que for. A proposta nasce do que precisa agora, não de um pacote fechado.",
        },
        {
          name: "Proposta clara",
          text: "Âmbito, prazo e investimento definidos antes de começar. O que não está incluído, como o orçamento dos anúncios, fica dito desde o início.",
        },
        {
          name: "Decisão por dados",
          text: "Campanhas acompanhadas e analisadas continuamente. Ajustamos pelo que os números mostram, não por palpite.",
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
      more: "Ficou com alguma dúvida?",
      ask: "Pergunte-nos",
      items: [
        {
          q: "Quanto custa um site?",
          a: "O investimento vem na proposta, depois de uma conversa sobre o projeto. Cada site inclui estratégia, design responsivo, desenvolvimento, estrutura pensada para a conversão, otimização para desktop e mobile, publicação e configuração inicial.",
        },
        {
          q: "O orçamento dos anúncios está incluído na gestão de tráfego?",
          a: "Não. A gestão cobre a estratégia, a criação e organização das campanhas, otimizações, acompanhamento e análise de resultados. O orçamento é pago diretamente às plataformas de anúncios, e o valor é definido consigo de acordo com o objetivo.",
        },
        {
          q: "Que plataformas de anúncios gerem?",
          a: "A gestão é feita em Meta Ads, que cobre o Instagram e o Facebook.",
        },
        {
          q: "Tenho de contratar site e tráfego em conjunto?",
          a: "Não. Cada serviço pode ser contratado em separado. Juntos, funcionam como um só sistema: o tráfego leva as pessoas certas a um site feito para as converter.",
        },
        {
          q: "Como funciona o orçamento dos sistemas de crescimento?",
          a: "Cada sistema é um projeto à medida. Começamos por um diagnóstico da operação e, a partir dele, enviamos âmbito, prazo e investimento.",
        },
        {
          q: "Quanto tempo demora o projeto?",
          a: "Depende do âmbito e da entrega de conteúdos. O prazo é definido no diagnóstico e recebe o cronograma antes de começarmos.",
        },
        {
          q: "Como começamos?",
          a: "Envia-nos uma mensagem a dizer o que quer mover. Marcamos uma conversa de diagnóstico e, a seguir, recebe a proposta.",
        },
      ],
    },

    contact: {
      chapter: "Contacto",
      lines: ["Faça o", "mercado", "mover-se."],
      body: "Diga-nos o que quer mover e para onde. A conversa começa no diagnóstico e acaba numa proposta clara.",
      cta: "Pedir diagnóstico",
    },

    footer: {
      signature: "Um módulo, um ângulo, um intervalo.",
      rights: "Todos os direitos reservados.",
      navTitle: "Navegação",
      servicesTitle: "Serviços",
      contactTitle: "Contacto",
      socialTitle: "Redes",
      legal: [
        { label: "Política de privacidade", href: "/privacidade" },
        { label: "Termos de utilização", href: "/termos" },
      ],
    },
  },

  services,
  passo,

  pulse: {
    name: "Wuavy Pulse",
    pitch: "Sistema operativo de crescimento para clínicas",
    meta: {
      title: "Wuavy Pulse",
      description:
        "O Wuavy Pulse é o sistema operativo de crescimento para clínicas: agenda, pacientes, vendas e stock a trabalhar em conjunto para encontrar oportunidades antes que se tornem prejuízo.",
    },

    hero: {
      label: "Wuavy Pulse",
      market: "A começar pelas clínicas de estética",
      title: "O Pulse observa a operação e mostra o que merece atenção agora.",
      lead: "Agenda, pacientes, vendas e stock a trabalhar em conjunto para encontrar oportunidades antes que se tornem prejuízo.",
      cta: "Quero experimentar o Pulse",
      secondary: { label: "Ver a demo", href: "/pulse/demo" },
    },

    guide: {
      invite: "A sua clínica pode estar a deixar escapar oportunidades. Quer ver uma?",
      start: "Mostra-me",
      next: "Seguinte",
      restart: "Ver outra vez",
      note: "Exemplo ilustrativo",
      steps: [
        {
          tag: "Lead esquecido",
          text: "Pediu um orçamento de harmonização facial e ninguém voltou a falar com ela.",
          detail: ["Carla M.", "Harmonização facial", "Orçamento há 6 dias", "Sem resposta"],
        },
        {
          tag: "O Pulse identifica",
          text: "O Pulse deteta o silêncio antes que o lead arrefeça e cruza o interesse com a agenda.",
          detail: ["Interesse alto", "Instagram", "Quinta, 10h livre"],
        },
        {
          tag: "Ação sugerida",
          text: "A próxima mensagem já vem pronta. A equipa revê e decide enviar.",
          detail: ["Follow-up com horário sugerido"],
        },
      ],
      done: "Isto é o Pulse: ler os sinais do que ficou para trás e sugerir o próximo passo.",
    },

    gaps: {
      chapter: "Os sinais que passam despercebidos",
      title: "O seu negócio já dá os sinais. O Pulse mostra onde agir.",
      items: [
        {
          name: "Leads que desapareceram",
          text: "Pediram orçamento, não responderam e ninguém voltou a contactar.",
          action: "Follow-up",
        },
        {
          name: "Pacientes que não voltaram",
          text: "O intervalo do procedimento passou e a consulta seguinte não foi marcada.",
          action: "Reativação",
        },
        { name: "Horários vazios", text: "Um cancelamento abre a agenda e o horário fica parado.", action: "Preenchimento da agenda" },
        {
          name: "Stock a expirar",
          text: "Produto parado torna-se prejuízo quando a data chega.",
          action: "Campanha antes de expirar",
        },
      ],
    },

    how: {
      chapter: "Como funciona",
      title: "Observa a operação, identifica oportunidades e mostra onde agir.",
      lead: "Cada parte alimenta a seguinte: uma consulta concluída abate o stock, calcula o regresso do paciente e deixa a próxima oportunidade pronta.",
      stages: [
        { name: "Atrair", text: "Cada lead chega com origem e interesse registados." },
        { name: "Organizar", text: "Pacientes, agenda, procedimentos e stock ligados." },
        { name: "Identificar", text: "Silêncio, regresso em atraso, horário vago, validade: o Pulse lê os sinais." },
        { name: "Agir", text: "A próxima ação chega pronta. A equipa revê e aprova." },
        { name: "Recuperar", text: "O que ficou para trás volta como oportunidade." },
        { name: "Reter", text: "Regressos no momento certo. Pós-consulta automático em breve." },
      ],
      example: {
        title: "Um exemplo",
        note: "Exemplo ilustrativo",
        steps: [
          { label: "Sinal", text: "Um lote de produto expira dentro de 30 dias." },
          { label: "Pulse identifica", text: "Os procedimentos que usam esse produto." },
          { label: "Pulse cruza", text: "Pacientes com histórico compatível e regresso próximo." },
          { label: "Ação", text: "Uma campanha para esse grupo, pronta a rever." },
          { label: "Resultado", text: "A oportunidade é recuperada antes do prejuízo." },
        ],
      },
    },

    close: {
      chapter: "Conhecer o Pulse",
      title: "Veja o Pulse com os dados da sua clínica.",
      lead: "Explore a demo com dados fictícios. Depois, a sua clínica experimenta o Pulse com os próprios dados, acompanhada pela Wuavy.",
      cta: "Quero experimentar o Pulse",
      demo: { href: "/pulse/demo", ready: true, label: "Conhecer o Pulse na demo", soon: "Demo interativa em breve" },
    },
  },

  cases: {
    melde: {
      tagline: "Marca, rótulo e landing de lançamento de um mel cremoso.",
      segment: "Alimentação · mel cremoso",
      scope: ["Identidade visual", "Landing page"],
      summary:
        "Uma marca de mel cremoso criada de raiz: o nome em minúsculas com o ê como assinatura, o rótulo, o design system e a landing que valida o lançamento antes da loja.",
      body: {
        challenge:
          "O mel cremoso é pouco conhecido e, quando aparece, vem vestido de rústico: abelha, favo, papel kraft. A Meldê tinha de parecer um produto de prateleira desejável, próximo do doce de leite no uso e longe da loja de produtos naturais e do suplemento.",
        approach:
          "Criámos a identidade de raiz e fizemos da página o rótulo do frasco aberto em plano: fundos branco de rótulo e castanho de tampa, o dourado guardado para o produto e para a ação, fotografia macro da textura e um único fio de mel que atravessa a página do topo até ao pedido final.",
        outcome:
          "Uma marca pronta para a prateleira e para a loja: logótipo, rótulo, manual de marca, design system documentado e uma landing leve com lista de espera, que mede o interesse antes do e-commerce.",
      },
      highlights: [
        {
          title: "Um fio de mel que acompanha a leitura",
          text: "Desenhado em SVG a partir do layout real, o fio cresce com o scroll: grosso na colher, a afinar com o peso, com rebordo âmbar e uma gota na ponta. Em cada frame só o troço da ponta é redesenhado.",
        },
        {
          title: "Rótulo aplicado por código",
          text: "O frasco de referência foi gerado com o rótulo em branco. O rótulo real foi enrolado no vidro por projeção cilíndrica e recortado com máscara própria, num script em Python.",
        },
        {
          title: "Design system pronto para a loja",
          text: "Cores, tipografia, espaçamento e movimento em tokens CSS; botões, campos, tabelas e janelas como componentes separados da página. O e-commerce nasce sobre a mesma base.",
        },
        {
          title: "Leve, sem framework",
          text: "HTML, CSS e JavaScript puros, sem build: uma única fonte variável alojada no projeto, imagens WebP responsivas e nenhuma dependência externa.",
        },
        {
          title: "Acessível de raiz",
          text: "Contraste AA verificado nos pares de texto, seletor de momentos navegável pelo teclado e, com “reduzir movimento” ativo, a página aparece pronta e o fio já desenhado.",
        },
      ],
      alt: {
        film: "Gravação da landing da Meldê a deslizar do topo ao rodapé, no computador e no telemóvel.",
        cover: "Topo da landing da Meldê: o título “Mel, só que cremoso.” ao lado do frasco e de uma colher a puxar o mel.",
        label:
          "A frente do frasco à escala de parede: rótulo meldê, Original, mel cremoso, 100% mel e 250 g, com o creme a aparecer pelo vidro.",
        phones: "Três ecrãs da landing no telemóvel: o topo com o frasco, a frente do rótulo e a lista de espera.",
        brandbook: "Capa do manual de marca: o wordmark meldê em creme sobre castanho, com o circunflexo dourado.",
        colours: "Página de cor do manual: mel dourado, castanho profundo, branco e creme.",
      },
    },
    "vida-natural": {
      tagline: "Redesign do site de uma fábrica de méis com mais de 40 anos.",
      segment: "Méis e produtos naturais",
      scope: ["Redesign de site"],
      summary:
        "A fábrica, a marca e os produtos já existiam; o site não mostrava o peso que têm. Redesenhámos o site existente para apresentar tudo com clareza.",
      body: {
        challenge:
          "O site anterior funcionava como um catálogo: um banner decorativo no topo, as categorias concentradas num único menu e os produtos listados sem contexto. A história de uma fábrica com quatro décadas não aparecia no ecrã.",
        approach:
          "Partimos do site e da marca que já existiam. Reorganizámos a navegação em torno do que o cliente procura (méis, própolis e abelhas sem ferrão), demos à fotografia de produto o papel principal e alinhámos as cores e a tipografia do site com a identidade da marca.",
        outcome:
          "Um site à altura da fábrica: visual moderno, conteúdo organizado, navegação direta e produtos apresentados como protagonistas.",
      },
      highlights: [
        {
          title: "Catálogo real, nada inventado",
          text: "Produtos, preços, descrições e fotos foram extraídos do site antigo e levados para uma base de dados. Um script recorta o fundo branco das fotos, para as embalagens flutuarem sobre a página.",
        },
        {
          title: "Preço calculado no servidor",
          text: "O browser nunca envia o preço: o carrinho é recalculado a partir da base de dados a cada alteração e outra vez antes de a encomenda ser gravada.",
        },
        {
          title: "Checkout pronto a ativar",
          text: "Mercado Pago com PIX, cartão e boleto e webhook assinado. Sem as credenciais, a encomenda segue pelo WhatsApp, como a loja já funciona.",
        },
        {
          title: "Testado de ponta a ponta",
          text: "Fluxo de compra, interface e links cobertos por testes automáticos, sem quebras de layout em cinco larguras de ecrã.",
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

  caseStudy: {
    back: "Projetos",
    live: "Ver o site online ↗",
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
      "Este case ainda está a ser escrito. Quando for publicado, esta página mostra o desafio, o que construímos e o que mudou, com resultados verificados.",
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
