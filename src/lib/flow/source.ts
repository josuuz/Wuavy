import { createDemoData } from "@/data/flow-demo";
import type { FlowData, ID } from "./types";

/*
  Where the Pulse reads a clinic's data. The demo builds it in memory; the real
  source (supabase-source.ts) implements the same interface over Supabase.
  Screens never know which one they got.
*/

export interface FlowSource {
  load(organizationId: ID): Promise<FlowData>;
}

export const demoSource: FlowSource = {
  async load() {
    return createDemoData();
  },
};

export const DEMO_ORGANIZATION = "org_aurora";
