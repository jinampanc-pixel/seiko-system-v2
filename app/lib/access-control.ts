import type { Module } from "./foundation";

export const PERMISSIONS = [
  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.setup",
  "orders.close",
  "orders.archive",
  "pricing.view",
  "pricing.edit",
  "costs.view",
  "financials.view",
  "suggestions.manage",
  "labels.view",
  "labels.create",
  "labels.print",
  "labels.manage_layouts",
  "labels.manage_sizes",
  "scan.use",
  "trace.view",
  "production.view",
  "production.manage",
  "inventory.view",
  "inventory.manage",
  "sales.view",
  "sales.manage",
  "billing.view",
  "billing.quotations.manage",
  "billing.purchase_orders.manage",
  "billing.delivery_challans.manage",
  "billing.invoices.manage",
  "catalog.view",
  "catalog.manage",
  "delivery.view",
  "delivery.manage",
  "audit.view",
  "settings.manage",
  "users.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type AccessRole = "owner" | "admin" | "operations" | "viewer";

/** Controls that are deliberately never delegable away from a business Owner. */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = ["suggestions.manage"];

export type AccessConfig = {
  modules?: Module[];
  permissions?: Permission[];
};

export type PermissionDefinition = {
  key: Permission;
  label: string;
  group: "Orders" | "Finance" | "Labels" | "Operations" | "Administration";
  description: string;
};

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: "orders.view", label: "View orders", group: "Orders", description: "Open the Order Center and order workspaces." },
  { key: "orders.create", label: "Create orders", group: "Orders", description: "Create new orders and workspaces." },
  { key: "orders.edit", label: "Edit order records", group: "Orders", description: "Edit person rows, measurements and saved order data." },
  { key: "orders.setup", label: "Edit order setup", group: "Orders", description: "Change products, person fields, measurements and order structure." },
  { key: "orders.close", label: "Close orders", group: "Orders", description: "Save and close an active order." },
  { key: "orders.archive", label: "Archive orders", group: "Orders", description: "Archive or restore orders." },
  { key: "pricing.view", label: "See selling prices", group: "Finance", description: "View selling-price information wherever pricing is shown." },
  { key: "pricing.edit", label: "Edit selling prices", group: "Finance", description: "Set or change selling prices and quotations." },
  { key: "costs.view", label: "See costs", group: "Finance", description: "View purchase, material, production and cost-price information." },
  { key: "financials.view", label: "See financial information", group: "Finance", description: "View margins, totals, invoice values and financial summaries." },
  { key: "billing.view", label: "View billing", group: "Finance", description: "Open quotations, purchase orders, delivery challans, invoices and related commercial records." },
  { key: "billing.quotations.manage", label: "Manage quotations", group: "Finance", description: "Create, edit, approve and revise quotations." },
  { key: "billing.purchase_orders.manage", label: "Manage purchase orders", group: "Finance", description: "Record and maintain customer or supplier purchase orders." },
  { key: "billing.delivery_challans.manage", label: "Manage delivery challans", group: "Finance", description: "Create and revise delivery challans from fulfilled orders and dispatches." },
  { key: "billing.invoices.manage", label: "Manage invoices", group: "Finance", description: "Create, edit and issue invoices from billable records." },
  { key: "catalog.view", label: "View catalog", group: "Finance", description: "View the catalog derived from the shared product and service master." },
  { key: "catalog.manage", label: "Manage items, services & catalog", group: "Finance", description: "Maintain the shared item/service master and catalog-facing information." },
  { key: "suggestions.manage", label: "Manage dropdown values", group: "Administration", description: "Owner-only: add, rename and remove shared dropdown/list values." },
  { key: "labels.view", label: "View labels", group: "Labels", description: "Open saved labels and label records." },
  { key: "labels.create", label: "Create labels", group: "Labels", description: "Create production, packing and inventory labels." },
  { key: "labels.print", label: "Print labels", group: "Labels", description: "Send labels to the browser/printer." },
  { key: "labels.manage_layouts", label: "Manage label layouts", group: "Labels", description: "Save, edit and remove reusable label layouts." },
  { key: "labels.manage_sizes", label: "Manage label sizes", group: "Labels", description: "Add or remove label and roll-size presets." },
  { key: "scan.use", label: "Use scan station", group: "Operations", description: "Scan items and record operational state changes." },
  { key: "trace.view", label: "View trace history", group: "Operations", description: "Search identities and review lifecycle history." },
  { key: "production.view", label: "View production", group: "Operations", description: "Open production information and reports." },
  { key: "production.manage", label: "Manage production", group: "Operations", description: "Change production state, assignments and production records." },
  { key: "inventory.view", label: "View inventory", group: "Operations", description: "View stock and inventory records." },
  { key: "inventory.manage", label: "Manage inventory", group: "Operations", description: "Receive, adjust and manage stock." },
  { key: "sales.view", label: "View sales", group: "Operations", description: "Open sales records and customer sales information." },
  { key: "sales.manage", label: "Manage sales", group: "Operations", description: "Create or change sales records." },
  { key: "delivery.view", label: "View delivery", group: "Operations", description: "View packing, dispatch and delivery information." },
  { key: "delivery.manage", label: "Manage delivery", group: "Operations", description: "Update dispatch and delivery state." },
  { key: "audit.view", label: "View audit trail", group: "Administration", description: "Review who changed ERP records and when." },
  { key: "settings.manage", label: "Manage business settings", group: "Administration", description: "Change business-level application settings." },
  { key: "users.manage", label: "Manage users & access", group: "Administration", description: "Add users, deactivate access and change permissions." },
];

const ALL_PERMISSIONS = [...PERMISSIONS];
const DELEGABLE_PERMISSIONS = ALL_PERMISSIONS.filter(permission => !OWNER_ONLY_PERMISSIONS.includes(permission));

export const ROLE_PERMISSION_PRESETS: Record<AccessRole, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: DELEGABLE_PERMISSIONS,
  operations: [
    "orders.view", "orders.create", "orders.edit",
    "labels.view", "labels.create", "labels.print",
    "scan.use", "trace.view",
    "production.view", "production.manage",
    "inventory.view", "inventory.manage",
    "billing.view", "billing.delivery_challans.manage",
    "delivery.view", "delivery.manage",
  ],
  viewer: ["orders.view", "labels.view", "trace.view", "production.view", "inventory.view", "sales.view", "billing.view", "catalog.view", "delivery.view"],
};

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

export function isDelegablePermission(value: Permission): boolean {
  return !OWNER_ONLY_PERMISSIONS.includes(value);
}

export function permissionsForRole(role: AccessRole, configured?: readonly Permission[]): Permission[] {
  if (role === "owner") return [...ALL_PERMISSIONS];
  if (configured) return [...new Set(configured.filter(isPermission).filter(isDelegablePermission))];
  return [...ROLE_PERMISSION_PRESETS[role]];
}

export function parseAccessConfig(raw: string | null | undefined): AccessConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return { modules: parsed.filter(item => typeof item === "string") as Module[] };
    if (!parsed || typeof parsed !== "object") return {};
    const value = parsed as { modules?: unknown; permissions?: unknown };
    return {
      modules: Array.isArray(value.modules) ? value.modules.filter(item => typeof item === "string") as Module[] : undefined,
      permissions: Array.isArray(value.permissions) ? value.permissions.filter(isPermission) : undefined,
    };
  } catch {
    return {};
  }
}

export function serializeAccessConfig(config: AccessConfig): string {
  return JSON.stringify({ modules: config.modules || [], permissions: config.permissions || [] });
}
