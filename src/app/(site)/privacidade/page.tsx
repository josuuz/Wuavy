import type { Metadata } from "next";

import { Section } from "@/components/layout/Section";
import { site, whatsapp } from "@/data/site";
import { contactHref } from "@/lib/contact";
import styles from "../legal.module.css";

/*
  The privacy policy (LGPD), for the site and for Wuavy Pulse: what is
  collected, why, who else handles it, and how to ask for access, a copy or
  deletion. Kept to what the system really does.
*/

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a Wuavy trata dados pessoais no site e no Wuavy Pulse, de acordo com a LGPD.",
  alternates: { canonical: "/privacidade" },
};

const UPDATED = "4 de outubro de 2026";
const EMAIL = "ola@wuavy.com";

export default function PrivacyPage() {
  const talk = contactHref(site.contact.primary, "privacidade e dados");
  return (
    <Section id="privacidade" surface="paper" label="Política de Privacidade" className={styles.page}>
      <div className="frame">
        <article className={styles.article}>
          <header>
            <p className={styles.updated}>Atualizada em {UPDATED}</p>
            <h1 className={styles.title}>Política de Privacidade</h1>
          </header>
          <p className={styles.lead}>
            Como a Wuavy trata dados pessoais no site wuavy.com e no Wuavy Pulse, o sistema de gestão e crescimento para
            clínicas, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).
          </p>

          <section>
            <h2>Quem faz o quê</h2>
            <p>
              No Wuavy Pulse, a <strong>clínica é a controladora</strong> dos dados dos seus pacientes e contatos: é ela quem
              decide o que cadastrar e para quê. A <strong>Wuavy é a operadora</strong>: trata esses dados só para prestar o
              serviço, conforme as instruções da clínica. Sobre os dados da conta de quem usa o Pulse e de quem fala com a Wuavy
              pelo site, a Wuavy é a controladora.
            </p>
          </section>

          <section>
            <h2>Que dados tratamos</h2>
            <ul>
              <li>
                <strong>Conta:</strong> nome, e-mail e senha de quem cria uma conta, inclusive só para conhecer a demonstração (a
                senha é guardada de forma criptografada pelo provedor de autenticação; a Wuavy não a vê). Registramos também por
                onde a conta chegou e as etapas que percorreu (acessou a demonstração, abriu a
                assinatura, assinou, configurou a clínica).
              </li>
              <li>
                <strong>Clínica:</strong> nome, WhatsApp, especialidade, tamanho da equipe, horário de atendimento e logo.
              </li>
              <li>
                <strong>Cadastrados pela clínica:</strong> pacientes e contatos (nome, telefone, observações comerciais),
                agendamentos, orçamentos, procedimentos e estoque. O Pulse não é prontuário: não deve receber dados clínicos.
                Como o procedimento agendado pode revelar informação de saúde, o acesso a esses dados é restrito à equipe da
                própria clínica.
              </li>
              <li>
                <strong>Pagamento:</strong> quando a assinatura é feita online, o cartão é digitado no formulário do Mercado Pago;
                a Wuavy não vê nem guarda o número do cartão, só a situação da assinatura.
              </li>
              <li>
                <strong>Uso técnico:</strong> cookies essenciais para manter a sessão aberta e a preferência de tema. Não usamos
                cookies de publicidade.
              </li>
            </ul>
          </section>

          <section>
            <h2>Para que usamos</h2>
            <p>
              Para prestar o serviço contratado (agenda, pacientes, oportunidades e mensagens prontas), autenticar o acesso,
              cobrar a assinatura, dar suporte, manter a segurança e cumprir obrigações legais. As bases legais são a execução do
              contrato, o legítimo interesse (segurança e prevenção de fraude) e o cumprimento de obrigação legal. Para os dados
              dos pacientes, a base legal é definida pela clínica, como controladora. Com a conta criada para a demonstração,
              a Wuavy pode entrar em contato sobre o Pulse (legítimo interesse).
            </p>
          </section>

          <section>
            <h2>Com quem compartilhamos</h2>
            <p>
              Só com os provedores necessários para o serviço funcionar: Supabase (banco de dados e autenticação), Vercel
              (hospedagem) e Mercado Pago (pagamentos, quando a assinatura é online). Alguns desses provedores podem processar
              dados em servidores fora do Brasil. As mensagens preparadas pelo Pulse são enviadas pela própria clínica, no
              WhatsApp dela: o Pulse não envia mensagens. A Wuavy não vende dados pessoais.
            </p>
          </section>

          <section>
            <h2>Segurança</h2>
            <p>
              Cada clínica só acessa os próprios dados: o isolamento é aplicado no banco de dados, a cada consulta. A conexão é
              criptografada (HTTPS), as senhas não ficam em texto e as chaves de acesso ficam só no servidor.
            </p>
          </section>

          <section>
            <h2>Por quanto tempo</h2>
            <p>
              Enquanto a conta estiver ativa. Se a assinatura for cancelada, os dados continuam disponíveis para consulta até a
              clínica pedir a exclusão. Pedida a exclusão, os dados são apagados em até 30 dias, salvo o que a lei obrigar a
              guardar.
            </p>
          </section>

          <section>
            <h2>Seus direitos</h2>
            <p>
              Você pode pedir a confirmação de que tratamos seus dados, o acesso, a correção, a anonimização, o bloqueio ou a
              eliminação, a portabilidade (uma cópia), informação sobre com quem compartilhamos e a revogação de um
              consentimento. Peça pelo e-mail <a href={`mailto:${EMAIL}`}>{EMAIL}</a> ou pelo{" "}
              <a href={talk} target="_blank" rel="noopener noreferrer">
                WhatsApp {whatsapp.number}
              </a>
              . Se você é paciente de uma clínica que usa o Pulse, faça o pedido à clínica: a Wuavy ajuda a clínica a atender.
            </p>
            <p>A exportação dos dados da clínica direto pelo Pulse chega em breve; até lá, ela é feita a pedido.</p>
          </section>

          <section>
            <h2>Mudanças nesta política</h2>
            <p>Quando esta política mudar, a data acima muda e as mudanças importantes são avisadas no Pulse.</p>
          </section>
        </article>
      </div>
    </Section>
  );
}
