// The anamnesis's rules, which decide what reaches a patient's file. They are
// in a module of their own (lib/flow/clinical.ts) precisely so they can be run
// here, with no server, no session and no database: the server actions apply
// the same functions, so what passes here is what the action will accept.
//
// Nothing in this file touches Supabase. Every question and answer is made up.
import test from "node:test";
import assert from "node:assert/strict";

import {
  checkFields,
  FIELD_KINDS,
  FIXED_FIELDS,
  keyFor,
  missingRequired,
  readAnswers,
  readFields,
  showAnswer,
} from "../src/lib/flow/clinical.ts";

const fields = (...list) => readFields(list);

test("the five fixed answers are columns, each with a limit", () => {
  // They are columns in 0014 because an allergy must not depend on a template.
  assert.deepEqual(
    FIXED_FIELDS.map((f) => f.column),
    ["health_history", "allergies", "medications", "contraindications", "goals"],
  );
  for (const f of FIXED_FIELDS) {
    assert.ok(f.max > 0 && f.max <= 4000, `${f.key}: cabe no check da coluna`);
    assert.ok(f.label.length > 0, f.key);
  }
});

test("a question survives only if it is whole", () => {
  const read = fields(
    { key: "a", label: "Fuma?", kind: "boolean" },
    { key: "b", label: "", kind: "text" }, // sem enunciado
    { key: "", label: "Sem chave", kind: "text" },
    { key: "d", label: "Tipo inexistente", kind: "sonho" },
    { key: "e", label: "Escolha vazia", kind: "choice", options: [] },
    { key: "a", label: "Repetida", kind: "text" }, // chave já usada
  );
  assert.deepEqual(
    read.map((f) => f.key),
    ["a"],
  );
});

test("every kind the clinic may ask for is understood", () => {
  const read = fields(
    { key: "t", label: "Texto", kind: "text", max: 500 },
    { key: "b", label: "Sim ou não", kind: "boolean" },
    { key: "c", label: "Uma", kind: "choice", options: ["x", "y"] },
    { key: "l", label: "Várias", kind: "list", options: ["x", "y"] },
    { key: "d", label: "Data", kind: "date" },
  );
  assert.deepEqual(
    read.map((f) => f.kind),
    [...FIELD_KINDS],
  );
  assert.equal(read[0].max, 500);
});

test("a questionnaire is refused for a reason someone can act on", () => {
  assert.match(checkFields([]), /ao menos uma pergunta/);
  assert.equal(checkFields(fields({ key: "a", label: "Fuma?", kind: "boolean" })), null);
  const clash = [
    { key: "a", label: "Primeira", kind: "text" },
    { key: "a", label: "Segunda", kind: "text" },
  ];
  assert.match(checkFields(clash), /mesma chave/);
});

test("an answer is kept only in the shape its question asked for", () => {
  const list = fields(
    { key: "fuma", label: "Fuma?", kind: "boolean" },
    { key: "pele", label: "Pele", kind: "choice", options: ["seca", "oleosa"] },
    { key: "queixas", label: "Queixas", kind: "list", options: ["acne", "manchas"] },
    { key: "nascimento", label: "Nascimento", kind: "date" },
    { key: "obs", label: "Observações", kind: "text", max: 10 },
  );
  const answers = readAnswers(list, {
    fuma: "sim",
    pele: "roxa", // não está entre as opções
    queixas: ["acne", "inventada"],
    nascimento: "31/12/1990", // formato errado
    obs: "um texto bem mais longo do que cabe",
    intruso: "veio do navegador",
  });
  assert.equal(answers.fuma, true);
  assert.equal(answers.pele, undefined, "uma escolha fora da lista não entra");
  assert.deepEqual(answers.queixas, ["acne"], "só as opções que existem");
  assert.equal(answers.nascimento, undefined, "data só em AAAA-MM-DD");
  assert.equal(answers.obs.length, 10, "o texto é cortado no limite da pergunta");
  assert.equal("intruso" in answers, false, "uma chave que não é pergunta não entra no prontuário");
});

test("não e false são a mesma resposta, e vazio não é resposta", () => {
  const list = fields({ key: "fuma", label: "Fuma?", kind: "boolean" });
  assert.equal(readAnswers(list, { fuma: "nao" }).fuma, false);
  assert.equal(readAnswers(list, { fuma: "não" }).fuma, false);
  assert.equal(readAnswers(list, { fuma: false }).fuma, false);
  assert.equal("fuma" in readAnswers(list, { fuma: "" }), false);
});

test("uma pergunta obrigatória em branco é apontada pelo enunciado", () => {
  const list = fields(
    { key: "fuma", label: "Fuma?", kind: "boolean", required: true },
    { key: "obs", label: "Observações", kind: "text" },
  );
  assert.deepEqual(missingRequired(list, {}), ["Fuma?"]);
  // false é uma resposta, não uma ausência: é o engano que custa caro aqui.
  assert.deepEqual(missingRequired(list, readAnswers(list, { fuma: "nao" })), []);
});

test("a chave vem do enunciado e serve ao banco", () => {
  assert.equal(keyFor("Já fez preenchimento?"), "ja_fez_preenchimento");
  assert.equal(keyFor("  Alergia a AINEs  "), "alergia_a_aines");
  assert.equal(keyFor("???"), "pergunta", "um enunciado sem letras ainda vira chave");
  assert.ok(keyFor("x".repeat(80)).length <= 40);
});

test("uma resposta lida na tela não mostra o que o banco guardou", () => {
  assert.equal(showAnswer(true), "Sim");
  assert.equal(showAnswer(false), "Não");
  assert.equal(showAnswer(["acne", "manchas"]), "acne, manchas");
  assert.equal(showAnswer("1990-12-31"), "31/12/1990");
  assert.equal(showAnswer(null), "");
});

test("um questionário gigante não derruba a leitura", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ key: `k${i}`, label: `P${i}`, kind: "text" }));
  const read = readFields(many);
  assert.ok(read.length <= 40, "a leitura para no limite, em vez de aceitar qualquer coisa");
  assert.match(checkFields(many.map((f) => ({ ...f }))), /vai até/);
});

test("lixo no lugar das perguntas não vira pergunta", () => {
  for (const junk of [null, undefined, "", 7, { a: 1 }, [null, 3, "x"]]) {
    assert.deepEqual(readFields(junk), [], JSON.stringify(junk ?? null));
  }
  assert.deepEqual(readAnswers(fields({ key: "a", label: "A", kind: "text" }), null), {});
});
