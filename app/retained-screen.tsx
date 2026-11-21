"use client";
import { createContext, useEffect, useState, type ReactNode } from 'react';
export const NavigationActive=createContext(true);
/** Preserve the previous screen while another module is open, without background navigation guards. */
export function RetainedScreen({active,children}:{active:boolean;children:ReactNode}){
 const [visited,setVisited]=useState(false);
 useEffect(()=>{if(active)setVisited(true);},[active]);
 if(!active&&!visited)return null;
 return <NavigationActive.Provider value={active}><div hidden={!active} inert={!active} style={!active?{display:'none'}:undefined}>{children}</div></NavigationActive.Provider>;
}
