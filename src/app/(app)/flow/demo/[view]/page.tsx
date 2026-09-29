import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";

import { VIEWS } from "@/components/flow/demo/copy";
import { Automations } from "@/components/flow/demo/views/Automations";
import { Opportunities } from "@/components/flow/demo/views/Opportunities";
import { Patients } from "@/components/flow/demo/views/Patients";
import { Pipeline } from "@/components/flow/demo/views/Pipeline";
import { Procedures } from "@/components/flow/demo/views/Procedures";
import { Schedule } from "@/components/flow/demo/views/Schedule";
import { Stock } from "@/components/flow/demo/views/Stock";

/* Every screen of the demo but the overview: one static page each. */

const SCREENS: Record<string, ComponentType> = {
  oportunidades: Opportunities,
  crm: Pipeline,
  pacientes: Patients,
  agenda: Schedule,
  procedimentos: Procedures,
  estoque: Stock,
  automacoes: Automations,
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SCREENS).map((view) => ({ view }));
}

export async function generateMetadata(props: PageProps<"/flow/demo/[view]">): Promise<Metadata> {
  const { view } = await props.params;
  return { title: VIEWS.find((v) => v.slug === view)?.label };
}

export default async function FlowDemoView(props: PageProps<"/flow/demo/[view]">) {
  const { view } = await props.params;
  const Screen = SCREENS[view];
  if (!Screen) notFound();
  return <Screen />;
}
