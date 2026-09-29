import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VIEWS } from "@/components/flow/demo/copy";
import { SCREENS } from "@/components/flow/demo/screens";

/* Every screen of the real Flow but the overview. Rendered per request: the data is the clinic's. */

export async function generateMetadata(props: PageProps<"/flow/app/[view]">): Promise<Metadata> {
  const { view } = await props.params;
  return { title: VIEWS.find((v) => v.slug === view)?.label };
}

export default async function FlowAppView(props: PageProps<"/flow/app/[view]">) {
  const { view } = await props.params;
  const Screen = SCREENS[view];
  if (!Screen) notFound();
  return <Screen />;
}
