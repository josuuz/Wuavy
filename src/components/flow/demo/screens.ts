import type { ComponentType } from "react";

import { Automations } from "./views/Automations";
import { Opportunities } from "./views/Opportunities";
import { Patients } from "./views/Patients";
import { Pipeline } from "./views/Pipeline";
import { Procedures } from "./views/Procedures";
import { Schedule } from "./views/Schedule";
import { Stock } from "./views/Stock";

/* Every screen of the Pulse but the overview, by slug: the demo and the real Pulse route the same ones. */

export const SCREENS: Record<string, ComponentType> = {
  oportunidades: Opportunities,
  vendas: Pipeline,
  pacientes: Patients,
  agenda: Schedule,
  procedimentos: Procedures,
  estoque: Stock,
  automacoes: Automations,
};
