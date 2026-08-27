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
        setStatus(
          response.status === 401 ? "signed-out"
            : response.status === 428 ? "change-password"
              : response.status === 403 ? "no-access"
                : "error",
        );
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

  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  useEffect(() => {
    const syncBusiness = () => {
      const saved = localStorage.getItem("jinam:selected-business") || "";
      if (saved) setBusinessId(saved);
    };
    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches('select[aria-label="Active business"], select[aria-label="Switch business"]')) queueMicrotask(syncBusiness);
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
    return <AccessGate status={status} message={message} onRetry={refresh}/>;
  }

  return <AccessContext.Provider value={value}>
    {children}
    {menuHost && createPortal(<button type="button" className="nav accessMenuEntry" onClick={() => setPanelOpen(true)}><span>◉</span><small>{can("users.manage") ? "Users & access" : "My access"}</small></button>, menuHost)}
    {panelOpen && <AccessPanel onClose={() => setPanelOpen(false)}/>} 
  </AccessContext.Provider>;
}

function AccessGate({ status, message, onRetry }: { status: AccessStatus; message: string; onRetry: () => Promise<void> }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const signIn = async () => {
    setBusy(true); setFormError("");
    try {
      const response = await fetch("/api/erp/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!result.ok) throw new Error(result.message || "Sign in failed.");
      await onRetry();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) { setFormError("Passwords do not match."); return; }
    setBusy(true); setFormError("");
    try {
      const response = await fetch("/api/erp/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!result.ok) throw new Error(result.message || "Password could not be changed.");
      await onRetry();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Password could not be changed.");
    } finally { setBusy(false); }
  };

  const heading = status === "signed-out" ? "Sign in to your ERP"
    : status === "change-password" ? "Create your private password"
      : status === "no-access" ? "Access not assigned"
        : status === "error" ? "Access check unavailable"
          : "Verifying access";

  return <div className="accessGate" role="main">
    <div className="accessGateCard">
      <div className="accessGateMark">J</div>
      <p className="eyebrow">SECURE ERP ACCESS</p>
      <h1>{heading}</h1>
      <p>{message}</p>

      {status === "signed-out" && <form className="erpLoginForm" onSubmit={event => { event.preventDefault(); void signIn(); }}>
        <label><span>Email or phone</span><input autoComplete="username" value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Email or mobile number" autoFocus/></label>
        <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Password"/></label>
        {formError && <div className="accessError" role="alert">{formError}</div>}
        <button className="primary" type="submit" disabled={busy || !identifier.trim() || !password}>{busy ? "Signing in…" : "Sign in"}</button>
        <small className="accessLoginHelp">Your administrator creates your account and initial password. Users not listed in the ERP cannot sign in.</small>
      </form>}

      {status === "change-password" && <form className="erpLoginForm" onSubmit={event => { event.preventDefault(); void changePassword(); }}>
        <label><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="At least 12 characters" autoFocus/></label>
        <label><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Repeat your password"/></label>
        {formError && <div className="accessError" role="alert">{formError}</div>}
        <button className="primary" type="submit" disabled={busy || newPassword.length < 12 || !confirmPassword}>{busy ? "Saving…" : "Set password & continue"}</button>
        <small className="accessLoginHelp">This replaces the temporary password your administrator gave you.</small>
      </form>}

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

  useEffect(() => { if (tab === "users") queueMicrotask(() => void loadUsers()); }, [tab, loadUsers]);

  const permissions = permissionsForRole(membership?.role || "viewer", membership?.permissions);
  const businessName = membership?.businessName || businessId;

  const signOut = async (all = false) => {
    await fetch("/api/erp/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all }) });
    window.location.reload();
  };

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
        <div className="accessSessionActions"><button className="secondary" onClick={() => void signOut(false)}>Sign out</button><button className="secondary" onClick={() => void signOut(true)}>Sign out all devices</button></div>
      </div>}

      {tab === "users" && can("users.manage") && <div className="accessPanelBody">
        <div className="accessUsersToolbar"><div><h3>Users</h3><p>One place to control identity, login and everything each person can see and do.</p></div><button className="primary" onClick={() => setEditing("new")}>+ Add user</button></div>
        {error && <div className="accessError">{error}</div>}
        {loadingUsers ? <p>Loading users…</p> : <div className="accessUserList">{users.map(user => <button key={user.email} className={`accessUserRow ${user.active ? "" : "inactive"}`} onClick={() => setEditing(user)}>
          <span className="accessAvatar">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</span>
          <span><strong>{user.displayName || user.email}</strong><small>{user.email}{user.phone ? ` · ${user.phone}` : ""}</small><small className={user.hasCredentials ? "credentialReady" : "credentialMissing"}>{user.hasCredentials ? (user.mustChangePassword ? "Temporary password set" : "Login ready") : "Login not configured"}</small></span>
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
  const [phone, setPhone] = useState(user?.phone || "");
  const [temporaryPassword, setTemporaryPassword] = useState("");
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

  const generateTemporaryPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    setTemporaryPassword(Array.from(bytes, value => alphabet[value % alphabet.length]).join(""));
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/erp/memberships", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "upsert", businessId, membership: { email, displayName, phone, temporaryPassword: temporaryPassword || undefined, role, modules, permissions, active } }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!result.ok) throw new Error(result.message || "Access could not be saved.");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Access could not be saved."); }
    finally { setSaving(false); }
  };

  const requiresInitialPassword = !user;
  return <div className="membershipEditorBackdrop"><div className="membershipEditor">
    <div className="membershipEditorHead"><div><p className="eyebrow">{user ? "EDIT USER" : "NEW USER"}</p><h3>{user ? user.displayName || user.email : "Add user"}</h3></div><button className="iconButton" onClick={onCancel} aria-label="Close user editor">×</button></div>
    {error && <div className="accessError">{error}</div>}
    <div className="membershipIdentityGrid">
      <label><span>Name</span><input aria-label="User name" value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={ownerLocked}/></label>
      <label><span>Email</span><input aria-label="User email" type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} disabled={Boolean(user) || ownerLocked}/></label>
      <label><span>Phone</span><input aria-label="User phone" inputMode="tel" autoComplete="off" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+91… or 10-digit mobile" disabled={ownerLocked}/></label>
      <label><span>Role preset</span><select aria-label="Role preset" value={role} onChange={event => applyRole(event.target.value as AccessRole)} disabled={ownerLocked}>{(["owner","admin","operations","viewer"] as AccessRole[]).filter(item => item !== "owner" || actorRole === "owner").map(item => <option key={item} value={item}>{titleRole(item)}</option>)}</select></label>
      <label className="membershipCredential"><span>{requiresInitialPassword ? "Temporary password *" : "Reset password (optional)"}</span><div className="credentialInputRow"><input aria-label="Temporary password" type="text" autoComplete="off" value={temporaryPassword} onChange={event => setTemporaryPassword(event.target.value)} placeholder={requiresInitialPassword ? "At least 12 characters" : "Leave blank to keep current password"} disabled={ownerLocked}/><button type="button" className="secondary" onClick={generateTemporaryPassword} disabled={ownerLocked}>Generate</button></div><small>{user?.hasCredentials ? (user.mustChangePassword ? "User must change the temporary password at next login." : "Entering a value here resets the password and signs the user out everywhere.") : "No ERP login has been configured for this user yet."}</small></label>
      <label className="membershipActive"><input aria-label="Active access" type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} disabled={ownerLocked || (user?.email === currentUser && user?.role === "owner")}/><span>Active access</span></label>
    </div>
    {user?.lastLoginAt && <p className="credentialLastLogin">Last ERP login: {new Date(user.lastLoginAt).toLocaleString()}</p>}
    <AccessMatrix modules={modules} permissions={permissions} onModules={setModules} onPermissions={setPermissions} readOnly={ownerLocked || role === "owner"}/>
    <div className="membershipEditorActions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={() => void save()} disabled={saving || ownerLocked || !email.trim() || (requiresInitialPassword && temporaryPassword.length < 12)}>{saving ? "Saving…" : user ? "Save access" : "Create user"}</button></div>
  </div></div>;
}

function AccessMatrix({ modules, permissions, onModules, onPermissions, readOnly = false }: {
  modules: Module[]; permissions: Permission[]; onModules?: (value: Module[]) => void; onPermissions?: (value: Permission[]) => void; readOnly?: boolean;
}) {
  const groups = ["Orders", "Finance", "Labels", "Operations", "Administration"] as const;
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
