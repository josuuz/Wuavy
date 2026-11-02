/*
  A forma de um e-mail, num lugar só.

  Duas coisas dependem da MESMA regra, e se ela divergisse uma da outra o erro seria
  silencioso: o checkout (assinar/actions.ts) decide quais pagadores aceita gravar, e a
  busca de suporte (subscription-audit.ts) decide quais consegue achar. Um pagador aceito
  num lado e invisível no outro é exatamente o que este arquivo impede.

  "%" e "*" ficam de fora: são curingas do LIKE, e a busca de suporte usa o e-mail num
  LIKE (escapando "_" e a barra, mas recusando estes dois). Nenhum endereço que alguém
  tenha em mãos os contém.

  É só a FORMA — nunca a existência do endereço, que só o Mercado Pago confere. O banco
  repete o essencial como segunda linha de defesa (migration 0023: sem espaço em branco,
  de 3 a 254 caracteres).
*/

/** O tamanho máximo de um endereço de e-mail. */
export const MAX_EMAIL_LENGTH = 254;

const EMAIL_SHAPE = /^[^\s@%*]+@[^\s@.%*]+(\.[^\s@.%*]+)+$/;

/** O texto tem forma de e-mail? (Já sem espaços nas pontas e, para comparar, em minúsculas, se for o caso.) */
export const isEmailShape = (value: string): boolean => value.length > 0 && value.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(value);
