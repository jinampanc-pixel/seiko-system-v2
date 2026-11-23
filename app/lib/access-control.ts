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
  "vendors.view",
  "vendors.manage",
  "expenses.view",
  "expenses.manage",
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
  "billing.receipts.amend",
  "billing.documents.archive",
  "billing.documents.delete",
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
  { key: "orders.view", label: "View Orders", group: "Orders", description: "Open the Order Center and order workspaces." },
  { key: "orders.create", label: "Create Orders", group: "Orders", description: "Create new orders and workspaces." },
  { key: "orders.edit", label: "Edit Order Records", group: "Orders", description: "Edit business order records permitted by the active app." },
  { key: "orders.setup", label: "Edit Order Setup", group: "Orders", description: "Change order structure and setup where the active business supports it." },
  { key: "orders.close", label: "Close Orders", group: "Orders", description: "Save and close an active order." },
  { key: "orders.archive", label: "Archive Orders", group: "Orders", description: "Archive or restore orders." },
  { key: "pricing.view", label: "See Selling Prices", group: "Finance", description: "View selling-price information wherever pricing is shown." },
  { key: "pricing.edit", label: "Edit Selling Prices", group: "Finance", description: "Set or change selling prices and quotation values where supported." },
  { key: "costs.view", label: "See Costs", group: "Finance", description: "View purchase, material, production and cost-price information." },
  { key: "financials.view", label: "See Financial Information", group: "Finance", description: "View margins, totals, invoice values and financial summaries." },
  { key: "vendors.view", label: "View Vendors", group: "Finance", description: "View the active business's vendor/supplier library and linked purchasing history." },
  { key: "vendors.manage", label: "Manage Vendors", group: "Finance", description: "Create, edit, archive and maintain vendors for the active business." },
  { key: "expenses.view", label: "View Expenses & Spend", group: "Finance", description: "View the active business's expenses, spends and linked payment records." },
  { key: "expenses.manage", label: "Manage Expenses & Spend", group: "Finance", description: "Create, edit, classify, approve or record spend for the active business where the workflow permits." },
  { key: "billing.view", label: "View Billing", group: "Finance", description: "Open quotations, purchase orders, delivery challans, invoices and related commercial records." },
  { key: "billing.quotations.manage", label: "Manage Quotations", group: "Finance", description: "Create, edit, approve and revise quotations." },
  { key: "billing.purchase_orders.manage", label: "Manage Purchase Orders", group: "Finance", description: "Record and maintain customer or supplier purchase orders." },
  { key: "billing.delivery_challans.manage", label: "Manage Delivery Challans", group: "Finance", description: "Create and revise delivery challans from fulfilled orders and dispatches." },
  { key: "billing.invoices.manage", label: "Manage Invoices", group: "Finance", description: "Create, edit and issue invoices from billable records." },
  { key: "billing.receipts.amend", label: "Amend Payment Receipts", group: "Finance", description: "Correct recorded payments while preserving receipt numbers and amendment history. Requires financial information access." },
  { key: "billing.documents.archive", label: "Archive Billing Documents", group: "Finance", description: "Archive and restore invoices, quotations and challans." },
  { key: "billing.documents.delete", label: "Delete Billing Documents", group: "Finance", description: "Move unpaid documents to recoverable Trash or restore them; document numbers and audit history remain reserved." },
  { key: "catalog.view", label: "View Catalog", group: "Finance", description: "View the catalog derived from the active business's product/service master." },
  { key: "catalog.manage", label: "Manage Items, Services & Catalog", group: "Finance", description: "Maintain the active business's item/service master and catalog-facing information." },
  { key: "suggestions.manage", label: "Manage Dropdown Values", group: "Administration", description: "Owner-only: add, rename and remove shared dropdown/list values within the active business." },
  { key: "labels.view", label: "View Labels", group: "Labels", description: "Open saved labels and label records." },
  { key: "labels.create", label: "Create Labels", group: "Labels", description: "Create production, packing and inventory labels." },
  { key: "labels.print", label: "Print Labels", group: "Labels", description: "Send labels to the browser/printer." },
  { key: "labels.manage_layouts", label: "Manage Label Layouts", group: "Labels", description: "Save, edit and remove reusable label layouts." },
  { key: "labels.manage_sizes", label: "Manage Label Sizes", group: "Labels", description: "Add or remove label and roll-size presets." },
  { key: "scan.use", label: "Use Scan Station", group: "Operations", description: "Scan items and record operational state changes." },
  { key: "trace.view", label: "View Trace History", group: "Operations", description: "Search identities and review lifecycle history." },
  { key: "production.view", label: "View Production", group: "Operations", description: "Open production information and reports." },
  { key: "production.manage", label: "Manage Production", group: "Operations", description: "Change production state, assignments and production records." },
  { key: "inventory.view", label: "View Inventory", group: "Operations", description: "View stock and inventory records." },
  { key: "inventory.manage", label: "Manage Inventory", group: "Operations", description: "Receive, adjust and manage stock." },
  { key: "sales.view", label: "View Sales", group: "Operations", description: "Open sales records and customer sales information." },
  { key: "sales.manage", label: "Manage Sales", group: "Operations", description: "Create or change sales records." },
  { key: "delivery.view", label: "View Delivery", group: "Operations", description: "View packing, dispatch and delivery information." },
  { key: "delivery.manage", label: "Manage Delivery", group: "Operations", description: "Update dispatch and delivery state." },
  { key: "audit.view", label: "View Audit Trail", group: "Administration", description: "Review who changed ERP records and when." },
  { key: "settings.manage", label: "Manage Business Settings", group: "Administration", description: "Change business-level application settings." },
  { key: "users.manage", label: "Manage Users & Access", group: "Administration", description: "Add users, deactivate access and change permissions for the active business." },
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
