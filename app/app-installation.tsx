"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import {requestAppNavigation} from "./app-navigation";
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
type InstallState={prompt:InstallPrompt|null;installed:boolean};
const initial:InstallState={prompt:null,installed:false};let state=initial;
const listeners=new Set<()=>void>();
function update(value:Partial<InstallState>){state={...state,...value};listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function AppInstallationRuntime(){
 useEffect(()=>{
  const mode=window.matchMedia("(display-mode: standalone)");
  const modeChanged=()=>update({installed:mode.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone)});
  const available=(event:Event)=>{event.preventDefault();update({prompt:event as InstallPrompt});};
  const installed=()=>update({prompt:null,installed:true});
  modeChanged();window.addEventListener("beforeinstallprompt",available);window.addEventListener("appinstalled",installed);mode.addEventListener("change",modeChanged);
  return()=>{window.removeEventListener("beforeinstallprompt",available);window.removeEventListener("appinstalled",installed);mode.removeEventListener("change",modeChanged);};
 },[]);return null;
}
export function AppInstallationSettings(){
 const current=useSyncExternalStore(subscribe,()=>state,()=>initial);
 const [message,setMessage]=useState(""),[help,setHelp]=useState(false),[busy,setBusy]=useState(false);
 async function install(){
  if(!current.prompt){setHelp(true);return;}
  setBusy(true);setMessage("");const prompt=current.prompt;update({prompt:null});
  try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==="dismissed")setMessage("Installation Cancelled");}catch{setHelp(true);setMessage("Use the browser’s Install App option.");}finally{setBusy(false);}
 }
 async function reload(){
  if(!navigator.onLine){setMessage("Connect to the Internet to Load the Latest Version");return;}
  setBusy(true);setMessage("");
  try{if("serviceWorker" in navigator){const registration=await navigator.serviceWorker.getRegistration();await registration?.update();}requestAppNavigation(()=>window.location.reload());}catch{setMessage("Update Check Failed. Your Current App Remains Open.");}finally{setBusy(false);}
 }
 return <section className="settingsUsersModule appInstallationSettings"><h3>App &amp; Updates</h3><img src="/app-icon-192.png?v=6" width="64" height="64" alt="SEIKO TAILORS Collar"/><h4>SEIKO TAILORS</h4><span>{current.installed?"Installed App":"Web Browser"}</span><div className="themeActions" style={{flexWrap:"wrap",justifyContent:"flex-start"}}>{!current.installed&&<button type="button" className="primary" disabled={busy} onClick={()=>void install()}>Install App</button>}<button type="button" className="secondary" disabled={busy} onClick={()=>void reload()}>Reload Latest Version</button><button type="button" className="secondary" onClick={()=>setHelp(value=>!value)}>Installation Help</button></div>{message&&<p role="status">{message}</p>}{help&&<div className="appInstallationHelp"><p>In Chrome or Edge, use Install App from the address bar or browser menu. If it is already installed, use Open in App from the address bar. On iPhone or iPad, use Safari → Share → Add to Home Screen.</p><p>The installed app and the Cloudflare link use the same account, records and releases. Reopen or reload while online to load the latest release.</p><p>If the installed name or icon is still old, open its three-dot menu and choose Review App Update when Chrome offers it.</p></div>}</section>;
}
