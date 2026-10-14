import fs from 'node:fs';
import path from 'node:path';

// A raiz do repositório, deduzida da posição deste arquivo
// (supabase/propostas/prontuario/pgspike -> quatro níveis acima).
const REPO = path.resolve(import.meta.dirname, '../../../..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: dump.mjs <outdir>'); process.exit(1); }
fs.mkdirSync(path.join(OUT, 'tables'), { recursive: true });

const env = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8');
const g = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
};
const URL_ = g('NEXT_PUBLIC_SUPABASE_URL');
const KEY = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const spec = await (await fetch(URL_ + '/rest/v1/', { headers: H })).json();
const VIEWS = new Set(['pulse_leads']); // derived (security_invoker view over leads + auth.users)
const tables = Object.keys(spec.definitions || {}).filter((t) => !VIEWS.has(t)).sort();

const manifest = { takenAt: new Date().toISOString(), project: new URL(URL_).host, tables: {}, auth: {}, storage: {} };
manifest.skippedViews = [...VIEWS];
const PAGE = 1000;

for (const t of tables) {
  const rows = [];
  for (let off = 0; ; off += PAGE) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=${PAGE}&offset=${off}`, {
      headers: { ...H, Prefer: 'count=exact' },
    });
    if (!r.ok) { console.error(`FAIL ${t}: ${r.status} ${await r.text()}`); process.exit(1); }
    const batch = await r.json();
    rows.push(...batch);
    const cr = r.headers.get('content-range') || '';
    const total = Number(cr.split('/')[1]);
    if (off === 0) manifest.tables[t] = { reportedCount: Number.isFinite(total) ? total : null };
    if (batch.length < PAGE) break;
  }
  manifest.tables[t].exported = rows.length;
  fs.writeFileSync(path.join(OUT, 'tables', `${t}.json`), JSON.stringify(rows, null, 1));
  const n = manifest.tables[t];
  const flag = n.reportedCount !== null && n.reportedCount !== n.exported ? '  <-- MISMATCH' : '';
  console.log(`${t.padEnd(26)} reported=${String(n.reportedCount).padStart(6)} exported=${String(n.exported).padStart(6)}${flag}`);
}

// auth.users via Admin API
const users = [];
for (let page = 1; ; page++) {
  const r = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
  if (!r.ok) { console.error('auth users FAIL', r.status, await r.text()); break; }
  const j = await r.json();
  const batch = j.users || [];
  users.push(...batch);
  if (batch.length < 200) break;
}
fs.writeFileSync(path.join(OUT, 'auth-users.json'), JSON.stringify(users, null, 1));
manifest.auth.users = users.length;
console.log(`auth.users                               exported=${String(users.length).padStart(6)}`);

// storage inventory
const buckets = await (await fetch(URL_ + '/storage/v1/bucket', { headers: H })).json();
manifest.storage.buckets = [];
for (const b of Array.isArray(buckets) ? buckets : []) {
  const r = await fetch(`${URL_}/storage/v1/object/list/${b.name}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }),
  });
  const objs = r.ok ? await r.json() : [];
  manifest.storage.buckets.push({ name: b.name, public: b.public, objects: Array.isArray(objs) ? objs.length : 0 });
  console.log(`bucket ${b.name.padEnd(20)} public=${b.public} objects=${Array.isArray(objs) ? objs.length : '?'}`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const totalRows = Object.values(manifest.tables).reduce((a, b) => a + b.exported, 0);
console.log(`\nTOTAL ROWS = ${totalRows}  across ${tables.length} tables`);
