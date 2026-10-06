"use client";

import { useState, type FormEvent } from "react";

import { inviteMember, renewInvite, updateMember, type InviteResult } from "@/lib/flow/team";
import { ROLES, ROLE_LABEL, STATUS_LABEL, type MemberStatus, type Role } from "@/lib/flow/roles";
import type { User } from "@/lib/flow/types";
import { Field, FormError, useWrite } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Configurações → Equipe, for the owner. One screen that follows the clinic's
  size: someone working alone sees a short note and a way to add someone
  later; a small team, a plain list; a large one, the same list with filters.
  Everyone has their own login: the owner adds a person by name, e-mail and
  role and sends them the one-time link the Pulse makes. The role decides
  what each person sees; there is nothing else to set. Someone who leaves is
  disabled, never deleted, so their name stays on what they did. The server
  and the database check all of it again (lib/flow/team.ts, migration 0009).
*/

const ROLE_HINT: Record<Role, string> = {
  owner: "Vê e faz tudo: equipe, custos, indicadores e configurações.",
  reception: "Agenda, pacientes, vendas, conversas e estoque. Não vê custos nem prontuários.",
  professional: "A própria agenda, os pacientes dela e os prontuários. Não vê vendas nem custos.",
};

const STATUS_ORDER: Record<MemberStatus, number> = { active: 0, invited: 1, disabled: 2 };
const ROLE_ORDER: Record<Role, number> = { owner: 0, reception: 1, professional: 2 };
const FILTER_LABEL: Record<Role, string> = { owner: "Responsáveis", reception: "Recepção", professional: "Profissionais" };
/** Above this many people, the list gets filters by role; above SEARCH_FROM, a search too. */
const FILTERS_FROM = 6;
const SEARCH_FROM = 11;

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const statusOf = (u: User): MemberStatus => u.status ?? "active";

export function TeamSettings() {
  const { data, me, can } = useFlow();
  const [inviting, setInviting] = useState(false);
  const [sent, setSent] = useState<{ name: string; email?: string; result: InviteResult } | null>(null);
  const [filter, setFilter] = useState<Role | "todos">("todos");
  const [query, setQuery] = useState("");
  if (!can.team) return null;

  const team = [...data.users].sort(
    (a, b) =>
      STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)] ||
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  const alone = team.length === 1;
  const activeOwners = team.filter((u) => u.role === "owner" && statusOf(u) === "active").length;
  const roles = ROLES.filter((role) => team.some((u) => u.role === role));
  const q = query.trim().toLowerCase();
  const shown = team.filter(
    (u) =>
      (filter === "todos" || u.role === filter) &&
      (!q || u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)),
  );

  const add = () => {
    setSent(null);
    setInviting(true);
  };
  const invite = inviting ? (
    <InviteForm
      onDone={(name, email, result) => {
        setInviting(false);
        setSent({ name, email, result });
      }}
      onCancel={() => setInviting(false)}
    />
  ) : null;
  const ready = sent ? <InviteSent name={sent.name} email={sent.email} result={sent.result} onClose={() => setSent(null)} /> : null;

  // Working alone is a normal way to use the Pulse: no list, no nudge, just the way to add someone later.
  if (alone) {
    return (
      <section className={styles.panel} aria-labelledby="equipe">
        <h2 id="equipe" className={styles.label}>
          Equipe
        </h2>
        <p className={styles.teamSolo}>Você está usando o Pulse sozinho.</p>
        <p className={styles.fine}>
          Quando sua clínica crescer, você pode adicionar recepção ou profissionais sem compartilhar sua senha.
        </p>
        {ready}
        {invite ?? (
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={add}>
              Adicionar alguém à equipe
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`${styles.panel} ${styles.settingsWide}`} aria-labelledby="equipe">
      <h2 id="equipe" className={styles.label}>
        Equipe <span>{team.filter((u) => statusOf(u) === "active").length} com acesso</span>
      </h2>
      <p className={styles.fine}>
        Cada pessoa entra com o próprio e-mail e senha. A função já define o que ela vê: não há nada para configurar.
      </p>
      <details className={styles.costs}>
        <summary>O que cada função vê</summary>
        <dl className={styles.teamRoles}>
          {ROLES.map((role) => (
            <div key={role}>
              <dt>{ROLE_LABEL[role]}</dt>
              <dd>{ROLE_HINT[role]}</dd>
            </div>
          ))}
        </dl>
      </details>

      {team.length >= FILTERS_FROM ? (
        <div className={styles.teamTools}>
          <div className={styles.chips} role="group" aria-label="Filtrar a equipe">
            <button type="button" aria-pressed={filter === "todos"} onClick={() => setFilter("todos")}>
              Todos · {team.length}
            </button>
            {roles.map((role) => (
              <button key={role} type="button" aria-pressed={filter === role} onClick={() => setFilter(role)}>
                {FILTER_LABEL[role]} · {team.filter((u) => u.role === role).length}
              </button>
            ))}
          </div>
          {team.length >= SEARCH_FROM ? (
            <input
              className={styles.input}
              type="search"
              placeholder="Buscar por nome ou e-mail"
              aria-label="Buscar na equipe"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
        </div>
      ) : null}

      <ul className={styles.team}>
        {shown.map((member) => (
          <Member
            key={member.id}
            member={member}
            self={member.id === me}
            lastOwner={member.role === "owner" && statusOf(member) === "active" && activeOwners === 1}
            onLink={(result) => setSent({ name: member.name, email: member.email, result })}
          />
        ))}
      </ul>
      {!shown.length ? <p className={styles.fine}>Ninguém neste filtro.</p> : null}

      {ready}
      {invite ?? (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={add}>
            Adicionar pessoa
          </button>
        </div>
      )}
    </section>
  );
}

function Member({
  member,
  self,
  lastOwner,
  onLink,
}: {
  member: User;
  self: boolean;
  lastOwner: boolean;
  onLink: (result: InviteResult) => void;
}) {
  const { pending, error, write } = useWrite();
  const [renewing, setRenewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const status = statusOf(member);
  const first = firstName(member.name);
  // The last active owner, and the person themself, keep their role: the clinic never ends up without a responsável.
  const fixedRole = status === "disabled" || self || lastOwner;

  const renew = async () => {
    setRenewing(true);
    const result = await renewInvite(member.id);
    setRenewing(false);
    onLink(result);
  };

  return (
    <li className={styles.member} data-status={status}>
      <div className={styles.memberWho}>
        <strong>
          {member.name}
          {self ? <span> (você)</span> : null}
        </strong>
        <span>{member.email ?? "—"}</span>
      </div>

      <div className={styles.memberRole}>
        {fixedRole ? (
          <span className={styles.memberRoleText}>{ROLE_LABEL[member.role]}</span>
        ) : (
          <label>
            <span className="sr-only">Função de {member.name}</span>
            <select
              className={styles.input}
              value={member.role}
              disabled={pending}
              onChange={(event) => {
                setSaved(false);
                write(() => updateMember(member.id, { role: event.target.value }), () => setSaved(true));
              }}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className={styles.status} data-status={status === "invited" ? "em_andamento" : undefined}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className={styles.memberActions}>
        {status === "invited" ? (
          <button type="button" className={styles.quiet} disabled={renewing} onClick={renew}>
            {renewing ? "Gerando…" : "Gerar novo link"}
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
        ) : self || lastOwner || confirming ? null : (
          <button type="button" className={styles.quiet} onClick={() => setConfirming(true)}>
            {status === "invited" ? "Cancelar convite" : "Desativar acesso"}
          </button>
        )}
      </div>

      {confirming ? (
        <div className={styles.memberNote}>
          <p>
            {status === "invited"
              ? `O link de ${first} deixa de funcionar.`
              : `${first} deixa de entrar no Pulse na hora. O que já registrou continua salvo, com o nome.`}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={pending}
              onClick={() => write(() => updateMember(member.id, { status: "disabled" }), () => setConfirming(false))}
            >
              {status === "invited" ? "Cancelar convite" : "Desativar acesso"}
            </button>
            <button type="button" className={styles.quiet} onClick={() => setConfirming(false)}>
              Manter
            </button>
          </div>
        </div>
      ) : null}
      {lastOwner ? (
        <p className={`${styles.fine} ${styles.memberNote}`}>
          Único responsável: a clínica precisa de pelo menos um responsável ativo. Para mudar, torne outra pessoa responsável
          primeiro.
        </p>
      ) : null}
      {saved && !error ? (
        <p className={`${styles.fine} ${styles.memberNote}`} role="status">
          Função alterada.
        </p>
      ) : null}
      {error ? (
        <div className={styles.memberNote}>
          <FormError error={error} />
        </div>
      ) : null}
    </li>
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
      <p className={styles.label}>Adicionar pessoa</p>
      <Field label="Nome">
        <input className={styles.input} name="name" required maxLength={120} autoComplete="off" />
      </Field>
      <Field label="E-mail">
        <input className={styles.input} name="email" type="email" required maxLength={320} autoComplete="off" />
      </Field>
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
          {pending ? "Gerando convite…" : "Gerar convite"}
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
  const first = firstName(name);
  if (!result.link) {
    return (
      <div className={styles.suggestion} role="status">
        <p className={styles.label}>Convite registrado</p>
        <p>
          {first} já tem conta no Pulse. Peça para entrar com o próprio e-mail e senha: o convite para a{" "}
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
      <p>
        <strong>Envie este link para a pessoa convidada. Não abra o link por ela.</strong>
      </p>
      <p className={styles.fine}>O link funciona uma vez e expira. Se expirar, use “Gerar novo link” na lista.</p>
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
