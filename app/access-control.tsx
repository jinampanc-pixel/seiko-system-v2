Warning: truncated output (original token count: 7017)
Total output lines: 439

warning: in the working copy of 'app/access-control.tsx', LF will be replaced by CRLF the next time Git touches it
[master f7ff2a2] Make first-owner setup the primary login action
 1 file changed, 3 insertions(+), 3 deletions(-)
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MODULES, type BusinessMembership, type FoundationBootstrap, type Module } from "./lib/foundation";
import { PERMISSION_DEFINITIONS, ROLE_PERMISSION_PRESETS, permissionsForRole, type AccessRole, type Permission } from "./lib/access-control";
import { ModernAccountMethods, ModernLoginOptions } from "./modern-auth-ui";

type SessionState = {
  user: FoundationBootstrap["user"];
  businesses: BusinessMembership[];
};

type ManagedUser = {
  email: string;
  displayName: string;
  phone: string;
  hasCredentials: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  role: AccessRole;
  modules: Module[];
  permissions: Permission[];
  customPermissions: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

type AccessContextValue = {
  session: SessionState | null;
  businessId: string;
  membership?: BusinessMembership;
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
};

type AccessStatus = "loading" | "ready" | "signed-out" | "change-password" | "no-access" | "error";

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider.");
  return value;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<AccessStatus>("loading");
  const [message, setMessag…6017 tokens truncated…
  const toggleModule = (module: Module) => onModules?.(modules.includes(module) ? modules.filter(item => item !== module) : [...modules, module]);
  const togglePermission = (permission: Permission) => onPermissions?.(permissions.includes(permission) ? permissions.filter(item => item !== permission) : [...permissions, permission]);
  return <div className={`accessMatrix ${readOnly ? "readOnly" : ""}`}>
    <section><h3>Modules</h3><p>Controls which parts of the system appear for this user.</p><div className="accessModuleGrid">{MODULES.filter(item => item !== "admin").map(module => { const label = module === "home" ? "Home" : module[0].toUpperCase() + module.slice(1); return <label key={module} htmlFor={`access-module-${module}`}><input id={`access-module-${module}`} aria-label={`${label} module`} type="checkbox" checked={modules.includes(module)} onChange={() => toggleModule(module)} disabled={readOnly}/><span>{label}</span></label>; })}</div></section>
    {groups.map(group => <section key={group}><h3>{group}</h3><div className="permissionGrid">{PERMISSION_DEFINITIONS.filter(item => item.group === group).map(item => <label key={item.key} htmlFor={`access-permission-${item.key}`} title={item.description}><input id={`access-permission-${item.key}`} aria-label={item.label} type="checkbox" checked={permissions.includes(item.key)} onChange={() => togglePermission(item.key)} disabled={readOnly}/><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div></section>)}
  </div>;
}

function defaultModules(role: AccessRole): Module[] {
  if (role === "owner" || role === "admin") return [...MODULES];
  if (role === "operations") return ["home", "orders", "labels", "scan", "trace", "production", "inventory", "delivery"];
  return ["home", "orders", "labels", "trace"];
}

function titleRole(role: AccessRole) {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : role === "operations" ? "Operations" : "Viewer";
}

