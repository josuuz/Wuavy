import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { LOGO_MAX } from "./types";

/*
  A clinic's logo, from onboarding or Configurações. The bucket is public to
  read, so what goes in is checked first: the size, and the file's own first
  bytes (never only the type the browser declared), so nothing but a PNG,
  JPEG or WebP image is ever stored. Written with the service role: no user
  can write to the bucket directly.
*/

const SIGNATURES = {
  png: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b: Uint8Array) =>
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
} as const;

const CONTENT_TYPE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

export const LOGO_ERROR = "O logo precisa ser PNG, JPG ou WebP de até 800 KB.";

/** A logo the form sent, or null when it sent none. */
export function logoFrom(form: FormData) {
  const file = form.get("logo");
  return file instanceof File && file.size > 0 ? file : null;
}

/** The image's real format, or null when it is not one we keep. */
export async function logoFormat(file: File) {
  if (file.size > LOGO_MAX) return null;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return (Object.keys(SIGNATURES) as (keyof typeof SIGNATURES)[]).find((format) => SIGNATURES[format](head)) ?? null;
}

/** Stores the clinic's logo and points the clinic at it. Returns false when it could not. */
export async function saveLogo(admin: SupabaseClient<Database>, organizationId: string, file: File) {
  const format = await logoFormat(file);
  if (!format) return false;
  const path = `${organizationId}/logo.${format}`;
  const upload = await admin.storage.from("clinic-logos").upload(path, file, { contentType: CONTENT_TYPE[format], upsert: true });
  if (upload.error) {
    console.error("logo upload", upload.error);
    return false;
  }
  // The same path for a new image: the version in the address makes every screen fetch the new one.
  const { data } = admin.storage.from("clinic-logos").getPublicUrl(path);
  const saved = await admin
    .from("organizations")
    .update({ logo_url: `${data.publicUrl}?v=${Date.now()}` })
    .eq("id", organizationId);
  if (saved.error) console.error("logo url", saved.error);
  return !saved.error;
}
