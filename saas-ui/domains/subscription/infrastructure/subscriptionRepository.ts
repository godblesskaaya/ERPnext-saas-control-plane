import { api } from "../../shared/lib/api";
import type { PlanDetail } from "../../shared/lib/types";

export async function listPublicPlans(): Promise<PlanDetail[]> {
  return api.listPlans();
}

