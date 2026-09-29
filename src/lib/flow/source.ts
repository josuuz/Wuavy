import { createDemoData } from "@/data/flow-demo";
import type { FlowData, ID } from "./types";

/*
  Where the Flow reads a clinic's data. The demo builds it in memory. The real
  source implements the same interface over Supabase: one select per table,
  filtered by organization_id (row-level security enforces it too), mapped
  from snake_case to these types. Pages never know which one they got.
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
