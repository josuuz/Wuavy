import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VIEWS } from "@/components/flow/demo/copy";
import { SCREENS } from "@/components/flow/demo/screens";

/* Every screen of the demo but the overview (and the real clinic's own, like Configurações): one static page each. */

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SCREENS)
    .filter((view) => !VIEWS.find((v) => v.slug === view)?.live)
    .map((view) => ({ view }));
}

export async function generateMetadata(props: PageProps<"/pulse/demo/[view]">): Promise<Metadata> {
  const { view } = await props.params;
  return { title: VIEWS.find((v) => v.slug === view)?.label };
}

export default async function FlowDemoView(props: PageProps<"/pulse/demo/[view]">) {
  const { view } = await props.params;
  const Screen = SCREENS[view];
  if (!Screen) notFound();
  return <Screen />;
}
