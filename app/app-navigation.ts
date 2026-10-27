"use client";
import { useCallback, useEffect, useReducer } from 'react';
import type { Module } from './lib/foundation';
let navigationDepth=0;
export function requestAppNavigation(action:()=>void){if(navigationDepth||typeof window==='undefined'){action();return;}if(!window.dispatchEvent(new Event('jinam:before-navigation',{cancelable:true})))return;navigationDepth++;try{action();}finally{navigationDepth--;}}
export function useUnsavedNavigation(dirty:boolean,message='Leave without saving these changes?'){
 useEffect(()=>{if(!dirty)return;const leave=(event:Event)=>{if(event.defaultPrevented||!window.confirm(message))event.preventDefault();};const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('jinam:before-navigation',leave);window.addEventListener('beforeunload',unload);return()=>{window.removeEventListener('jinam:before-navigation',leave);window.removeEventListener('beforeunload',unload);};},[dirty,message]);
}
type State={current:Module;history:Module[]};
export function moduleNavigation(state:State,action:{type:'open'|'back'|'reset'|'replace';module?:Module}):State{
 if(action.type==='reset')return {current:action.module||'home',history:[]};
 if(action.type==='replace')return {...state,current:action.module||'home'};
 if(action.type==='back')return {current:state.history.at(-1)||'home',history:state.history.slice(0,-1)};
 if(!action.module||action.module===state.current)return state;
 return {current:action.module,history:[...state.history,state.current].slice(-30)};
}
export function useModuleNavigation(){
 const [state,dispatch]=useReducer(moduleNavigation,{current:'home',history:[]});
 const open=useCallback((module:Module,options?:{preserveDraft?:boolean})=>{const change=()=>dispatch({type:options?.preserveDraft?'replace':'open',module});if(options?.preserveDraft)change();else requestAppNavigation(change);},[]);
 const back=useCallback(()=>requestAppNavigation(()=>dispatch({type:'back'})),[]);
 const reset=useCallback(()=>dispatch({type:'reset'}),[]);
 const name=(module:Module)=>module.charAt(0).toUpperCase()+module.slice(1);
 return {module:state.current,setModule:open,back,reset,restore:(module:Module)=>dispatch({type:'replace',module}),backLabel:'← Back to '+name(state.history.at(-1)||'home')};
}
