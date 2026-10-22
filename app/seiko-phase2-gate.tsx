"use client";

import { useAccess } from "./access-control";
import { SeikoPhase2 } from "./seiko-phase2";

/**
 * Phase 2 financial/library surfaces start owner/admin-only. This is deliberately
 * conservative while finer SEIKO library and billing permissions are finalized.
 */
export function SeikoPhase2Gate() {
  const { businessId, membership, can } = useAccess();
  if (businessId !== "seiko" || !membership || (!["owner", "admin"].includes(membership.role) && !(can("billing.view")&&can("financials.view")))) return null;
  return <SeikoPhase2/>;
}
