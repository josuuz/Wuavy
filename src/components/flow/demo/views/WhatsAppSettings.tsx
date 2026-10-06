"use client";

import { useEffect, useRef, useState } from "react";

import { completeEmbeddedSignup, connectTestNumber, disconnectWhatsApp } from "@/lib/whatsapp/actions";
import type { NumberChoice, WhatsAppState } from "@/lib/whatsapp/types";
import { FormError, Soon, useWrite } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  Configurações → WhatsApp, the owner's. It speaks the clinic's language:
  which number the clinic answers patients on, never a token, an account id
  or a webhook. The steps only orient (a clinic's own number is recommended,
  a personal one is welcome); the channel behind them is the same.

  Connecting goes through Meta's own flow (Embedded Signup) in a Meta window,
  or, during the test phase, to Meta's test number for the test clinic only.
  The server checks the role again and does everything that needs a
  credential (lib/whatsapp/actions.ts).
*/

type Step = "choose" | "clinic" | "personal" | "app" | "messenger" | "ready";

const PRIVACY =
  "O Pulse recebe só as mensagens que a Meta entrega oficialmente para empresas. Ele nunca acessa contatos, fotos, chamadas ou outras conversas do celular.";

export function WhatsAppSettings() {
  const { data, access } = useFlow();
  const state = data.whatsapp;
  const [step, setStep] = useState<Step | null>(null);
  const [choice, setChoice] = useState<NumberChoice>("clinic");
  const [managing, setManaging] = useState(false);
  const [asking, setAsking] = useState(false);
  const { pending, error, write } = useWrite();
  if (!state) return null;
  const connection = state.connection;
  const canConnect = Boolean(state.connect) && access.canEdit;

  const start = () => {
    setManaging(false);
    setStep("choose");
  };

  return (
    <section className={styles.panel} aria-labelledby="whatsapp">
      <h2 id="whatsapp" className={styles.label}>
        WhatsApp
      </h2>

      {connection && !step ? (
        <>
          {connection.status === "connected" ? (
            <p className={styles.done}>WhatsApp conectado</p>
          ) : connection.status === "error" ? (
            <p>
              <strong>Seu WhatsApp precisa ser reconectado.</strong>
            </p>
          ) : (
            <p>
              <strong>Conectando o WhatsApp…</strong>
            </p>
          )}
          <div className={styles.settingsRow}>
            <strong>{connection.displayPhone ?? "Número da clínica"}</strong>
            <span>{connection.displayName ?? ""}</span>
          </div>
          <div className={styles.settingsRow}>
            <span>Status: {connection.status === "connected" ? "Ativo" : connection.status === "error" ? "Precisa reconectar" : "Conectando"}</span>
            {connection.test ? <Soon>Número de teste</Soon> : null}
          </div>
          {connection.businessApp ? (
            <p className={styles.fine}>Você continua usando o WhatsApp Business no celular. As conversas também chegam ao Pulse.</p>
          ) : null}
          <FormError error={error} />
          {connection.status === "error" && canConnect ? (
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => setStep("ready")}>
                Reconectar
              </button>
            </div>
          ) : null}
          {access.canEdit ? (
            managing ? (
              <div className={styles.actions}>
                {asking ? (
                  <>
                    <p className={styles.fine}>
                      Desconectar o WhatsApp? O Pulse para de enviar e receber por ele. Pacientes, contatos, conversas, agenda e
                      histórico continuam aqui.
                    </p>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={pending}
                      onClick={() =>
                        write(disconnectWhatsApp, () => {
                          setAsking(false);
                          setManaging(false);
                        })
                      }
                    >
                      {pending ? "Desconectando…" : "Desconectar"}
                    </button>
                    <button type="button" className={styles.quiet} onClick={() => setAsking(false)}>
                      Manter conectado
                    </button>
                  </>
                ) : (
                  <>
                    {canConnect ? (
                      <button type="button" className={styles.secondary} onClick={start}>
                        Trocar número
                      </button>
                    ) : null}
                    <button type="button" className={styles.secondary} onClick={() => setAsking(true)}>
                      Desconectar WhatsApp
                    </button>
                    <button type="button" className={styles.quiet} onClick={() => setManaging(false)}>
                      Fechar
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={() => setManaging(true)}>
                  Gerenciar conexão
                </button>
              </div>
            )
          ) : null}
          {managing && canConnect && !asking ? (
            <p className={styles.fine}>Trocar o número não apaga nada: o histórico, os pacientes e os contatos continuam na clínica.</p>
          ) : null}
        </>
      ) : null}

      {!connection && !step ? (
        <>
          <p>Conecte o WhatsApp usado pela clínica para centralizar suas conversas no Pulse.</p>
          {canConnect ? (
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={start}>
                Conectar WhatsApp
              </button>
            </div>
          ) : (
            <p>
              <Soon />
            </p>
          )}
          <p className={styles.fine}>
            Continue atendendo normalmente. O Pulse organiza as conversas e conecta cada contato à operação da clínica.
          </p>
        </>
      ) : null}

      {step ? (
        <ConnectSteps
          state={state}
          step={step}
          setStep={setStep}
          choice={choice}
          setChoice={setChoice}
          onCancel={() => setStep(null)}
          onDone={() => setStep(null)}
        />
      ) : null}
    </section>
  );
}

interface StepsProps {
  state: WhatsAppState;
  step: Step;
  setStep: (step: Step) => void;
  choice: NumberChoice;
  setChoice: (choice: NumberChoice) => void;
  onCancel: () => void;
  onDone: () => void;
}

function ConnectSteps({ state, step, setStep, choice, setChoice, onCancel, onDone }: StepsProps) {
  const cancel = (
    <button type="button" className={styles.quiet} onClick={onCancel}>
      Cancelar
    </button>
  );

  if (step === "choose") {
    return (
      <>
        <p>
          <strong>Qual WhatsApp sua clínica usa para atender pacientes?</strong>
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setChoice("clinic");
              setStep("clinic");
            }}
          >
            Usar número da clínica
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setChoice("personal");
              setStep("personal");
            }}
          >
            Usar meu número atual
          </button>
          {cancel}
        </div>
      </>
    );
  }

  if (step === "clinic") {
    return (
      <>
        <p>Recomendamos um número exclusivo da clínica para separar conversas profissionais e pessoais.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setStep("app")}>
            Continuar
          </button>
          {cancel}
        </div>
      </>
    );
  }

  if (step === "personal") {
    return (
      <>
        <p>
          Você pode continuar usando seu número atual. As conversas comerciais conectadas poderão ser organizadas pelo Pulse.
          Para maior privacidade, recomendamos um número exclusivo da clínica no futuro.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setStep("app")}>
            Continuar com meu número
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setChoice("clinic");
              setStep("clinic");
            }}
          >
            Prefiro usar outro número
          </button>
        </div>
      </>
    );
  }

  if (step === "app") {
    return (
      <>
        <p>
          <strong>No celular, este número está em qual WhatsApp?</strong>
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => setStep("ready")}>
            WhatsApp Business
          </button>
          <button type="button" className={styles.secondary} onClick={() => setStep("messenger")}>
            WhatsApp comum
          </button>
          {cancel}
        </div>
        <p className={styles.fine}>O WhatsApp Business tem um ícone com a letra B. Um número novo, ainda sem WhatsApp, também serve.</p>
      </>
    );
  }

  if (step === "messenger") {
    return (
      <>
        <p>
          Para conectar este número ao Pulse, será necessário configurá-lo para uso comercial no WhatsApp. O caminho mais simples
          é instalar o WhatsApp Business no celular e passar este número para ele. Você poderá continuar usando o mesmo número
          quando o fluxo oficial permitir.
        </p>
        <p className={styles.fine}>A própria Meta confirma, na próxima etapa, se o número pode ser conectado.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => setStep("ready")}>
            Entendi, continuar
          </button>
          {cancel}
        </div>
      </>
    );
  }

  return state.connect === "test" ? (
    <TestConnect choice={choice} onCancel={onCancel} onDone={onDone} />
  ) : state.connect === "embedded_signup" && state.embedded ? (
    <MetaConnect embedded={state.embedded} choice={choice} onCancel={onCancel} onDone={onDone} />
  ) : (
    <>
      <p>A conexão com o WhatsApp ainda está sendo liberada para a sua clínica.</p>
      <div className={styles.actions}>{cancel}</div>
    </>
  );
}

function TestConnect({ choice, onCancel, onDone }: { choice: NumberChoice; onCancel: () => void; onDone: () => void }) {
  const { pending, error, write } = useWrite();
  return (
    <>
      <p>
        <strong>Fase de teste.</strong> O Pulse vai usar o número de teste oficial da Meta para provar que receber, salvar e
        responder funcionam. O número da clínica será conectado depois.
      </p>
      <p className={styles.fine}>{PRIVACY}</p>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={pending} onClick={() => write(() => connectTestNumber(choice), onDone)}>
          {pending ? "Conectando…" : "Conectar número de teste"}
        </button>
        <button type="button" className={styles.quiet} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </>
  );
}

/* ── Meta's Embedded Signup ─────────────────────────────────── */

interface FacebookSdk {
  init(options: Record<string, unknown>): void;
  login(callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let sdk: Promise<FacebookSdk> | null = null;

/** Meta's SDK, loaded once, before the button is pressed (the Meta window must open from the click itself). */
function loadSdk(appId: string, version: string) {
  sdk ??= new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdk = null;
      reject(new Error("sdk"));
    };
    document.body.appendChild(script);
  });
  return sdk;
}

interface SessionInfo {
  event: string;
  phoneNumberId?: string;
  wabaId?: string;
  businessId?: string;
}

function MetaConnect({
  embedded,
  choice,
  onCancel,
  onDone,
}: {
  embedded: NonNullable<WhatsAppState["embedded"]>;
  choice: NumberChoice;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { pending, error, write } = useWrite();
  const [ready, setReady] = useState<FacebookSdk | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const info = useRef<SessionInfo | null>(null);

  useEffect(() => {
    let alive = true;
    loadSdk(embedded.appId, embedded.graphVersion)
      .then((fb) => alive && setReady(fb))
      .catch(() => alive && setProblem("Não foi possível abrir a Meta agora. Verifique a conexão e tente de novo."));
    // What Meta's window reports when it finishes: the ids, checked again on the server.
    const listen = (event: MessageEvent) => {
      let host = "";
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      let message: { type?: string; event?: string; data?: Record<string, string> };
      try {
        message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (message?.type !== "WA_EMBEDDED_SIGNUP") return;
      info.current = {
        event: String(message.event ?? ""),
        phoneNumberId: message.data?.phone_number_id,
        wabaId: message.data?.waba_id,
        businessId: message.data?.business_id,
      };
    };
    window.addEventListener("message", listen);
    return () => {
      alive = false;
      window.removeEventListener("message", listen);
    };
  }, [embedded.appId, embedded.graphVersion]);

  const finish = async (code: string) => {
    // Meta's report and the code arrive separately: wait a moment for the report.
    for (let i = 0; i < 20 && !info.current?.phoneNumberId; i++) await new Promise((r) => setTimeout(r, 150));
    const got = info.current;
    if (!got?.phoneNumberId || !got.wabaId || (got.event !== "FINISH" && got.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")) {
      setProblem("A conexão não foi concluída na Meta. Tente de novo.");
      return;
    }
    write(
      () =>
        completeEmbeddedSignup({
          code,
          phoneNumberId: got.phoneNumberId!,
          wabaId: got.wabaId!,
          businessId: got.businessId,
          businessApp: got.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          numberChoice: choice,
        }),
      onDone,
    );
  };

  const open = () => {
    if (!ready) return;
    setProblem(null);
    info.current = null;
    ready.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) void finish(code);
        else setProblem("A conexão foi cancelada. Você pode tentar de novo quando quiser.");
      },
      {
        config_id: embedded.configId,
        response_type: "code",
        override_default_response_type: true,
        // Meta offers both: a number kept on the WhatsApp Business app (coexistence) or a number new to the platform.
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding" },
      },
    );
  };

  return (
    <>
      <p>
        Você vai entrar na sua conta da Meta, escolher a empresa e confirmar o número. O Pulse recebe a autorização
        automaticamente: não é preciso copiar nenhum código.
      </p>
      <p className={styles.fine}>{PRIVACY}</p>
      <FormError error={problem ?? error} />
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={!ready || pending} onClick={open}>
          {pending ? "Concluindo…" : ready ? "Continuar na Meta" : "Carregando…"}
        </button>
        <button type="button" className={styles.quiet} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </>
  );
}
