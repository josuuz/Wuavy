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
  { label: "Clinavy", href: "/clinavy", hint: "Crescimento para clínicas" },
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
  metaDescription: "Como a Wuavy trata dados pessoais no site e no Clinavy, de acordo com a LGPD.",
  title: "Política de Privacidade",
  updated: "Atualizada em 7 de outubro de 2026",
  lead: (
    <>
      Como a Wuavy trata dados pessoais no site wuavy.com e no Clinavy, o sistema de gestão e crescimento para
      clínicas, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).
    </>
  ),
  sections: [
    {
      title: "Quem faz o quê",
      body: (
        <p>
          No Clinavy, a <strong>clínica é a controladora</strong> dos dados dos seus pacientes e contatos: é ela quem
          decide o que cadastrar e para quê. A <strong>Wuavy é a operadora</strong>: trata esses dados só para prestar o
          serviço, conforme as instruções da clínica. Sobre os dados da conta de quem usa o Clinavy e de quem fala com a Wuavy
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
            profissional sobre prontuário; o registro no Clinavy não tem certificação digital.
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
          Wuavy pode entrar em contato sobre o Clinavy (legítimo interesse).
        </p>
      ),
    },
    {
      title: "Com quem compartilhamos",
      body: (
        <p>
          Só com os provedores necessários para o serviço funcionar: Supabase (banco de dados e autenticação), Vercel
          (hospedagem) e Mercado Pago (pagamentos, quando a assinatura é online). Alguns desses provedores podem processar
          dados em servidores fora do Brasil. As mensagens preparadas pelo Clinavy são enviadas pela própria clínica, no
          WhatsApp dela: o Clinavy não envia mensagens. A Wuavy não vende dados pessoais.
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
            . Se você é paciente de uma clínica que usa o Clinavy, faça o pedido à clínica: a Wuavy ajuda a clínica a atender.
          </p>
          <p>A exportação dos dados da clínica direto pelo Clinavy chega em breve; até lá, ela é feita a pedido.</p>
        </>
      ),
    },
    {
      title: "Mudanças nesta política",
      body: <p>Quando esta política mudar, a data acima muda e as mudanças importantes são avisadas no Clinavy.</p>,
    },
  ],
});

const terms = ({ talk, price, privacyHref }: LegalContext): LegalDoc => ({
  metaTitle: "Termos de Uso",
  metaDescription: "Os termos de uso do Clinavy, o sistema de gestão e crescimento para clínicas.",
  title: "Termos de Uso",
  updated: "Atualizados em 6 de outubro de 2026",
  lead: (
    <>
      Estes termos valem para o uso do Clinavy. Ao criar uma conta, você concorda com eles e com a{" "}
      <Link href={privacyHref}>Política de Privacidade</Link>.
    </>
  ),
  sections: [
    {
      title: "O serviço",
      body: (
        <p>
          O Clinavy é um sistema na web para clínicas organizarem pacientes, vendas, agenda, procedimentos e estoque, e
          encontrarem oportunidades a partir desses dados. O que aparece no Clinavy marcado como <strong>Em breve</strong> ainda
          não faz parte do serviço.
        </p>
      ),
    },
    {
      title: "A conta",
      body: (
        <p>
          Quem cria a conta responde pela clínica no Clinavy e pelas informações cadastradas. Mantenha a senha em segredo e
          avise a Wuavy se suspeitar de acesso indevido.
        </p>
      ),
    },
    {
      title: "Plano e pagamento",
      body: (
        <>
          <p>
            O plano Clinavy custa {price} por mês, cobrados mensalmente. A contratação é feita com a Wuavy ou, quando
            disponível, online, com cobrança recorrente no cartão pelo Mercado Pago. A primeira cobrança acontece na
            contratação e as seguintes a cada mês, na mesma data, no mesmo cartão, até o cancelamento.
          </p>
          <p>
            <strong>Preço das cinco primeiras clínicas.</strong> As cinco primeiras clínicas a assinar mantêm {price} por
            mês enquanto a assinatura seguir ativa, mesmo que o valor do plano suba para quem assinar depois. A garantia
            acompanha a assinatura, não a clínica: se ela for cancelada, uma nova contratação passa a valer pelo preço
            vigente naquele momento. Qualquer mudança de valor é avisada com antecedência e nunca se aplica a uma cobrança
            já feita.
          </p>
          <p>
            <strong>Cancelamento.</strong> O responsável pela clínica cancela a assinatura a qualquer momento, sozinho, em
            Configurações → Plano, sem precisar falar com ninguém. O cancelamento interrompe as cobranças seguintes e vale
            a partir do pedido; o mês já cobrado não é devolvido e, em troca, o Clinavy continua funcionando normalmente até
            o fim dele. Depois disso o Clinavy fica disponível só para consulta: nenhum dado é apagado por isso. O cartão
            também é trocado na mesma tela, a qualquer momento.
          </p>
          <p>
            Com a assinatura em atraso, o Clinavy continua liberado enquanto o Mercado Pago tenta cobrar de novo. Se as
            tentativas falharem, a assinatura é encerrada e o Clinavy passa a ficar só para consulta — também sem apagar
            nada.
          </p>
        </>
      ),
    },
    {
      title: "Uso adequado",
      body: (
        <ul>
          <li>Cadastre só dados de que a clínica precisa para atender e vender, com base legal para isso (LGPD).</li>
          <li>
            O prontuário do Clinavy (queixa principal e anotações) é um registro de apoio, sem certificação digital: não
            substitui o prontuário exigido pelo conselho profissional da clínica, que continua responsável por ele. Só o
            responsável e os profissionais acessam esses registros.
          </li>
          <li>
            As mensagens preparadas pelo Clinavy são enviadas pela clínica, no WhatsApp dela, e são de responsabilidade da
            clínica. Não use o Clinavy para mensagens em massa sem consentimento.
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
      title: "O que o Clinavy não promete",
      body: (
        <p>
          O Clinavy sugere ações a partir dos dados cadastrados. A receita potencial que ele mostra é uma estimativa do que está
          ao alcance, não uma garantia de faturamento; as decisões e os contatos são da clínica. A Wuavy trabalha para manter
          o serviço disponível, sem garantir funcionamento ininterrupto.
        </p>
      ),
    },
    {
      title: "Mudanças e contato",
      body: (
        <p>
          Quando estes termos mudarem, a data acima muda e as mudanças importantes são avisadas no Clinavy. Estes termos seguem
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
    title: "WUAVY: criação de sites, tráfego pago e sistemas de crescimento",
    description:
      "Agência de crescimento digital. Criação de sites, gestão de tráfego pago e sistemas sob medida com IA, automações e CRM, no mesmo ritmo.",
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
    topics: { question: "Dúvida", privacy: "privacidade e dados", terms: "termos do Clinavy" },
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
    Clinavy: the product's public page, in pt-BR.

    Every claim was checked against the code before it was written: the seven
    fronts and the words for each one against the opportunity engine
    (lib/flow/insights.ts) and the product's own copy (components/flow/demo/
    copy.ts → KIND); the prepared messages are the engine's real templates,
    with fictitious names filled in; the plan against PRICE (lib/flow/access.ts)
    and the terms above; the path to start against the routes that enforce it
    (app/(app)/clinavy/{entrar,assinar,comecar}); the clinical file against
    lib/flow/clinical.ts. What is not built says "em breve" and never appears
    among what the plan includes.

    What this page must never grow: a testimonial, a client, a result, a
    percentage, a number of places left, a countdown, or anything the product
    does by itself. Sending is a person's decision, and the page says so in
    every section where a message appears.
  */
  pulse: {
    // The legal and structured-data name. The lockup on the page is CLINAVY alone
    // (components/flow/PulseLogo): the agency is not signed under it.
    name: "Clinavy",
    brand: "Clinavy",
    pitch: "Sistema de gestão para clínicas de estética",
    meta: {
      title: "Clinavy: sistema de gestão para clínicas de estética",
      description:
        "O Clinavy reúne a rotina da sua clínica de estética — agenda, pacientes, orçamentos, procedimentos e estoque — e mostra o que precisa de atenção hoje: orçamentos sem resposta, retornos previstos e horários vagos.",
    },

    /*
      The page wears its own header: the product's sections, the way in, and
      one discreet way back to the agency. The agency's services are not here
      on purpose — they would compete with subscribing.
    */
    chrome: {
      home: "Clinavy: ir para o começo da página",
      nav: "Seções desta página",
      menu: "Abrir o menu",
      close: "Fechar o menu",
      links: [
        { label: "Como funciona", href: "#como-funciona" },
        { label: "Por dentro do Clinavy", href: "#por-dentro" },
        { label: "Plano", href: "#plano" },
      ],
      signIn: { label: "Entrar", href: "/clinavy/entrar" },
      cta: { label: "Ver a demonstração", href: "#como-funciona" },
      back: { label: "Wuavy", title: "Ir para o site da Wuavy", href: "/" },
      footer: {
        signature: "Clinavy é o sistema de gestão da Wuavy para clínicas de estética.",
        agency: "Conheça a Wuavy",
        navTitle: "Nesta página",
        productTitle: "Produto",
        legalTitle: "Legal",
        rights: "Todos os direitos reservados.",
        product: [
          { label: "Entrar no Clinavy", href: "/clinavy/entrar" },
          { label: "Assinar", href: "/clinavy/assinar" },
        ],
      },
    },

    /*
      The first screen is centred, the way the story is told: a short
      identification, the promise in two sentences, one line of explanation, the
      way in, and then a small demonstration under it.

      `demo` is that demonstration: one patient card, four scenes, about
      fifteen seconds, one idea each (components/pulse/HeroDemo.tsx). It ends
      on a draft waiting for a person, never on a message sent, an answer, a
      booking or revenue; and it draws nothing the product does not do today.
    */
    hero: {
      label: "Sistema para clínicas de estética",
      title: "Sua clínica pode estar deixando dinheiro parado.",
      titleAccent: "O Clinavy mostra onde.",
      lead: "Organize sua clínica de estética e encontre orçamentos esquecidos, pacientes sem retorno e horários que precisam de atenção.",
      cta: "Veja como funciona",
      ctaHref: "#como-funciona",
      secondary: { label: "Conhecer o plano", href: "#plano" },

      demo: {
        label: "O Clinavy em quatro cenas",
        note: "Demonstração com dados fictícios. Nada é enviado daqui.",
        patient: { name: "Carla", sent: "Orçamento enviado há 6 dias", status: "Sem resposta" },
        action: "Ver oportunidade",
        suggest: "Ver sugestão de mensagem",
        details: [
          { label: "Procedimento:", text: "harmonização facial." },
          { label: "Por que aparece:", text: "sem resposta há 3 dias ou mais." },
        ],
        draftLabel: "Mensagem para revisão",
        draft: "Oi Carla! Passando para saber se ficou alguma dúvida sobre o orçamento de harmonização facial. Se quiser, já deixo um horário reservado para você.",
        draftNote: "É um rascunho. Nada foi enviado.",
        // Around the screen, three small layered compositions. Only their short labels are text;
        // the rest is shape. Nothing here says a message was sent, a visit booked or money recovered.
        aside: {
          quote: { label: "Orçamento sem resposta" },
          agenda: { label: "Retorno previsto" },
          next: { kicker: "Próximo passo", title: "Revisar contato" },
        },
        scenes: [
          { title: "Um orçamento ficou sem resposta.", caption: "Um orçamento ficou sem resposta." },
          { title: "O Clinavy destaca a oportunidade.", caption: "O Clinavy mostra o que merece atenção." },
          { title: "Um clique abre os detalhes.", caption: "Um clique abre os detalhes." },
          { title: "Outro clique traz a sugestão.", caption: "Outro clique traz a sugestão de mensagem." },
          { title: "A mensagem espera a equipe.", caption: "Sua equipe revisa e decide o contato." },
        ],
      },
    },

    /*
      Second chapter: recognition. Three short, specific situations, said the
      way a clinic says them. No product yet — this is the "that is us" moment.
    */
    recognize: {
      chapter: "Reconhecer",
      title: "Você provavelmente reconhece esta situação.",
      items: [
        {
          line: "Enviaram um orçamento e ninguém respondeu.",
          detail: "Carla pediu o orçamento de harmonização facial numa quinta-feira. Seis dias depois, silêncio.",
        },
        {
          line: "O paciente precisava voltar.",
          detail: "Ana fez skinbooster há quatro meses. O intervalo recomendado fechou esta semana e não há nada marcado.",
        },
        {
          line: "Ficou um horário vazio.",
          detail: "Um cancelamento abriu as 14h de amanhã. A agenda do dia continua cheia; só aquele horário ficou aberto.",
        },
      ],
      close: "Os sinais já estão nos dados da clínica. O Clinavy os reúne e mostra por onde começar.",
    },

    /*
      The hands-on moment (components/pulse/HowSim.tsx): three situations, one
      stage, one step at a time. The four paragraphs this section used to carry
      — what happened, what Clinavy identified, why it deserves attention,
      what the team can do — are now one short sentence in each step, and a
      step only appears when the visitor (or the demonstration) asks for it.

      The draft in every situation is the opportunity engine's own template
      (components/flow/demo/views/Opportunities.tsx), with a fictitious name.
      The reasons are the engine's rules (KIND in components/flow/demo/copy.ts).
      No value, no total, no outcome: nothing here is a result.
    */
    scenarios: {
      chapter: "Como funciona",
      title: "Veja como o Clinavy ajuda sua equipe a agir.",
      lead: "Escolha uma situação e veja o Clinavy em ação.",
      pick: "Escolha uma situação",
      note: "Exemplo com dados fictícios. Nada é enviado.",
      labels: {
        reasonLabel: "Por que merece atenção",
        nextLabel: "Próximo passo",
        draftLabel: "Sugestão de mensagem",
        draftNote: "É um rascunho. Nada foi enviado.",
        explain: "O Clinavy explica o motivo e o próximo passo.",
        closing: "Sua equipe revisa e decide o contato.",
        step: "Etapa {n} de {total}",
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
          to: "Para Carla",
          draft: "Oi Carla! Passando para saber se ficou alguma dúvida sobre o orçamento de harmonização facial. Se quiser, já deixo um horário reservado para você.",
        },
        {
          id: "retorno",
          choice: "Paciente sem retorno",
          intro: "Ana fez skinbooster há quatro meses. Nada está marcado para ela.",
          card: { name: "Ana", what: "Skinbooster · última visita há 4 meses", status: "Nada marcado" },
          open: "Ver oportunidade",
          reason: "Mais de 90 dias sem visita e nada agendado.",
          next: "Uma mensagem pessoal, lembrando o último procedimento.",
          suggest: "Ver sugestão de mensagem",
          to: "Para Ana",
          draft: "Oi Ana! Faz um tempo desde o seu skinbooster aqui na clínica. Que tal marcar um horário para cuidarmos de você de novo?",
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
          to: "Para Juliana, da lista de espera",
          draft: "Oi Juliana! Abriu um horário amanhã às 14h para limpeza de pele. Quer que eu reserve para você?",
        },
      ],
    },

    /*
      The commercial differential, said plainly: the next sale is usually
      someone the clinic already knows. The seven fronts are the ones the
      engine computes — no front here is aspirational.
    */
    fronts: {
      chapter: "O que ele acompanha",
      title: "Veja o que ele acompanha.",
      lead: "Sete frentes de oportunidade, calculadas a partir dos dados que a clínica já registra. Cada uma aparece separada, com o valor que representa e o que o Clinavy faz com ela.",
      count: "7",
      countLabel: "frentes de oportunidade que o Clinavy acompanha",
      hint: "Escolha uma frente para ver o que o Clinavy faz com ela.",
      doesLabel: "O que o Clinavy faz",
      caveatLabel: "Sobre os valores",
      caveat:
        "Receita potencial estimada. Não representa venda realizada. Cada frente é calculada e mostrada separadamente, porque a mesma pessoa pode aparecer em mais de uma: o total não é cumulativo. A decisão e a mensagem final são sempre da sua equipe.",
      items: [
        {
          tag: "Orçamentos",
          name: "Orçamentos sem resposta",
          text: "Um orçamento foi enviado e ninguém respondeu há 3 dias ou mais.",
          does: "Reúne os orçamentos abertos, começando pelos maiores e mais recentes, e prepara o follow-up do procedimento de interesse.",
          example: "Carla M. · Harmonização facial · orçamento há 6 dias",
        },
        {
          tag: "Retornos",
          name: "Pacientes com retorno previsto",
          text: "O intervalo do procedimento chegou e o retorno ainda não foi marcado.",
          does: "Compara a última visita com o intervalo cadastrado no procedimento e prepara o convite com os horários livres da semana.",
          example: "Ana P. · Skinbooster · retorno previsto para esta semana",
        },
        {
          tag: "Sem retorno",
          name: "Pacientes que não voltaram",
          text: "Mais de 90 dias sem visita e nada agendado: a base da clínica esfriando.",
          does: "Separa quem mais investiu na clínica e prepara uma mensagem pessoal lembrando o último procedimento.",
          example: "Beatriz S. · última visita há 4 meses",
        },
        {
          tag: "Leads",
          name: "Leads parados",
          text: "Um contato interessado, ainda sem orçamento, ficou 2 dias ou mais sem conversa.",
          does: "Retoma a conversa no ponto em que ela parou, com a avaliação como próximo passo.",
          example: "Juliana R. · perguntou e sumiu há 3 dias",
        },
        {
          tag: "Agenda",
          name: "Horários vagos",
          text: "Um cancelamento abre a agenda e o horário fica parado entre hoje e amanhã.",
          does: "Ordena quem mais combina com cada horário — a lista de espera do mesmo período primeiro — e prepara um convite por horário.",
          example: "Amanhã, 14h · livre desde ontem",
        },
        {
          tag: "Estoque",
          name: "Estoque perto da validade",
          text: "Um lote perto do vencimento ainda pode virar atendimento, se for usado a tempo.",
          does: "Liga o lote aos procedimentos que usam aquele produto e aos pacientes com histórico compatível, antes do vencimento.",
          example: "Toxina botulínica · vence em 32 dias",
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

    /*
      The product tour. Five focused crops, not whole screenshots: each one
      is the real screen's own content, with the left sidebar kept as the
      product has it. "Prontuário" is the clinical file that works today —
      chief complaint, the day's entry, the history and the anamnesis
      (lib/flow/clinical.ts, migrations 0014–0016).
    */
    routine: {
      chapter: "Por dentro do Clinavy",
      title: "E a rotina da clínica fica organizada.",
      lead: "Agenda, pacientes, prontuário e oportunidades no mesmo lugar. Uma tela por vez; tudo o que aparece aqui é dado fictício.",
      hint: "Escolha uma tela",
      sidebar: "Telas do Clinavy",
      note: "Telas do Clinavy com dados fictícios.",
      screens: [
        {
          id: "visao-geral",
          nav: "Visão geral",
          title: "O dia inteiro numa tela.",
          text: "O que pede atenção agora, os atendimentos do dia e a receita potencial em aberto — sem precisar abrir um relatório à parte.",
          benefit: "Sua equipe abre o Clinavy e já sabe por onde começar.",
        },
        {
          id: "agenda",
          nav: "Agenda",
          title: "A agenda que também avisa o que sobrou.",
          text: "Horários, profissionais e salas no mesmo quadro. Um cancelamento abre espaço, e o Clinavy mostra quem pode ocupar.",
          benefit: "Menos horário vazio, sem ninguém ter que conferir a agenda de hora em hora.",
        },
        {
          id: "pacientes",
          nav: "Pacientes",
          title: "A ficha de cada pessoa, inteira.",
          text: "Contato, procedimentos feitos, próximo retorno previsto e o que já foi conversado, numa página só.",
          benefit: "Qualquer pessoa da equipe atende sabendo o histórico.",
        },
        {
          id: "prontuario",
          nav: "Prontuário",
          title: "Queixa, evolução e anamnese registradas.",
          text: "A queixa principal em destaque, a evolução de cada atendimento, o histórico completo e a anamnese com as perguntas da própria clínica.",
          benefit: "O registro do atendimento fica junto do resto, visível só para o responsável e os profissionais.",
          note: "Registro de apoio, sem certificação digital: não substitui o prontuário exigido pelo conselho profissional da clínica. Fotos e consentimento: em breve.",
        },
        {
          id: "oportunidades",
          nav: "Oportunidades",
          title: "As sete frentes, com valor e ação.",
          text: "Cada frente com o que ela representa, quem o Clinavy separou para começar e a mensagem pronta para a equipe revisar.",
          benefit: "A decisão fica rápida porque o trabalho de garimpar os dados já foi feito.",
        },
      ],
    },

    /*
      The real path, and only it: the demo needs a free account (the layout at
      app/(app)/clinavy/demo redirects without one), subscribing goes through
      the checkout, and the clinic is set up afterwards (app/(app)/clinavy/comecar).
      No promise of migration, instant setup or a deadline.
    */
    start: {
      chapter: "Como começar",
      title: "Três passos, na ordem em que acontecem.",
      steps: [
        {
          label: "Conhecer a demonstração",
          text: "Crie uma conta gratuita e navegue pela demo completa, com os dados fictícios da Clínica Aurora. Nenhuma mensagem, automação ou integração é executada ali.",
          detail: "Precisa de nome, e-mail e senha. Não precisa de cartão.",
          cta: "Abrir a demo completa",
          href: "/clinavy/demo",
        },
        {
          label: "Assinar",
          text: "A assinatura é feita no cartão, pelo Mercado Pago. A primeira cobrança acontece na contratação e as seguintes a cada mês, na mesma data.",
          detail: "Sem contrato de fidelidade e sem taxa de implantação.",
          cta: "Quero começar com o Clinavy",
          href: "/clinavy/assinar",
        },
        {
          label: "Configurar a clínica e começar a usar",
          text: "Você cadastra a clínica, a equipe, os primeiros procedimentos e pacientes. Um guia de primeiros passos acompanha essa parte dentro do próprio Clinavy.",
          detail: "Com o acompanhamento da Wuavy, se a clínica quiser.",
        },
      ],
      note: "A demonstração pública desta página é uma apresentação comercial: ela não cria conta e não guarda nada.",
    },

    pricing: {
      chapter: "Plano",
      title: "Quanto custa e como começar.",
      lead: "Sem contrato de fidelidade e sem taxa de implantação: a assinatura paga o uso do mês.",
      planName: "Clinavy para sua clínica",
      price: "R$ 297",
      per: "/mês",
      billing:
        "Cobrança mensal recorrente no cartão, pelo Mercado Pago. A primeira na contratação, as seguintes a cada mês na mesma data, até o cancelamento.",
      includesLabel: "Incluído hoje",
      includes: [
        "Pacientes, vendas e orçamentos",
        "Agenda, faltas e retornos",
        "Procedimentos e estoque ligados",
        "Prontuário com evolução, histórico e anamnese",
        "Motor de oportunidades nas sete frentes, com receita potencial",
        "Mensagens prontas para a equipe revisar e enviar pelo WhatsApp",
        "Equipe com acessos separados por função",
      ],
      // Sem promessa de preço nem de data: os termos dizem apenas que o que
      // está marcado como "em breve" ainda não faz parte do serviço.
      comingLabel: "Ainda não faz parte do plano",
      coming: [
        "Automações inteligentes",
        "Clinavy AI",
        "Rastreamento de receita recuperada",
        "Fotos e consentimento no prontuário",
      ],
      cancelLabel: "Cancelamento",
      cancel:
        "Você cancela sozinho, a qualquer momento, em Configurações → Plano. O cancelamento interrompe as cobranças seguintes; o mês já cobrado continua funcionando até o fim. Depois disso o Clinavy fica só para consulta, e nenhum dado é apagado.",
      founderLabel: "Primeiras cinco clínicas",
      founder:
        "As cinco primeiras clínicas a assinar mantêm R$ 297 por mês enquanto a assinatura seguir ativa, mesmo que o valor suba para quem assinar depois. A garantia acompanha a assinatura: se ela for cancelada, uma nova contratação passa a valer pelo preço vigente naquele momento.",
      cta: "Quero começar com o Clinavy",
      ctaHref: "/clinavy/assinar",
      talk: "Conversar com a Wuavy",
    },

    faq: {
      chapter: "Perguntas frequentes",
      title: "Antes de assinar.",
      items: [
        {
          q: "Para quais clínicas o Clinavy serve?",
          a: "O Clinavy foi feito para clínicas de estética: é nelas que procedimento, intervalo de retorno, orçamento e estoque se encaixam como o sistema espera. Se a sua clínica é de outra área, fale com a Wuavy antes de assinar.",
        },
        {
          q: "Preciso instalar algo?",
          a: "Não. O Clinavy funciona no navegador, no computador e no celular. No celular, você pode adicionar o Clinavy à tela inicial e ele abre como um aplicativo — sem loja de aplicativos e sem instalar nada.",
        },
        {
          q: "Como funciona a demo?",
          a: "São duas coisas diferentes. A demonstração desta página é uma apresentação: ela roda aqui mesmo, com dados fictícios, e não cria conta. A demo completa é o Clinavy inteiro navegável: ela pede uma conta gratuita (nome, e-mail e senha) e usa os dados da Clínica Aurora, uma clínica fictícia. Nela, toda ação é simulada no navegador — nenhuma mensagem, automação ou integração é executada.",
        },
        {
          q: "O Clinavy envia mensagens sozinho?",
          a: "Não. O Clinavy identifica a oportunidade, escolhe por onde começar e deixa a mensagem pronta, com o histórico da pessoa. Quem lê, ajusta e envia é alguém da sua equipe, pelo WhatsApp da própria clínica — e a responsabilidade pela mensagem é da clínica. Automações inteligentes e recuperação automática de receita estão entre os recursos que ainda não existem.",
        },
        {
          q: "O que significa receita potencial?",
          a: "É uma estimativa do que uma frente representa, calculada a partir dos preços e dos procedimentos cadastrados pela própria clínica. Não é venda realizada nem dinheiro recuperado. Cada frente é mostrada separadamente, porque a mesma pessoa pode aparecer em mais de uma: somar tudo daria um número que não existe.",
        },
        {
          q: "Como começo a usar?",
          a: "Crie a conta gratuita e conheça a demo completa. Quando decidir, assine pelo cartão e cadastre a clínica, a equipe, os primeiros procedimentos e pacientes — um guia de primeiros passos acompanha essa parte dentro do Clinavy. Não há migração automática de outro sistema: o que já existe é cadastrado por quem conhece a clínica, com o acompanhamento da Wuavy se vocês quiserem.",
        },
        {
          q: "Como funciona a assinatura?",
          a: "R$ 297 por mês, no cartão, pelo Mercado Pago. A primeira cobrança acontece na contratação e as seguintes a cada mês, na mesma data, no mesmo cartão, até o cancelamento. Não há contrato de fidelidade nem taxa de implantação. Se uma cobrança atrasar, o Clinavy continua liberado enquanto o Mercado Pago tenta de novo; o cartão é trocado na mesma tela do plano.",
        },
        {
          q: "Como funciona o cancelamento?",
          a: "O responsável pela clínica cancela sozinho, a qualquer momento, em Configurações → Plano, sem precisar falar com ninguém. O cancelamento vale a partir do pedido e interrompe as cobranças seguintes; o mês já cobrado não é devolvido e, em troca, o Clinavy continua funcionando até o fim dele. Depois disso o Clinavy fica disponível só para consulta — nenhum dado é apagado.",
        },
      ],
    },

    close: {
      chapter: "Começar",
      title: "Veja o próximo passo da sua clínica com mais clareza.",
      lead: "Conheça a demo completa com dados fictícios e, quando fizer sentido, assine e comece com os dados da sua própria clínica.",
      cta: "Quero começar com o Clinavy",
      ctaHref: "/clinavy/assinar",
      talk: "Conversar com a Wuavy",
      demo: { href: "/clinavy/demo", ready: true, label: "Abrir a demo completa", soon: "Demo interativa em breve" },
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
