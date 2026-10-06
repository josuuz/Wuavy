import type { Metadata } from "next";
import Link from "next/link";

import { Section } from "@/components/layout/Section";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { PRICE } from "@/lib/flow/access";
import { brl } from "@/lib/flow/format";
import styles from "../legal.module.css";

/* The terms of use of Wuavy Pulse: what the service is, the plan, fair use, and what it does not promise. */

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Os termos de uso do Wuavy Pulse, o sistema de gestão e crescimento para clínicas.",
  alternates: { canonical: "/termos" },
};

const UPDATED = "6 de outubro de 2026";

export default function TermsPage() {
  const talk = contactHref(site.contact.primary, "termos do Wuavy Pulse");
  return (
    <Section id="termos" surface="paper" label="Termos de Uso" className={styles.page}>
      <div className="frame">
        <article className={styles.article}>
          <header>
            <p className={styles.updated}>Atualizados em {UPDATED}</p>
            <h1 className={styles.title}>Termos de Uso</h1>
          </header>
          <p className={styles.lead}>
            Estes termos valem para o uso do Wuavy Pulse. Ao criar uma conta, você concorda com eles e com a{" "}
            <Link href="/privacidade">Política de Privacidade</Link>.
          </p>

          <section>
            <h2>O serviço</h2>
            <p>
              O Wuavy Pulse é um sistema na web para clínicas organizarem pacientes, vendas, agenda, procedimentos e estoque, e
              encontrarem oportunidades a partir desses dados. O que aparece no Pulse marcado como <strong>Em breve</strong>{" "}
              ainda não faz parte do serviço.
            </p>
          </section>

          <section>
            <h2>A conta</h2>
            <p>
              Quem cria a conta responde pela clínica no Pulse e pelas informações cadastradas. Mantenha a senha em segredo e
              avise a Wuavy se suspeitar de acesso indevido.
            </p>
          </section>

          <section>
            <h2>Plano e pagamento</h2>
            <p>
              O plano Wuavy Pulse custa {brl(PRICE)} por mês, cobrados mensalmente. A contratação é feita com a Wuavy ou, quando
              disponível, online, com cobrança recorrente no cartão pelo Mercado Pago. Com a assinatura em atraso ou cancelada, o
              Pulse fica disponível só para consulta: nenhum dado é apagado por isso. O cancelamento interrompe as cobranças
              seguintes.
            </p>
          </section>

          <section>
            <h2>Uso adequado</h2>
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
          </section>

          <section>
            <h2>Os dados são da clínica</h2>
            <p>
              Os dados cadastrados pertencem à clínica. A Wuavy os trata só para prestar o serviço, como operadora, nos termos da
              Política de Privacidade.
            </p>
          </section>

          <section>
            <h2>O que o Pulse não promete</h2>
            <p>
              O Pulse sugere ações a partir dos dados cadastrados. A receita potencial que ele mostra é uma estimativa do que está
              ao alcance, não uma garantia de faturamento; as decisões e os contatos são da clínica. A Wuavy trabalha para manter
              o serviço disponível, sem garantir funcionamento ininterrupto.
            </p>
          </section>

          <section>
            <h2>Mudanças e contato</h2>
            <p>
              Quando estes termos mudarem, a data acima muda e as mudanças importantes são avisadas no Pulse. Estes termos seguem
              a legislação brasileira. Dúvidas:{" "}
              <a href={talk} target="_blank" rel="noopener noreferrer">
                fale com a Wuavy
              </a>
              .
            </p>
          </section>
        </article>
      </div>
    </Section>
  );
}
