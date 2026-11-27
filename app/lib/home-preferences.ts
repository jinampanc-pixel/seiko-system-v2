export type MetricKey = "active" | "completed" | "sync";
export type QuickAccessKey = "Production" | "Labels" | "Scan station" | "Trace";
export type HomeFocus = "all" | "entries" | "due";
export type HomeAction = "new" | "payment" | "invoice" | "challan" | "quotation" | "labels";
export const HOME_ACTIONS: Array<{id:HomeAction;label:string}> = [{id:"new",label:"+ New Order"},{id:"payment",label:"Record Payment"},{id:"invoice",label:"Create Invoice"},{id:"challan",label:"Delivery Challan"},{id:"quotation",label:"Quotation"},{id:"labels",label:"Packing Labels"}];
export type HomeConfig = {
  orderViews: Record<HomeFocus,boolean>; defaultFocus: HomeFocus; actions: HomeAction[]; activeOrderPageSize: 5|10|20;
  quickAccess: Record<QuickAccessKey,boolean>; quickAccessOrder: QuickAccessKey[];
  sections: {metrics:boolean;actions:boolean;quickAccess:boolean};
  hideEmptySync: boolean; sort: "updated"|"delivery"|"client";
};
export const HOME_KEY="jinam:seiko:home-config-v3";
export const HOME_CHANGED="seiko:home-preferences-changed";
export const QUICK_ACCESS:QuickAccessKey[]=["Production","Labels","Scan station","Trace"];
export const DEFAULT_HOME:HomeConfig={orderViews:{all:true,entries:true,due:true},defaultFocus:"all",actions:["new","payment","invoice","labels"],activeOrderPageSize:5,quickAccess:{Production:true,Labels:true,"Scan station":true,Trace:true},quickAccessOrder:QUICK_ACCESS,sections:{metrics:true,actions:true,quickAccess:true},hideEmptySync:true,sort:"updated"};
export function homeStartingFocus(config:HomeConfig):HomeFocus {return config.orderViews[config.defaultFocus]?config.defaultFocus:(["all","entries","due"] as const).find(key=>config.orderViews[key])||"all";}
export function readHomeConfig():HomeConfig {
  try {
    const saved=JSON.parse(localStorage.getItem(HOME_KEY)||"null") as Partial<HomeConfig>|null;
    if(!saved)return structuredClone(DEFAULT_HOME);
    const actions=Array.isArray(saved.actions)?[...new Set(saved.actions.filter(id=>HOME_ACTIONS.some(item=>item.id===id)))]:DEFAULT_HOME.actions;
    const order=Array.isArray(saved.quickAccessOrder)?saved.quickAccessOrder.filter(key=>QUICK_ACCESS.includes(key)):[];
    const config:HomeConfig={...DEFAULT_HOME,...saved,orderViews:Object.fromEntries((["all","entries","due"] as const).map(key=>[key,typeof saved.orderViews?.[key]==="boolean"?saved.orderViews[key]:true])) as HomeConfig["orderViews"],defaultFocus:["all","entries","due"].includes(saved.defaultFocus||"")?saved.defaultFocus!:"all",actions,
      activeOrderPageSize:[5,10,20].includes(Number(saved.activeOrderPageSize))?saved.activeOrderPageSize!:5,
      quickAccess:Object.fromEntries(QUICK_ACCESS.map(key=>[key,saved.quickAccess?.[key]??true])) as HomeConfig["quickAccess"],
      quickAccessOrder:[...new Set([...order,...QUICK_ACCESS])],sections:{...DEFAULT_HOME.sections,...saved.sections},
      sort:["updated","delivery","client"].includes(saved.sort||"")?saved.sort!:"updated"};
    return {...config,defaultFocus:homeStartingFocus(config)};
  }catch{return structuredClone(DEFAULT_HOME);}
}
export function saveHomeConfig(config:HomeConfig){localStorage.setItem(HOME_KEY,JSON.stringify(config));window.dispatchEvent(new Event(HOME_CHANGED));}
export function homeModuleKey(title:string):QuickAccessKey|undefined {
  return QUICK_ACCESS.find(key=>key.toLowerCase()===title.toLowerCase()||key==="Scan station"&&/^scan$/i.test(title));
}
export function applyHomeModules(config:HomeConfig){
  document.querySelectorAll<HTMLElement>(".overview>.moduleGrid").forEach(grid=>{
    let visible=0;
    grid.querySelectorAll<HTMLElement>(".moduleCard").forEach(card=>{
      const key=homeModuleKey(card.querySelector("h3")?.textContent?.trim()||"");
      const hide=!config.sections.quickAccess||!key||!config.quickAccess[key];
      if(card.hidden!==hide)card.hidden=hide;
      if(!hide)visible++;
      const order=String(key?config.quickAccessOrder.indexOf(key)+1:10);if(card.style.order!==order)card.style.order=order;
    });
    if(grid.hidden!==(visible===0))grid.hidden=visible===0;
  });
}
