import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import type { Service } from "@/lib/types";

/*
  Services, framed as outcomes (brand/DESIGN.md → Voice). No prices on the
  site: the investment comes in the proposal.
  Order here is the order on the page. `status: "soon"` keeps a service in
  the data without showing it. Names and words are in the dictionaries
  (src/i18n), under `services`.
*/

export type ServiceId = "sites" | "trafego-pago" | "sistemas";

export interface ServiceText {
  name: string;
  outcome: string;
  summary: string;
  deliverables: string[];
  note?: string;
}

const structure: Array<Pick<Service, "status" | "href"> & { id: ServiceId }> = [
  { id: "sites", status: "active" },
  { id: "trafego-pago", status: "active" },
  { id: "sistemas", href: "#sistemas", status: "active" },
];

export function getServices(locale: Locale): Service[] {
  const text = getDictionary(locale).services;
  return structure.map((s) => ({ ...s, ...text[s.id] }));
}

export const activeServices = (locale: Locale) => getServices(locale).filter((s) => s.status === "active");

export function serviceName(id: Service["id"], locale: Locale): string {
  return getDictionary(locale).services[id as ServiceId]?.name ?? id;
}
