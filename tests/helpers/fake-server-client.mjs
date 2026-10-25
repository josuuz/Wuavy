/*
  Um Supabase falso, em memória, para rodar lib/flow/session.ts de verdade
  num teste puro de Node (tests/pulse-rejected-subscription-access.test.mjs):
  auth.getUser() e from() — só o que session.ts realmente usa (eq/or/neq/
  order/limit/maybeSingle). Mesmo padrão de fake-admin.mjs (billing-
  integration.test.mjs), mas para @/lib/supabase/server em vez de
  @/lib/supabase/admin, e com order()/limit() implementados de verdade: o
  que este teste prova é justamente qual linha session.ts escolhe como "a
  mais recente".
*/

function pick(row, cols) {
  if (!cols || cols === "*") return { ...row };
  const names = cols.split(",").map((c) => c.trim());
  const out = {};
  for (const name of names) out[name] = row[name] ?? null;
  return out;
}

/** "col.eq.val,and(col2.eq.val2,col3.is.null)" — a mesma sintaxe do PostgREST real, só o que session.ts usa. */
function parseOrClause(clause) {
  const and = clause.match(/^and\((.*)\)$/);
  const parts = (and ? and[1] : clause).split(",");
  return parts.map((part) => {
    const eq = part.indexOf(".eq.");
    const is = part.indexOf(".is.");
    const i = eq !== -1 ? eq : is;
    if (i === -1) throw new Error("fake-server-client: cláusula or() não suportada: " + part);
    const kind = eq !== -1 ? "eq" : "is";
    return { kind, col: part.slice(0, i), val: part.slice(i + 4) };
  });
}

class FakeQuery {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.orClauses = null;
    this.selectCols = null;
    this.wantsSingle = false;
    this.orderCol = null;
    this.orderAsc = true;
    this.limitN = null;
  }
  select(cols) {
    this.selectCols = cols;
    return this;
  }
  eq(col, val) {
    this.filters.push({ kind: "eq", col, val: String(val) });
    return this;
  }
  neq(col, val) {
    this.filters.push({ kind: "neq", col, val: String(val) });
    return this;
  }
  or(filterString) {
    this.orClauses = filterString.split(/,(?![^(]*\))/).map(parseOrClause);
    return this;
  }
  order(col, { ascending = true } = {}) {
    this.orderCol = col;
    this.orderAsc = ascending;
    return this;
  }
  limit(n) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.wantsSingle = true;
    return this;
  }
  _rowMatches(row, clause) {
    return clause.every(({ kind, col, val }) => {
      const actual = row[col] ?? null;
      if (kind === "is") return val === "null" ? actual === null : String(actual) === val;
      return String(actual) === val;
    });
  }
  _matches(row) {
    const plain = this.filters.every(({ kind, col, val }) => {
      const actual = String(row[col] ?? null);
      return kind === "neq" ? actual !== val : actual === val;
    });
    if (!plain) return false;
    if (!this.orClauses) return true;
    return this.orClauses.some((clause) => this._rowMatches(row, clause));
  }
  then(resolve, reject) {
    try {
      let matched = this.rows.filter((r) => this._matches(r));
      if (this.orderCol) {
        matched = [...matched].sort((a, b) => {
          const [x, y] = [a[this.orderCol], b[this.orderCol]];
          const cmp = x < y ? -1 : x > y ? 1 : 0;
          return this.orderAsc ? cmp : -cmp;
        });
      }
      if (this.limitN != null) matched = matched.slice(0, this.limitN);
      if (this.wantsSingle) {
        resolve({ data: matched[0] ? pick(matched[0], this.selectCols) : null, error: null });
        return;
      }
      resolve({ data: matched.map((r) => pick(r, this.selectCols)), error: null });
    } catch (error) {
      reject(error);
    }
  }
}

export class FakeServerClient {
  constructor({ user, tables = {} } = {}) {
    this._user = user ?? null;
    this.tables = new Map(Object.entries(tables));
    this.auth = { getUser: async () => ({ data: { user: this._user } }) };
  }
  from(name) {
    return new FakeQuery(this.tables.get(name) ?? []);
  }
}

let current = null;
export function setFakeServerClient(client) {
  current = client;
}
export function getFakeServerClient() {
  if (!current) throw new Error("fake server client não configurado: chame setFakeServerClient() antes de importar/usar session.ts.");
  return current;
}
