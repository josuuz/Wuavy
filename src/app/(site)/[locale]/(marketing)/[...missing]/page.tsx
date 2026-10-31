import { notFound } from "next/navigation";

/*
  Any site address without a page. An address that matches no route would
  get the app's global 404 (pt-BR); caught here, it gets this segment's
  not-found, inside the layout of the visitor's language.
*/

export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default function Missing() {
  notFound();
}
