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

class FakeQuery {
  constructor(store, failWrites) {
    this.store = store;
    this.failWrites = failWrites;
    this.filters = [];
    this.updatePatch = null;
    this.selectCols = null;
    this.single = false;
  }
  select(cols) {
    this.selectCols = cols;
    return this;
  }
  update(patch) {
    this.updatePatch = patch;
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
  maybeSingle() {
    this.single = true;
    return this;
  }
  _matches(row) {
    return this.filters.every(({ kind, col, val }) => {
      const actual = row[col] ?? null;
      if (kind === "is") return val === null ? actual === null : actual === val;
      return actual === val;
    });
  }
  _run() {
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
    if (this.single) return { data: matched[0] ? pick(matched[0], this.selectCols) : null, error: null };
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
  constructor(rows) {
    this.rows = rows;
  }
}

export class FakeAdmin {
  constructor(initialTables = {}) {
    this.tables = new Map();
    for (const [name, rows] of Object.entries(initialTables)) this.tables.set(name, new Store(rows));
    this._failWrites = { value: false };
  }
  from(name) {
    if (!this.tables.has(name)) this.tables.set(name, new Store([]));
    return new FakeQuery(this.tables.get(name), this._failWrites);
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
