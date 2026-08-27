"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MODULES, type BusinessMembership, type FoundationBootstrap, type Module } from "./lib/foundation";
import { PERMISSION_DEFINITIONS, ROLE_PERMISSION_PRESETS, permissionsForRole, type AccessRole, type Permission } from "./lib/access-control";

type SessionState = {
  user: FoundationBootstrap["user"];
  businesses: BusinessMembership[];
};

type ManagedUser = {
  email: string;
  displayName: string;
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

const AccessContext = createContext<AccessContextValue | null>(null);

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess must be used inside AccessProvider.");
  return value;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "no-access" | "error">("loading");
  const [message, setMessage] = useState("Checking secure access…");
  const [businessId, setBusinessId] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/erp/session", { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; code?: string; message?: string; data?: SessionState };
      if (!result.ok || !result.data) {
        setSession(null);
        setMessage(result.message || "Access could not be verified.");
        setStatus(response.status === 401 ? "signed-out" : response.status === 403 ? "no-access" : "error");
        return;
      }
      setSession(result.data);
      const saved = localStorage.getItem("jinam:selected-business") || "";
      const nextBusiness = result.data.businesses.some(item => item.businessId === saved) ? saved : result.data.businesses[0]?.businessId || "";
      if (nextBusiness) localStorage.setItem("jinam:selected-business", nextBusiness);
      setBusinessId(nextBusiness);
      setStatus("ready");
    } catch {
      setMessage("The secure session service is temporarily unavailable.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const syncBusiness = () => {
      const saved = localStorage.getItem("jinam:selected-business") || "";
      if (saved) setBusinessId(saved);
    };
    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches('select[aria-label="Active business"], select[aria-label="Switch business"]')) {
        queueMicrotask(syncBusiness);
      }
    };
    window.addEventListener("storage", syncBusiness);
    document.addEventListener("change", onChange, true);
    return () => {
      window.removeEventListener("storage", syncBusiness);
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const host = document.querySelector<HTMLElement>(".moduleMenu");
      setMenuHost(current => current === host ? current : host);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);

  const membership = session?.businesses.find(item => item.businessId === businessId) || session?.businesses[0];
  const can = useCallback((permission: Permission) => Boolean(membership && permissionsForRole(membership.role, membership.permissions).includes(permission)), [membership]);
  const value = useMemo<AccessContextValue>(() => ({ session, businessId: membership?.businessId || businessId, membership, can, refresh }), [session, businessId, membership, can, refresh]);

  if (status !== "ready" || !session || !membership) {
    return <>
      <AccessGate status={status} message={message} onRetry={refresh}/>
      <div className="accessProtectedContent" aria-hidden="true">{children}</div>
    </>;
  }

  return <AccessContext.Provider value={value}>
    {children}
    {menuHost && createPortal(<button type="button" className="nav accessMenuEntry" onClick={() => setPanelOpen(true)}><span>◉</span><small>{can("users.manage") ? "Users & access" : "My access"}</small></button>, menuHost)}
    {panelOpen && <AccessPanel onClose={() => setPanelOpen(false)}/>} 
  </AccessContext.Provider>;
}

function AccessGate({ status, message, onRetry }: { status: string; message: string; onRetry: () => Promise<void> }) {
  return <div className="accessGate" role="status">
    <div className="accessGateCard">
      <div className="accessGateMark">J</div>
      <p className="eyebrow">SECURE ERP ACCESS</p>
      <h1>{status === "signed-out" ? "Sign in required" : status === "no-access" ? "Access not assigned" : status === "error" ? "Access check unavailable" : "Verifying access"}</h1>
      <p>{message}</p>
      {status === "signed-out" && <button className="primary" onClick={() => window.location.reload()}>Sign in</button>}
      {(status === "error" || status === "no-access") && <button className="secondary" onClick={() => void onRetry()}>Retry</button>}
    </div>
  </div>;
}

function AccessPanel({ onClose }: { onClose: () => void }) {
  const { session, businessId, membership, can, refresh } = useAccess();
  const [tab, setTab] = useState<"mine" | "users">(can("users.manage") ? "users" : "mine");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    if (!can("users.manage")) return;
    setLoadingUsers(true); setError("");
    try {
      const response = await fetch("/api/erp/memberships", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "list", businessId }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; data?: { users?: ManagedUser[] } };
      if (!result.ok) throw new Error(result.message || "Users could not be loaded.");
      setUsers(result.data?.users || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Users could not be loaded."); }
    finally { setLoadingUsers(false); }
  }, [businessId, can]);

  useEffect(() => { if (tab === "users") void loadUsers(); }, [tab, loadUsers]);

  const permissions = permissionsForRole(membership?.role || "viewer", membership?.permissions);
  const businessName = membership?.businessName || businessId;

  return <div className="accessPanelBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="accessPanel" role="dialog" aria-modal="true" aria-label="Account and access">
      <header className="accessPanelHeader">
        <div><p className="eyebrow">{businessName.toUpperCase()}</p><h2>Account & access</h2><p>{session?.user.displayName} · {session?.user.email}</p></div>
        <button className="iconButton" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="accessTabs">
        <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>My access</button>
        {can("users.manage") && <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Users & access</button>}
      </div>

      {tab === "mine" && <div className="accessPanelBody">
        <div className="accessSummary"><div><small>Role</small><strong>{titleRole(membership?.role || "viewer")}</strong></div><div><small>Business</small><strong>{businessName}</strong></div></div>
        <AccessMatrix modules={membership?.modules || []} permissions={permissions} readOnly/>
        <button className="secondary accessSignOut" onClick={() => window.location.assign("/cdn-cgi/access/logout")}>Sign out</button>
      </div>}

      {tab === "users" && can("users.manage") && <div className="accessPanelBody">
        <div className="accessUsersToolbar"><div><h3>Users</h3><p>One place to control what each person can see and do.</p></div><button className="primary" onClick={() => setEditing("new")}>+ Add user</button></div>
        {error && <div className="accessError">{error}</div>}
        {loadingUsers ? <p>Loading users…</p> : <div className="accessUserList">{users.map(user => <button key={user.email} className={`accessUserRow ${user.active ? "" : "inactive"}`} onClick={() => setEditing(user)}>
          <span className="accessAvatar">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</span>
          <span><strong>{user.displayName || user.email}</strong><small>{user.email}</small></span>
          <span className="accessRoleBadge">{titleRole(user.role)}</span><span className="accessRowChevron">›</span>
        </button>)}</div>}
        {editing && <MembershipEditor businessId={businessId} currentUser={session?.user.email || ""} actorRole={membership?.role || "viewer"} user={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await loadUsers(); await refresh(); }}/>} 
      </div>}
    </section>
  </div>;
}

function MembershipEditor({ businessId, currentUser, actorRole, user, onCancel, onSaved }: {
  businessId: string; currentUser: string; actorRole: AccessRole; user: ManagedUser | null; onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const initialRole = user?.role || "operations";
  const [email, setEmail] = useState(user?.email || "");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [role, setRole] = useState<AccessRole>(initialRole);
  const [modules, setModules] = useState<Module[]>(user?.modules?.length ? user.modules : defaultModules(initialRole));
  const [permissions, setPermissions] = useState<Permission[]>(user?.permissions?.length ? user.permissions : [...ROLE_PERMISSION_PRESETS[initialRole]]);
  const [active, setActive] = useState(user?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ownerLocked = user?.role === "owner" && actorRole !== "owner";

  const applyRole = (nextRole: AccessRole) => {
    setRole(nextRole);
    setModules(defaultModules(nextRole));
    setPermissions([...ROLE_PERMISSION_PRESETS[nextRole]]);
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/erp/memberships", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "upsert", businessId, membership: { email, displayName, role, modules, permissions, active } }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!result.ok) throw new Error(result.message || "Access could not be saved.");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Access could not be saved."); }
    finally { setSaving(false); }
  };

  return <div className="membershipEditorBackdrop"><div className="membershipEditor">
    <div className="membershipEditorHead"><div><p className="eyebrow">{user ? "EDIT USER" : "NEW USER"}</p><h3>{user ? user.displayName || user.email : "Add user"}</h3></div><button className="iconButton" onClick={onCancel}>×</button></div>
    {error && <div className="accessError">{error}</div>}
    <div className="membershipIdentityGrid">
      <label><span>Name</span><input value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={ownerLocked}/></label>
      <label><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={Boolean(user) || ownerLocked}/></label>
      <label><span>Role preset</span><select value={role} onChange={event => applyRole(event.target.value as AccessRole)} disabled={ownerLocked}>{(["owner","admin","operations","viewer"] as AccessRole[]).filter(item => item !== "owner" || actorRole === "owner").map(item => <option key={item} value={item}>{titleRole(item)}</option>)}</select></label>
      <label className="membershipActive"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} disabled={ownerLocked || (user?.email === currentUser && user?.role === "owner")}/><span>Active access</span></label>
    </div>
    <AccessMatrix modules={modules} permissions={permissions} onModules={setModules} onPermissions={setPermissions} readOnly={ownerLocked || role === "owner"}/>
    <div className="membershipEditorActions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={() => void save()} disabled={saving || ownerLocked || !email.trim()}>{saving ? "Saving…" : "Save access"}</button></div>
  </div></div>;
}

function AccessMatrix({ modules, permissions, onModules, onPermissions, readOnly = false }: {
  modules: Module[]; permissions: Permission[]; onModules?: (value: Module[]) => void; onPermissions?: (value: Permission[]) => void; readOnly?: boolean;
}) {
  const groups = ["Orders", "Finance", "Labels", "Operations", "Administration"] as const;
  const toggleModule = (module: Module) => onModules?.(modules.includes(module) ? modules.filter(item => item !== module) : [...modules, module]);
  const togglePermission = (permission: Permission) => onPermissions?.(permissions.includes(permission) ? permissions.filter(item => item !== permission) : [...permissions, permission]);
  return <div className={`accessMatrix ${readOnly ? "readOnly" : ""}`}>
    <section><h3>Modules</h3><p>Controls which parts of the system appear for this user.</p><div className="accessModuleGrid">{MODULES.filter(item => item !== "admin").map(module => <label key={module}><input type="checkbox" checked={modules.includes(module)} onChange={() => toggleModule(module)} disabled={readOnly}/><span>{module === "home" ? "Home" : module[0].toUpperCase() + module.slice(1)}</span></label>)}</div></section>
    {groups.map(group => <section key={group}><h3>{group}</h3><div className="permissionGrid">{PERMISSION_DEFINITIONS.filter(item => item.group === group).map(item => <label key={item.key} title={item.description}><input type="checkbox" checked={permissions.includes(item.key)} onChange={() => togglePermission(item.key)} disabled={readOnly}/><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div></section>)}
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
