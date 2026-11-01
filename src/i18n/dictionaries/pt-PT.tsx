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
    title: "WUAVY: criação de sites, tráfego pago e sistemas de crescimento",
    description:
      "Agência de crescimento digital. Criação de sites, gestão de tráfego pago e sistemas à medida com IA, automações e CRM, ao mesmo ritmo.",
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

  /*
    PULSE by WUAVY, em pt-PT. A mesma estrutura do pt-BR (é ele que define o
    tipo Dictionary): os mesmos factos, nas palavras de Portugal. O produto em
    si corre apenas em pt-BR, por isso os nomes dos ecrãs do PULSE — "Visão
    geral", "Configurações → Plano" — ficam como o produto os mostra.
  */
  pulse: {
    name: "Wuavy Pulse",
    brand: "PULSE",
    byline: "by WUAVY",
    pitch: "Sistema de gestão para clínicas de estética",
    meta: {
      title: "PULSE by WUAVY: sistema de gestão para clínicas de estética",
      description:
        "O PULSE reúne a rotina da sua clínica de estética — agenda, pacientes, orçamentos, procedimentos e stock — e mostra o que precisa de atenção hoje: orçamentos sem resposta, regressos previstos e horários vagos.",
    },

    chrome: {
      home: "PULSE by WUAVY: ir para o início da página",
      nav: "Secções desta página",
      menu: "Abrir o menu",
      close: "Fechar o menu",
      links: [
        { label: "Como funciona", href: "#como-funciona" },
        { label: "Por dentro do PULSE", href: "#por-dentro" },
        { label: "Plano", href: "#plano" },
      ],
      signIn: { label: "Entrar", href: "/pulse/entrar" },
      cta: { label: "Ver a demonstração", href: "#como-funciona" },
      back: { label: "Wuavy", title: "Ir para o site da Wuavy", href: "/" },
      footer: {
        signature: "PULSE é o sistema de gestão da Wuavy para clínicas de estética.",
        agency: "Conheça a Wuavy",
        navTitle: "Nesta página",
        productTitle: "Produto",
        legalTitle: "Legal",
        rights: "Todos os direitos reservados.",
        product: [
          { label: "Entrar no PULSE", href: "/pulse/entrar" },
          { label: "Assinar", href: "/pulse/assinar" },
        ],
      },
    },

    hero: {
      label: "Sistema para clínicas de estética",
      title: "A sua clínica pode estar a deixar dinheiro parado.",
      titleAccent: "O PULSE mostra onde.",
      lead: "Organize a sua clínica de estética e encontre orçamentos esquecidos, pacientes sem regresso e horários que precisam de atenção.",
      cta: "Veja como funciona",
      ctaHref: "#como-funciona",
      secondary: { label: "Conhecer o plano", href: "#plano" },

      demo: {
        label: "O PULSE em quatro cenas",
        note: "Demonstração com dados fictícios. Nada é enviado daqui.",
        pause: "Pausar",
        resume: "Continuar",
        scene: "Cena {n} de {total}: {title}",
        patient: { name: "Carla", sent: "Orçamento enviado há 6 dias", status: "Sem resposta" },
        action: "Ver oportunidade",
        suggest: "Ver sugestão de mensagem",
        details: [
          { label: "Procedimento:", text: "harmonização facial." },
          { label: "Por que aparece:", text: "sem resposta há 3 dias ou mais." },
        ],
        draftLabel: "Mensagem para revisão",
        draft: "Olá Carla! Passo por aqui para saber se ficou alguma dúvida sobre o orçamento de harmonização facial. Se quiser, já deixo um horário reservado para si.",
        draftNote: "É um rascunho. Nada foi enviado.",
        scenes: [
          { title: "Um orçamento ficou sem resposta.", caption: "Um orçamento ficou sem resposta." },
          { title: "O PULSE destaca a oportunidade.", caption: "O PULSE mostra o que merece atenção." },
          { title: "Um clique abre os detalhes.", caption: "Um clique abre os detalhes." },
          { title: "Outro clique traz a sugestão.", caption: "Outro clique traz a sugestão de mensagem." },
          { title: "A mensagem espera a equipa.", caption: "A sua equipa revê e decide o contacto." },
        ],
      },
    },

    recognize: {
      chapter: "Reconhecer",
      title: "Provavelmente reconhece esta situação.",
      items: [
        {
          line: "Enviaram um orçamento e ninguém respondeu.",
          detail: "A Carla pediu o orçamento de harmonização facial numa quinta-feira. Seis dias depois, silêncio.",
        },
        {
          line: "O paciente precisava de voltar.",
          detail: "A Ana fez skinbooster há quatro meses. O intervalo recomendado fechou esta semana e não há nada marcado.",
        },
        {
          line: "Ficou um horário vazio.",
          detail: "Um cancelamento abriu as 14h de amanhã. A agenda do dia continua cheia; só aquele horário ficou aberto.",
        },
      ],
      close: "Os sinais já estão nos dados da clínica. O PULSE reúne-os e mostra por onde começar.",
    },

    scenarios: {
      chapter: "Como funciona",
      title: "Veja como o PULSE ajuda a sua equipa a agir.",
      lead: "Escolha uma situação e clique para experimentar.",
      pick: "Escolha uma situação",
      hint: "Clique para experimentar",
      note: "Exemplo com dados fictícios. Nada é enviado.",
      pause: "Pausar",
      resume: "Continuar",
      labels: {
        reasonLabel: "Por que merece atenção",
        nextLabel: "Próximo passo",
        draftLabel: "Sugestão de mensagem",
        draftNote: "É um rascunho. Nada foi enviado.",
        explain: "O PULSE explica o motivo e o próximo passo.",
        closing: "A sua equipa revê e decide o contacto.",
        step: "Passo {n} de {total}",
      },
      items: [
        {
          id: "orcamento",
          choice: "Orçamento esquecido",
          intro: "Ela pediu um orçamento. Seis dias depois, ninguém retomou.",
          card: { name: "Carla", what: "Orçamento enviado há 6 dias", status: "Sem resposta" },
          open: "Ver oportunidade",
          reason: "O orçamento está aberto há 3 dias ou mais, sem resposta: é interesse que ela já declarou.",
          next: "Retomar o procedimento de interesse e oferecer um horário.",
          suggest: "Ver sugestão de mensagem",
          to: "Para a Carla",
          draft: "Olá Carla! Passo por aqui para saber se ficou alguma dúvida sobre o orçamento de harmonização facial. Se quiser, já deixo um horário reservado para si.",
        },
        {
          id: "retorno",
          choice: "Paciente sem regresso",
          intro: "A Ana fez skinbooster há quatro meses. Não há nada marcado para ela.",
          card: { name: "Ana", what: "Skinbooster · última consulta há 4 meses", status: "Nada marcado" },
          open: "Ver oportunidade",
          reason: "Mais de 90 dias sem consulta e nada marcado.",
          next: "Uma mensagem pessoal, a lembrar o último procedimento.",
          suggest: "Ver sugestão de mensagem",
          to: "Para a Ana",
          draft: "Olá Ana! Passou algum tempo desde o seu skinbooster aqui na clínica. Que tal marcar um horário para cuidarmos de si outra vez?",
        },
        {
          id: "horario",
          choice: "Horário vazio",
          intro: "Um cancelamento abriu o horário de amanhã. O resto do dia está cheio.",
          card: { name: "Amanhã, 14h", what: "Horário livre desde ontem", status: "Livre" },
          open: "Ver oportunidade",
          reason: "Um cancelamento abriu a agenda e o horário está parado até amanhã.",
          next: "Oferecer a quem mais combina: a lista de espera do período vem primeiro.",
          suggest: "Ver sugestão de mensagem",
          to: "Para a Juliana, da lista de espera",
          draft: "Olá Juliana! Abriu um horário amanhã às 14h para limpeza de pele. Quer que o reserve para si?",
        },
      ],
    },

    fronts: {
      chapter: "O que ele acompanha",
      title: "Veja o que ele acompanha.",
      lead: "Sete frentes de oportunidade, calculadas a partir dos dados que a clínica já regista. Cada uma aparece separada, com o valor que representa e o que o PULSE faz com ela.",
      count: "7",
      countLabel: "frentes de oportunidade que o PULSE acompanha",
      hint: "Escolha uma frente para ver o que o PULSE faz com ela.",
      doesLabel: "O que o PULSE faz",
      caveatLabel: "Sobre os valores",
      caveat:
        "Receita potencial estimada. Não representa venda realizada. Cada frente é calculada e mostrada separadamente, porque a mesma pessoa pode aparecer em mais de uma: o total não é cumulativo. A decisão e a mensagem final são sempre da sua equipa.",
      items: [
        {
          tag: "Orçamentos",
          name: "Orçamentos sem resposta",
          text: "Um orçamento foi enviado e ninguém respondeu há 3 dias ou mais.",
          does: "Reúne os orçamentos abertos, a começar pelos maiores e mais recentes, e prepara o follow-up do procedimento de interesse.",
          example: "Carla M. · Harmonização facial · orçamento há 6 dias",
        },
        {
          tag: "Regressos",
          name: "Pacientes com regresso previsto",
          text: "O intervalo do procedimento chegou e o regresso ainda não foi marcado.",
          does: "Compara a última consulta com o intervalo registado no procedimento e prepara o convite com os horários livres da semana.",
          example: "Ana P. · Skinbooster · regresso previsto para esta semana",
        },
        {
          tag: "Sem regresso",
          name: "Pacientes que não voltaram",
          text: "Mais de 90 dias sem consulta e nada marcado: a base da clínica a arrefecer.",
          does: "Separa quem mais investiu na clínica e prepara uma mensagem pessoal a lembrar o último procedimento.",
          example: "Beatriz S. · última consulta há 4 meses",
        },
        {
          tag: "Leads",
          name: "Leads parados",
          text: "Um contacto interessado, ainda sem orçamento, ficou 2 dias ou mais sem conversa.",
          does: "Retoma a conversa no ponto em que parou, com a avaliação como próximo passo.",
          example: "Juliana R. · perguntou e desapareceu há 3 dias",
        },
        {
          tag: "Agenda",
          name: "Horários vagos",
          text: "Um cancelamento abre a agenda e o horário fica parado entre hoje e amanhã.",
          does: "Ordena quem mais combina com cada horário — a lista de espera do mesmo período primeiro — e prepara um convite por horário.",
          example: "Amanhã, 14h · livre desde ontem",
        },
        {
          tag: "Stock",
          name: "Stock perto do prazo de validade",
          text: "Um lote perto do prazo ainda pode virar consulta, se for usado a tempo.",
          does: "Liga o lote aos procedimentos que usam aquele produto e aos pacientes com histórico compatível, antes do prazo.",
          example: "Toxina botulínica · expira em 32 dias",
        },
        {
          tag: "Faltas",
          name: "Faltas sem remarcação",
          text: "Um paciente faltou nos últimos 14 dias e ninguém remarcou.",
          does: "Prepara o convite para remarcar o mesmo procedimento, com os próximos horários livres, enquanto o interesse está vivo.",
          example: "Marcos T. · faltou há 5 dias",
        },
      ],
    },

    routine: {
      chapter: "Por dentro do PULSE",
      title: "E a rotina da clínica fica organizada.",
      lead: "Agenda, pacientes, prontuário e oportunidades no mesmo lugar. Um ecrã de cada vez; tudo o que aparece aqui é dado fictício.",
      hint: "Escolha um ecrã",
      sidebar: "Ecrãs do PULSE",
      note: "Ecrãs do PULSE com dados fictícios.",
      screens: [
        {
          id: "visao-geral",
          nav: "Visão geral",
          title: "O dia inteiro num ecrã.",
          text: "O que pede atenção agora, as consultas do dia e a receita potencial em aberto — sem ser preciso abrir um relatório à parte.",
          benefit: "A sua equipa abre o PULSE e já sabe por onde começar.",
        },
        {
          id: "agenda",
          nav: "Agenda",
          title: "A agenda que também avisa o que sobrou.",
          text: "Horários, profissionais e salas no mesmo quadro. Um cancelamento abre espaço, e o PULSE mostra quem pode ocupar.",
          benefit: "Menos horário vazio, sem ninguém ter de conferir a agenda de hora a hora.",
        },
        {
          id: "pacientes",
          nav: "Pacientes",
          title: "A ficha de cada pessoa, inteira.",
          text: "Contacto, procedimentos feitos, próximo regresso previsto e o que já foi conversado, numa só página.",
          benefit: "Qualquer pessoa da equipa atende a saber o histórico.",
        },
        {
          id: "prontuario",
          nav: "Prontuário",
          title: "Queixa, evolução e anamnese registadas.",
          text: "A queixa principal em destaque, a evolução de cada consulta, o histórico completo e a anamnese com as perguntas da própria clínica.",
          benefit: "O registo da consulta fica junto do resto, visível só para o responsável e os profissionais.",
          note: "Registo de apoio, sem certificação digital: não substitui o registo clínico exigido pela ordem profissional da clínica. Fotografias e consentimento: em breve.",
        },
        {
          id: "oportunidades",
          nav: "Oportunidades",
          title: "As sete frentes, com valor e ação.",
          text: "Cada frente com o que representa, quem o PULSE separou para começar e a mensagem pronta para a equipa revisar.",
          benefit: "A decisão fica rápida porque o trabalho de garimpar os dados já foi feito.",
        },
      ],
    },

    start: {
      chapter: "Como começar",
      title: "Três passos, na ordem em que acontecem.",
      steps: [
        {
          label: "Conhecer a demonstração",
          text: "Crie uma conta gratuita e navegue pela demo completa, com os dados fictícios da Clínica Aurora. Nenhuma mensagem, automação ou integração é executada ali.",
          detail: "Precisa de nome, e-mail e palavra-passe. Não precisa de cartão.",
          cta: "Abrir a demo completa",
          href: "/pulse/demo",
        },
        {
          label: "Assinar",
          text: "A assinatura é feita no cartão, pelo Mercado Pago. A primeira cobrança acontece na contratação e as seguintes a cada mês, na mesma data.",
          detail: "Sem contrato de fidelização e sem taxa de implementação.",
          cta: "Quero começar com o PULSE",
          href: "/pulse/assinar",
        },
        {
          label: "Configurar a clínica e começar a usar",
          text: "Registra a clínica, a equipa, os primeiros procedimentos e pacientes. Um guia de primeiros passos acompanha essa parte dentro do próprio PULSE.",
          detail: "Com o acompanhamento da Wuavy, se a clínica quiser.",
        },
      ],
      note: "A demonstração pública desta página é uma apresentação comercial: não cria conta e não guarda nada.",
    },

    pricing: {
      chapter: "Plano",
      title: "Quanto custa e como começar.",
      lead: "Sem contrato de fidelização e sem taxa de implementação: a assinatura paga o uso do mês.",
      planName: "PULSE para a sua clínica",
      price: "R$ 297",
      per: "/mês",
      billing:
        "Cobrança mensal recorrente no cartão, pelo Mercado Pago. A primeira na contratação, as seguintes a cada mês na mesma data, até ao cancelamento.",
      includesLabel: "Incluído hoje",
      includes: [
        "Pacientes, vendas e orçamentos",
        "Agenda, faltas e regressos",
        "Procedimentos e stock ligados",
        "Prontuário com evolução, histórico e anamnese",
        "Motor de oportunidades nas sete frentes, com receita potencial",
        "Mensagens prontas para a equipa revisar e enviar pelo WhatsApp",
        "Equipa com acessos separados por função",
      ],
      comingLabel: "Ainda não faz parte do plano",
      coming: [
        "Automações inteligentes",
        "Pulse AI",
        "Registo de receita recuperada",
        "Fotografias e consentimento no prontuário",
      ],
      cancelLabel: "Cancelamento",
      cancel:
        "Cancela sozinho, a qualquer momento, em Configurações → Plano. O cancelamento interrompe as cobranças seguintes; o mês já cobrado continua a funcionar até ao fim. Depois disso o PULSE fica só para consulta, e nenhum dado é apagado.",
      founderLabel: "Primeiras cinco clínicas",
      founder:
        "As cinco primeiras clínicas a assinar mantêm R$ 297 por mês enquanto a assinatura seguir ativa, mesmo que o valor suba para quem assinar depois. A garantia acompanha a assinatura: se for cancelada, uma nova contratação passa a valer pelo preço em vigor nesse momento.",
      cta: "Quero começar com o PULSE",
      ctaHref: "/pulse/assinar",
      talk: "Falar com a Wuavy",
    },

    faq: {
      chapter: "Perguntas frequentes",
      title: "Antes de assinar.",
      items: [
        {
          q: "Para que clínicas serve o PULSE?",
          a: "O PULSE foi feito para clínicas de estética: é nelas que procedimento, intervalo de regresso, orçamento e stock encaixam como o sistema espera. Se a sua clínica é de outra área, fale com a Wuavy antes de assinar.",
        },
        {
          q: "Preciso de instalar algo?",
          a: "Não. O PULSE funciona no navegador, no computador e no telemóvel. No telemóvel, pode adicionar o PULSE ao ecrã inicial e ele abre como uma aplicação — sem loja de aplicações e sem instalar nada.",
        },
        {
          q: "Como funciona a demo?",
          a: "São duas coisas diferentes. A demonstração desta página é uma apresentação: corre aqui mesmo, com dados fictícios, e não cria conta. A demo completa é o PULSE inteiro navegável: pede uma conta gratuita (nome, e-mail e palavra-passe) e usa os dados da Clínica Aurora, uma clínica fictícia. Nela, toda a ação é simulada no navegador — nenhuma mensagem, automação ou integração é executada.",
        },
        {
          q: "O PULSE envia mensagens sozinho?",
          a: "Não. O PULSE identifica a oportunidade, escolhe por onde começar e deixa a mensagem pronta, com o histórico da pessoa. Quem lê, ajusta e envia é alguém da sua equipa, pelo WhatsApp da própria clínica — e a responsabilidade pela mensagem é da clínica. Automações inteligentes e recuperação automática de receita estão entre os recursos que ainda não existem.",
        },
        {
          q: "O que significa receita potencial?",
          a: "É uma estimativa do que uma frente representa, calculada a partir dos preços e dos procedimentos registados pela própria clínica. Não é venda realizada nem dinheiro recuperado. Cada frente é mostrada separadamente, porque a mesma pessoa pode aparecer em mais de uma: somar tudo daria um número que não existe.",
        },
        {
          q: "Como começo a usar?",
          a: "Crie a conta gratuita e conheça a demo completa. Quando decidir, assine pelo cartão e registre a clínica, a equipa, os primeiros procedimentos e pacientes — um guia de primeiros passos acompanha essa parte dentro do PULSE. Não há migração automática de outro sistema: o que já existe é registado por quem conhece a clínica, com o acompanhamento da Wuavy se quiserem.",
        },
        {
          q: "Como funciona a assinatura?",
          a: "R$ 297 por mês, no cartão, pelo Mercado Pago. A primeira cobrança acontece na contratação e as seguintes a cada mês, na mesma data, no mesmo cartão, até ao cancelamento. Não há contrato de fidelização nem taxa de implementação. Se uma cobrança atrasar, o PULSE continua disponível enquanto o Mercado Pago tenta de novo; o cartão é trocado no mesmo ecrã do plano.",
        },
        {
          q: "Como funciona o cancelamento?",
          a: "O responsável pela clínica cancela sozinho, a qualquer momento, em Configurações → Plano, sem precisar de falar com ninguém. O cancelamento vale a partir do pedido e interrompe as cobranças seguintes; o mês já cobrado não é devolvido e, em troca, o PULSE continua a funcionar até ao fim dele. Depois disso o PULSE fica disponível só para consulta — nenhum dado é apagado.",
        },
      ],
    },

    close: {
      chapter: "Começar",
      title: "Veja o próximo passo da sua clínica com mais clareza.",
      lead: "Conheça a demo completa com dados fictícios e, quando fizer sentido, assine e comece com os dados da sua própria clínica.",
      cta: "Quero começar com o PULSE",
      ctaHref: "/pulse/assinar",
      talk: "Falar com a Wuavy",
      demo: { href: "/pulse/demo", ready: true, label: "Abrir a demo completa", soon: "Demo interativa em breve" },
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
