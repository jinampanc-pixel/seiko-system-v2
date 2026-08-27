import { businessCatalogEntry } from "./business-catalog";
import { MODULES, THEME_PRESETS, normalizeMembership, type BusinessMembership, type FoundationBootstrap, type Module } from "./foundation";
import type { Actor, Membership } from "./server-erp-auth";

export function buildFoundationBootstrap(actor: Actor, memberships: Membership[]): FoundationBootstrap {
  const businesses: BusinessMembership[] = memberships.map(membership => {
    const catalog = businessCatalogEntry(membership.businessId);
    const allowedModules = new Set<Module>(catalog.allowedModules);
    const modules = (membership.modules || []).filter(
      (module): module is Module => (MODULES as readonly string[]).includes(module) && allowedModules.has(module as Module),
    );

    // A business can only expose modules that belong to its product profile. Memberships
    // may further reduce access, but they can never enable another business's workflow.
    if (!modules.includes("home") && allowedModules.has("home")) modules.unshift("home");

    return normalizeMembership({
      businessId: membership.businessId,
      businessName: catalog.businessName,
      logoUrl: catalog.logoUrl || undefined,
      role: membership.role,
      modules,
      permissions: membership.permissions,
      theme: THEME_PRESETS[catalog.themeKey] || THEME_PRESETS.jinam,
    });
  }).filter(membership => membership.modules.includes("home"));

  return {
    user: { displayName: actor.displayName, email: actor.email },
    businesses,
  };
}
