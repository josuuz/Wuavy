"use client";

import own from "./ClinicalFile.module.css";

/*
  The two shelves of the file that are drawn but not open: photographs with
  their documents, and consent.

  Neither reads or writes anything, and that is deliberate. The upload needs a
  private bucket, a server that signs every read, and the row written before
  the bytes so a half-finished upload cannot leave a patient's photograph in a
  bucket with nothing to say whose it is (migration 0016). None of that is in
  the database yet, so there is no button here that would look like it worked.

  Consent is held back for a different reason. Drawing a signature box would
  invite someone to believe the clinic had collected consent, and a tick in a
  web form is not that. What this shows is where the signed document will
  live, not a way to sign one.
*/

function Shelf({ title, text, slots }: { title: string; text: string; slots: string[] }) {
  return (
    <div className={own.waiting}>
      <p className={own.waitingTitle}>{title}</p>
      <p className={own.waitingText}>{text}</p>
      <div className={own.preview} aria-hidden>
        {slots.map((slot) => (
          <span key={slot} className={own.slot}>
            {slot}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Documents() {
  return (
    <Shelf
      title="Fotos e documentos, em breve"
      text="O antes e depois de cada atendimento e os exames entregues pela paciente ficam aqui. O envio só abre quando o armazenamento privado estiver no ar: foto de paciente não vai para um endereço público, e o arquivo só é mostrado por um link assinado que expira."
      slots={["Antes", "Depois", "Documento"]}
    />
  );
}

export function Consents() {
  return (
    <Shelf
      title="Consentimentos, em breve"
      text="O termo assinado de cada procedimento fica guardado aqui, com a data e o nome de quem assinou. A assinatura não acontece nesta tela: um aceite clicado num formulário não é consentimento informado, e o Pulse não vai fingir que é."
      slots={["Termo assinado"]}
    />
  );
}
