import urbanCrowd from "@/assets/photo/urban-crowd.jpg";

/*
  Imagery for the home page, and the approved brand lines it draws on (pt-BR,
  for reference: what the site shows is in the dictionaries, src/i18n).
  Lines marked `deslocamento` come from propostas/c-deslocamento (brand-authored
  copy of direction C); the rest are the approved Frequência lines.
*/

export const phrases = {
  move: "Crescer é sair do lugar.", // deslocamento
  seen: "Quem anda aparece.", // deslocamento
  budget: "Verba parada não move nada.", // deslocamento
  noise: "Performance sem ruído.", // deslocamento + frequência
  leaves: "A marca sai do lugar e não volta.", // deslocamento
  together: "Uma agência que cresce junto com o cliente, não à frente dele.", // deslocamento
  scope: "Tráfego pago e sites hoje; marca, conteúdo, automação e consultoria conforme a operação pede.", // deslocamento
  thesis:
    "Nenhuma operação muda de patamar sem largar a posição em que estava confortável. É isso que uma agência de performance faz quando faz bem: tira a marca do lugar onde ela parou de crescer.", // deslocamento
  plan: "Plano de deslocamento", // deslocamento
  frequency: "Frequência vence volume.", // frequência
  chosen: "Visto sempre. Escolhido primeiro.", // frequência
  method:
    "Planejamos a mensagem, construímos o canal e repetimos o sinal com precisão até o mercado se mover junto.", // frequência
} as const;

// Its description is the dictionaries' home.hero.imageAlt.
export const heroImage = { src: urbanCrowd };
