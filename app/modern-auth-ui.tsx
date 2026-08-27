"use client";

import { useCallback, useEffect, useState } from "react";

type MethodsData = {
  available: { google: boolean; apple: boolean; passkey: boolean };
  authenticated: boolean;
  linked: Array<{ provider: string; email: string | null; createdAt: string; lastUsedAt: string | null }>;
  passkeys: Array<{ id: string; label: string; createdAt: string; lastUsedAt: string | null }>;
  hasPassword: boolean;
};

type PublicKeyCreateData = {
  challengeId: string;
  publicKey: {
    challenge: string;
    rp: PublicKeyCredentialRpEntity;
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: PublicKeyCredentialParameters[];
    timeout?: number;
    attestation?: AttestationConveyancePreference;
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    excludeCredentials?: Array<{ type: "public-key"; id: string }>;
  };
};

type PublicKeyGetData = {
  challengeId: string;
  publicKey: {
    challenge: string;
    rpId: string;
    timeout?: number;
    userVerification?: UserVerificationRequirement;
  };
};

export function ModernLoginOptions({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [methods, setMethods] = useState<MethodsData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get("auth_message");
    if (message) {
      setError(message);
      params.delete("auth_error"); params.delete("auth_message");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    void fetchMethods().then(setMethods).catch(() => undefined);
  }, []);

  const passkeyLogin = async () => {
    setBusy("passkey"); setError("");
    try {
      requireWebAuthn();
      const response = await postJson<{ challengeId: string; publicKey: PublicKeyGetData["publicKey"] }>("/api/erp/auth/passkey/login/options", {});
      const credential = await navigator.credentials.get({ publicKey: {
        ...response.publicKey,
        challenge: base64UrlToBuffer(response.publicKey.challenge),
      } }) as PublicKeyCredential | null;
      if (!credential) throw new Error("No passkey was selected.");
      await postJson("/api/erp/auth/passkey/login/verify", { challengeId: response.challengeId, credential: authenticationCredentialToJSON(credential) });
      await onSignedIn();
    } catch (cause) { setError(authMessage(cause)); }
    finally { setBusy(""); }
  };

  if (!methods) return null;
  const passkeySupported = methods.available.passkey && typeof window !== "undefined" && "PublicKeyCredential" in window;
  if (!methods.available.google && !methods.available.apple && !passkeySupported) return null;

  return <div className="modernLoginOptions">
    <div className="authDivider"><span>or</span></div>
    <div className="federatedButtons">
      {methods.available.google && <button type="button" className="federatedButton google" onClick={() => window.location.assign("/api/erp/auth/oauth/google/start")}><span aria-hidden="true">G</span>Continue with Google</button>}
      {methods.available.apple && <button type="button" className="federatedButton apple" onClick={() => window.location.assign("/api/erp/auth/oauth/apple/start")}><span aria-hidden="true">●</span>Continue with Apple</button>}
      {passkeySupported && <button type="button" className="federatedButton passkey" disabled={busy === "passkey"} onClick={() => void passkeyLogin()}><span aria-hidden="true">⌁</span>{busy === "passkey" ? "Checking passkey…" : "Use a passkey"}</button>}
    </div>
    {error && <div className="accessError" role="alert">{error}</div>}
  </div>;
}

export function ModernAccountMethods() {
  const [methods, setMethods] = useState<MethodsData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try { setMethods(await fetchMethods()); }
    catch (cause) { setError(authMessage(cause)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const addPasskey = async () => {
    setBusy("passkey"); setError("");
    try {
      requireWebAuthn();
      const response = await postJson<PublicKeyCreateData>("/api/erp/auth/passkey/register/options", {});
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...response.publicKey,
        challenge: base64UrlToBuffer(response.publicKey.challenge),
        user: { ...response.publicKey.user, id: base64UrlToBuffer(response.publicKey.user.id) },
        excludeCredentials: (response.publicKey.excludeCredentials || []).map(item => ({ ...item, id: base64UrlToBuffer(item.id) })),
      };
      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
      if (!credential) throw new Error("Passkey creation was cancelled.");
      await postJson("/api/erp/auth/passkey/register/verify", { challengeId: response.challengeId, credential: registrationCredentialToJSON(credential), label: passkeyLabel() });
      await refresh();
    } catch (cause) { setError(authMessage(cause)); }
    finally { setBusy(""); }
  };

  const removeProvider = async (provider: "google" | "apple") => {
    setBusy(provider); setError("");
    try { await postJson("/api/erp/auth/methods", { operation: "unlink", provider }); await refresh(); }
    catch (cause) { setError(authMessage(cause)); }
    finally { setBusy(""); }
  };

  const removePasskey = async (id: string) => {
    setBusy(id); setError("");
    try { await postJson("/api/erp/auth/methods", { operation: "remove-passkey", passkeyId: id }); await refresh(); }
    catch (cause) { setError(authMessage(cause)); }
    finally { setBusy(""); }
  };

  if (!methods) return <section className="signInMethodsCard"><h3>Sign-in methods</h3><p>Loading sign-in methods…</p></section>;
  const google = methods.linked.find(item => item.provider === "google");
  const apple = methods.linked.find(item => item.provider === "apple");
  const passkeySupported = methods.available.passkey && typeof window !== "undefined" && "PublicKeyCredential" in window;

  return <section className="signInMethodsCard">
    <div className="signInMethodsHead"><div><h3>Sign-in methods</h3><p>Use any linked method to sign in. ERP permissions still come from your administrator.</p></div></div>
    {error && <div className="accessError" role="alert">{error}</div>}
    <div className="signInMethodList">
      <div className="signInMethodRow"><span className="methodIcon">•••</span><span><strong>Password</strong><small>{methods.hasPassword ? "Available for email or phone login" : "No password currently set"}</small></span><span className={`methodStatus ${methods.hasPassword ? "linked" : ""}`}>{methods.hasPassword ? "Ready" : "Not set"}</span></div>
      {methods.available.google && <div className="signInMethodRow"><span className="methodIcon">G</span><span><strong>Google</strong><small>{google ? google.email || "Linked Google Account" : "Use a verified Google Account"}</small></span>{google ? <button className="secondary compact" disabled={busy === "google"} onClick={() => void removeProvider("google")}>Remove</button> : <button className="secondary compact" onClick={() => window.location.assign("/api/erp/auth/oauth/google/start?mode=link")}>Link</button>}</div>}
      {methods.available.apple && <div className="signInMethodRow"><span className="methodIcon">●</span><span><strong>Apple</strong><small>{apple ? apple.email || "Linked Apple Account" : "Link once before using Apple to sign in"}</small></span>{apple ? <button className="secondary compact" disabled={busy === "apple"} onClick={() => void removeProvider("apple")}>Remove</button> : <button className="secondary compact" onClick={() => window.location.assign("/api/erp/auth/oauth/apple/start?mode=link")}>Link</button>}</div>}
      {methods.passkeys.map(item => <div className="signInMethodRow" key={item.id}><span className="methodIcon">⌁</span><span><strong>{item.label}</strong><small>Passkey · added {formatDate(item.createdAt)}</small></span><button className="secondary compact" disabled={busy === item.id} onClick={() => void removePasskey(item.id)}>Remove</button></div>)}
    </div>
    {passkeySupported && <button type="button" className="secondary addPasskeyButton" disabled={busy === "passkey"} onClick={() => void addPasskey()}>{busy === "passkey" ? "Adding passkey…" : "+ Add passkey"}</button>}
  </section>;
}

async function fetchMethods() {
  const response = await fetch("/api/erp/auth/methods", { cache: "no-store" });
  const result = await response.json() as { ok?: boolean; message?: string; data?: MethodsData };
  if (!response.ok || !result.ok || !result.data) throw new Error(result.message || "Sign-in methods could not be loaded.");
  return result.data;
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { ok?: boolean; message?: string; data?: T };
  if (!response.ok || !result.ok) throw new Error(result.message || "The sign-in request failed.");
  return result.data as T;
}

function requireWebAuthn() {
  if (!("PublicKeyCredential" in window) || !navigator.credentials) throw new Error("Passkeys are not supported by this browser or device.");
}

function registrationCredentialToJSON(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return { id: credential.id, rawId: bufferToBase64Url(credential.rawId), type: credential.type, response: { clientDataJSON: bufferToBase64Url(response.clientDataJSON), attestationObject: bufferToBase64Url(response.attestationObject) } };
}

function authenticationCredentialToJSON(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return { id: credential.id, rawId: bufferToBase64Url(credential.rawId), type: credential.type, response: { clientDataJSON: bufferToBase64Url(response.clientDataJSON), authenticatorData: bufferToBase64Url(response.authenticatorData), signature: bufferToBase64Url(response.signature), userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null } };
}

function base64UrlToBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64Url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value); let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function passkeyLabel() {
  const platform = navigator.platform || "Device";
  return `${platform} passkey`.slice(0, 80);
}
function formatDate(value: string) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); } catch { return value; } }
function authMessage(cause: unknown) { return cause instanceof Error ? cause.message : "The sign-in request failed."; }
