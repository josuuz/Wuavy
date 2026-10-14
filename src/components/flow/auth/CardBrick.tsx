"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

/*
  Mercado Pago's own Card Payment Brick: the card is typed into Mercado Pago's
  cross-origin iframes and turned into a token there. Only that token comes
  out of here, through `onToken`. The number never touches the Pulse.

  One copy, used by the checkout (the first subscription) and by Configurações
  (changing the card of one that exists), because the settings below were
  learned the hard way and must not drift apart between two copies:

  - Always the light theme. Card, expiry and CVV are Mercado Pago's iframes,
    and its dark theme turns their text white while leaving the field white —
    what is being typed becomes invisible.
  - One installment, credit only. The subscription is monthly and recurring;
    debit and prepaid cards do not carry a recurring authorization.
  - The button takes the Pulse's darker accent, because the Brick writes white
    on it.
*/

const SDK = "https://sdk.mercadopago.com/js/v2";

interface BrickController {
  unmount: () => void;
}
interface CardFormData {
  token: string;
  payer?: { email?: string };
}
interface MercadoPagoSdk {
  bricks: () => { create: (brick: "cardPayment", containerId: string, settings: object) => Promise<BrickController> };
}
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoSdk;
  }
}

export interface CardBrickProps {
  /** Where the brick mounts. Two bricks on one page need two ids. */
  id: string;
  publicKey: string;
  /** The payer the card token is made for. In test mode, the test buyer's. */
  email: string;
  /** In reais. The Brick shows it; it is never what sets a subscription's amount. */
  amount: number;
  submitLabel: string;
  /** The card, as a token. Resolve when done: the Brick waits on this. */
  onToken: (token: string, email: string) => Promise<void>;
  /** The brick is up and can be typed into. */
  onReady?: () => void;
  /** The brick could not be built at all (the SDK, the key, the network). */
  onFail?: () => void;
}

export function CardBrick({ id, publicKey, email, amount, submitLabel, onToken, onReady, onFail }: CardBrickProps) {
  const [sdk, setSdk] = useState(false);

  useEffect(() => {
    if (!sdk || !publicKey || !window.MercadoPago) return;
    const frame = document.querySelector("[data-pulse]") ?? document.documentElement;
    const signal = getComputedStyle(frame).getPropertyValue("--pulse-accent-text").trim();
    let controller: BrickController | undefined;
    let gone = false;
    new window.MercadoPago(publicKey, { locale: "pt-BR" })
      .bricks()
      .create("cardPayment", id, {
        initialization: { amount, payer: { email } },
        customization: {
          visual: {
            hideFormTitle: true,
            texts: { formSubmit: submitLabel },
            style: { theme: "default", ...(signal ? { customVariables: { baseColor: signal } } : {}) },
          },
          paymentMethods: { maxInstallments: 1, types: { excluded: ["debit_card", "prepaid_card"] } },
        },
        callbacks: {
          onReady: () => onReady?.(),
          onSubmit: async (card: CardFormData) => {
            await onToken(card.token, card.payer?.email ?? email);
          },
          // The Brick shows its own field errors; nothing technical reaches the person.
          onError: (error: unknown) => console.error("Mercado Pago Brick", error),
        },
      })
      .then((brick) => {
        if (gone) brick.unmount();
        else controller = brick;
      })
      .catch((error: unknown) => {
        console.error("Mercado Pago Brick", error);
        onFail?.();
      });
    return () => {
      gone = true;
      controller?.unmount();
    };
    // The callbacks are read on every mount; re-running on a new function identity
    // would tear the brick down while someone is typing into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, publicKey, email, amount, id, submitLabel]);

  return (
    <>
      <Script src={SDK} strategy="afterInteractive" onReady={() => setSdk(true)} />
      <div id={id} />
    </>
  );
}
