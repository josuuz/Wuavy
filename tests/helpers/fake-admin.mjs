/*
  Um Supabase falso, em memória, para testes de integração sem rede
  (tests/billing-integration.test.mjs). Imita só o que lib/billing/charges.ts
  e lancamentos/actions.ts realmente usam: from/select/update/eq/is/maybeSingle,
  e o builder é "thenable" como o da biblioteca real.

  A garantia que importa: um UPDATE confere a condição (WHERE) e escreve de
  forma síncrona dentro de _run() — sem nenhum await no meio. Como duas
  chamadas concorrentes em JS sempre intercalam em pontos de await, nunca no
  meio de uma função síncrona, isto reproduz a mesma atomicidade que um UPDATE
  condicional tem no Postgres de verdade: a segunda chamada a enxergar a
  condição já não bate, porque a primeira já escreveu.
*/

function pick(row, cols) {
  if (!cols || cols === "*") return { ...row };
  const names = cols.split(",").map((c) => c.trim());
  const out = {};
  for (const name of names) out[name] = row[name];
  return out;
}

/** Defaults de coluna para uma linha nova, por tabela — só o que insert() precisa preencher quando não vem no corpo. */
const INSERT_DEFAULTS = {
  subscriptions: {
    provider: "mercadopago",
    provider_subscription_id: null,
    started_at: null,
    current_period_end: null,
    creation_claimed_at: null,
    creation_blocked_at: null,
    last_refusal_http_status: null,
    last_refusal_detail: null,
    legacy_access_transition: false,
    first_payment_confirmed_at: null,
    legacy_transition_cleared_at: null,
    legacy_transition_cleared_by: null,
    legacy_transition_cleared_reason: null,
  },
};

/** "col.eq.val,col2.eq.val2" ou "and(col.eq.val,col2.eq.val2)" — só o que o código real usa (session.ts, billing.ts). */
function parseOrClause(clause) {
  const and = clause.match(/^and\((.*)\)$/);
  const parts = (and ? and[1] : clause).split(",");
  return parts.map((part) => {
    const i = part.indexOf(".eq.");
    if (i === -1) throw new Error("fake-admin: cláusula or() não suportada: " + part);
    return { col: part.slice(0, i), val: part.slice(i + 4) };
  });
}

class FakeQuery {
  constructor(store, failWrites, tableName) {
    this.store = store;
    this.failWrites = failWrites;
    this.tableName = tableName;
    this.filters = [];
    this.orClauses = null;
    this.updatePatch = null;
    this.insertRows = null;
    this.selectCols = null;
    this.wantsSingle = false;
    this.requireOne = false;
  }
  select(cols) {
    this.selectCols = cols;
    return this;
  }
  update(patch) {
    this.updatePatch = patch;
    return this;
  }
  insert(rows) {
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  eq(col, val) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }
  is(col, val) {
    this.filters.push({ kind: "is", col, val });
    return this;
  }
  /** .or("a.eq.1,b.eq.2") ou .or("a.eq.1,and(b.eq.2,c.eq.3)") — a mesma sintaxe do PostgREST real. */
  or(filterString) {
    this.orClauses = filterString.split(/,(?![^(]*\))/).map(parseOrClause);
    return this;
  }
  maybeSingle() {
    this.wantsSingle = true;
    return this;
  }
  /** Como maybeSingle, mas erra se nenhuma linha foi afetada/encontrada — o que insert().select().single() espera. */
  single() {
    this.wantsSingle = true;
    this.requireOne = true;
    return this;
  }
  _matches(row) {
    const eqIs = this.filters.every(({ kind, col, val }) => {
      const actual = row[col] ?? null;
      if (kind === "is") return val === null ? actual === null : actual === val;
      return String(actual) === String(val);
    });
    if (!eqIs) return false;
    if (!this.orClauses) return true;
    return this.orClauses.some((clause) => clause.every(({ col, val }) => String(row[col] ?? null) === String(val)));
  }
  _run() {
    if (this.insertRows) {
      if (this.failWrites.value) return { data: null, error: { message: "simulado: Supabase indisponível" } };
      const defaults = INSERT_DEFAULTS[this.tableName] ?? {};
      const now = new Date().toISOString();
      const inserted = this.insertRows.map((row) => ({
        id: row.id ?? crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        ...defaults,
        ...row,
      }));
      // Índice único parcial (ex.: subscriptions_one_live_per_user/_clinic):
      // só verificado se o teste declarou um, em options.uniqueConstraints —
      // imita o 23505 que o Postgres de verdade devolveria, para provar que o
      // código que lê esse erro (actions.ts) realmente é exercitado.
      for (const row of inserted) {
        for (const c of this.store.uniqueConstraints) {
          if (!c.where(row)) continue;
          const conflict = this.store.rows.some((existing) => c.where(existing) && c.columns.every((col) => existing[col] === row[col]));
          if (conflict) return { data: null, error: { code: "23505", message: `simulado: violação de unicidade (${c.columns.join(",")})` } };
        }
      }
      this.store.rows.push(...inserted);
      const data = this.selectCols ? inserted.map((r) => pick(r, this.selectCols)) : inserted;
      if (this.wantsSingle) {
        return data.length === 1 || !this.requireOne
          ? { data: data[0] ?? null, error: null }
          : { data: null, error: { message: "simulado: insert não afetou exatamente uma linha" } };
      }
      return { data, error: null };
    }
    if (this.updatePatch) {
      if (this.failWrites.value) return { data: null, error: { message: "simulado: Supabase indisponível" } };
      const affected = [];
      for (const row of this.store.rows) {
        if (this._matches(row)) {
          Object.assign(row, this.updatePatch);
          affected.push(row);
        }
      }
      const data = this.selectCols ? affected.map((r) => pick(r, this.selectCols)) : affected;
      return { data, error: null };
    }
    const matched = this.store.rows.filter((r) => this._matches(r));
    if (this.wantsSingle) {
      if (this.requireOne && matched.length !== 1) return { data: null, error: { message: "simulado: esperava exatamente uma linha" } };
      return { data: matched[0] ? pick(matched[0], this.selectCols) : null, error: null };
    }
    return { data: matched.map((r) => pick(r, this.selectCols)), error: null };
  }
  then(resolve, reject) {
    try {
      resolve(this._run());
    } catch (error) {
      reject(error);
    }
  }
}

class Store {
  constructor(rows, uniqueConstraints = []) {
    this.rows = rows;
    this.uniqueConstraints = uniqueConstraints;
  }
}

export class FakeAdmin {
  /**
   * options.uniqueConstraints: { tabela: [{ columns: string[], where: (row) => boolean }] } —
   * um índice único parcial por entrada, checado só no insert (ver FakeQuery._run).
   * Vazio por padrão: nenhum chamador existente precisa mudar.
   */
  constructor(initialTables = {}, options = {}) {
    this.tables = new Map();
    this._constraintsByTable = options.uniqueConstraints ?? {};
    for (const [name, rows] of Object.entries(initialTables)) this.tables.set(name, new Store(rows, this._constraintsByTable[name] ?? []));
    this._failWrites = { value: false };
  }
  from(name) {
    if (!this.tables.has(name)) this.tables.set(name, new Store([], this._constraintsByTable[name] ?? []));
    return new FakeQuery(this.tables.get(name), this._failWrites, name);
  }
  /** Liga/desliga a simulação de "Supabase indisponível": todo UPDATE falha enquanto estiver ligado. */
  setWritesFailing(failing) {
    this._failWrites.value = failing;
  }
  /** Lê o estado real de uma linha, sem passar pelo query builder — o que o teste confere no final. */
  row(table, id) {
    return this.tables.get(table)?.rows.find((r) => r.id === id) ?? null;
  }
}

let current = null;
export function setFakeAdminClient(client) {
  current = client;
}
export function getFakeAdminClient() {
  if (!current) throw new Error("fake admin client não configurado: chame setFakeAdminClient() no teste antes de importar/usar charges.ts.");
  return current;
}
