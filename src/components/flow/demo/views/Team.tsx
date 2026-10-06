"use client";

import { useState, type FormEvent } from "react";

import { inviteMember, renewInvite, updateMember, type InviteResult } from "@/lib/flow/team";
import { ROLES, ROLE_LABEL, STATUS_LABEL, type MemberStatus, type Role } from "@/lib/flow/roles";
import type { User } from "@/lib/flow/types";
import { Field, FormError, useWrite } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Configurações → Equipe, for the owner. Everyone has their own login: the
  owner adds a person by name, e-mail and role, and sends them the one-time
  link the Pulse makes (by WhatsApp or e-mail, from the owner's own apps).
  Roles change in place; someone who leaves is disabled, never deleted, so
  their name stays on everything they did. The server and the database check
  that only the owner does any of this (lib/flow/team.ts, migration 0009).
*/

const ROLE_HINT: Record<Role, string> = {
  owner: "Acesso completo: equipe, custos, indicadores e configurações.",
  reception: "Agenda, pacientes, vendas, conversas e estoque. Sem custos, prontuários ou configurações.",
  professional: "A própria agenda, os pacientes dela e os prontuários. Sem vendas, custos ou configurações.",
};

const ORDER: Record<MemberStatus, number> = { active: 0, invited: 1, disabled: 2 };

export function TeamSettings() {
  const { data, me, can } = useFlow();
  const [inviting, setInviting] = useState(false);
  const [sent, setSent] = useState<{ name: string; email?: string; result: InviteResult } | null>(null);
  if (!can.team) return null;
  const team = [...data.users].sort(
    (a, b) => ORDER[a.status ?? "active"] - ORDER[b.status ?? "active"] || a.name.localeCompare(b.name, "pt-BR"),
  );

  return (
    <section className={`${styles.panel} ${styles.settingsWide}`} aria-labelledby="equipe">
      <h2 id="equipe" className={styles.label}>
        Equipe
      </h2>
      <p className={styles.fine}>
        Cada pessoa entra com o próprio e-mail e senha. Quem sai da clínica é desativado: perde o acesso na hora, e o que
        registrou continua com o nome dela.
      </p>

      <table className={styles.table} data-rows="">
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">E-mail</th>
            <th scope="col">Função</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {team.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              self={member.id === me}
              onLink={(result) => setSent({ name: member.name, email: member.email, result })}
            />
          ))}
        </tbody>
      </table>

      {sent ? <InviteSent name={sent.name} email={sent.email} result={sent.result} onClose={() => setSent(null)} /> : null}

      {inviting ? (
        <InviteForm
          onDone={(name, email, result) => {
            setInviting(false);
            setSent({ name, email, result });
          }}
          onCancel={() => setInviting(false)}
        />
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setSent(null);
              setInviting(true);
            }}
          >
            Convidar membro
          </button>
        </div>
      )}
    </section>
  );
}

function MemberRow({ member, self, onLink }: { member: User; self: boolean; onLink: (result: InviteResult) => void }) {
  const { pending, error, write } = useWrite();
  const [renewing, setRenewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const status = member.status ?? "active";

  const renew = async () => {
    setRenewing(true);
    const result = await renewInvite(member.id);
    setRenewing(false);
    onLink(result);
  };

  return (
    <tr>
      <td data-label="Nome">
        <strong>{member.name}</strong>
        {self ? <span className={styles.fine}> (você)</span> : null}
      </td>
      <td data-label="E-mail">{member.email ?? "—"}</td>
      <td data-label="Função">
        {status === "disabled" ? (
          ROLE_LABEL[member.role]
        ) : (
          <label>
            <span className="sr-only">Função de {member.name}</span>
            <select
              className={styles.input}
              value={member.role}
              disabled={pending}
              onChange={(event) => write(() => updateMember(member.id, { role: event.target.value }))}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </label>
        )}
      </td>
      <td data-label="Status">
        <span className={styles.status} data-status={status === "invited" ? "em_andamento" : undefined}>
          {STATUS_LABEL[status]}
        </span>
      </td>
      <td data-label="Ações">
        <div className={styles.actions}>
          {status === "invited" ? (
            <button type="button" className={styles.quiet} disabled={renewing} onClick={renew}>
              {renewing ? "Gerando…" : "Novo link"}
            </button>
          ) : null}
          {status === "disabled" ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={pending}
              onClick={() => write(() => updateMember(member.id, { status: "active" }))}
            >
              Reativar
            </button>
          ) : self ? null : confirming ? (
            <>
              <button
                type="button"
                className={styles.secondary}
                disabled={pending}
                onClick={() => write(() => updateMember(member.id, { status: "disabled" }), () => setConfirming(false))}
              >
                {status === "invited" ? "Cancelar o convite" : "Desativar o acesso"}
              </button>
              <button type="button" className={styles.quiet} onClick={() => setConfirming(false)}>
                Manter
              </button>
            </>
          ) : (
            <button type="button" className={styles.quiet} onClick={() => setConfirming(true)}>
              {status === "invited" ? "Cancelar convite" : "Desativar"}
            </button>
          )}
        </div>
        <FormError error={error} />
      </td>
    </tr>
  );
}

function InviteForm({
  onDone,
  onCancel,
}: {
  onDone: (name: string, email: string, result: InviteResult) => void;
  onCancel: () => void;
}) {
  const { access } = useFlow();
  const [role, setRole] = useState<Role>("reception");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!access.canEdit) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await inviteMember(form);
    setPending(false);
    if (result.error) return setError(result.error);
    onDone(String(form.get("name") ?? ""), String(form.get("email") ?? ""), result);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.twoFields}>
        <Field label="Nome">
          <input className={styles.input} name="name" required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="E-mail">
          <input className={styles.input} name="email" type="email" required maxLength={320} autoComplete="off" />
        </Field>
      </div>
      <Field label="Função">
        <select className={styles.input} name="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      <p className={styles.fine}>{ROLE_HINT[role]}</p>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? "Convidando…" : "Convidar"}
        </button>
        <button type="button" className={styles.quiet} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** The invitation is ready: the link to send, or what the person does when they already have an account. */
function InviteSent({ name, email, result, onClose }: { name: string; email?: string; result: InviteResult; onClose: () => void }) {
  const { data } = useFlow();
  const [copied, setCopied] = useState(false);
  if (result.error) {
    return (
      <div className={styles.suggestion} role="alert">
        <p>{result.error}</p>
        <button type="button" className={styles.quiet} onClick={onClose}>
          Fechar
        </button>
      </div>
    );
  }
  const first = name.split(" ")[0] || name;
  if (!result.link) {
    return (
      <div className={styles.suggestion} role="status">
        <p className={styles.label}>Convite registrado</p>
        <p>
          {first} já tem conta no Pulse. Peça para entrar com o e-mail e a senha dela: o convite para a{" "}
          {data.organization.name} aparece ao entrar.
        </p>
        <button type="button" className={styles.quiet} onClick={onClose}>
          Fechar
        </button>
      </div>
    );
  }
  const message = `Olá, ${first}! Você foi convidado(a) para a equipe da ${data.organization.name} no Wuavy Pulse. Para criar sua senha e entrar, abra: ${result.link}`;
  return (
    <div className={styles.suggestion} role="status">
      <p className={styles.label}>Convite pronto para {first}</p>
      <p className={styles.fine}>
        Envie o link para {first}. Ele vale por tempo limitado e funciona uma vez; se expirar, use “Novo link”. Não abra
        o link você mesmo: ele entra na conta da pessoa convidada.
      </p>
      <input className={styles.input} readOnly value={result.link} aria-label="Link de convite" onFocus={(event) => event.target.select()} />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(result.link!);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Link copiado" : "Copiar link"}
        </button>
        <a className={styles.secondary} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          Enviar pelo WhatsApp
        </a>
        <a
          className={styles.secondary}
          href={`mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(`Convite para a equipe da ${data.organization.name}`)}&body=${encodeURIComponent(message)}`}
        >
          Enviar por e-mail
        </a>
        <button type="button" className={styles.quiet} onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
