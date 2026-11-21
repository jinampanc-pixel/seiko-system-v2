"use client";
import type { MouseEvent } from 'react';
export function rememberSettingsReturn(){sessionStorage.setItem('jinam:standalone-return',JSON.stringify({url:location.pathname+location.search,intent:'settings'}));}
export function AppBackLink({href='/',className='appBackControl'}:{href?:string;className?:string}){
 const back=(event:MouseEvent<HTMLAnchorElement>)=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  try{const saved=JSON.parse(sessionStorage.getItem('jinam:standalone-return')||'null');if(saved?.intent==='settings'&&typeof saved.url==='string'&&saved.url.startsWith('/')&&!saved.url.startsWith('//')){event.preventDefault();sessionStorage.removeItem('jinam:standalone-return');sessionStorage.setItem('jinam:navigation-intent','settings');location.assign(saved.url);return;}}catch{/* The native link remains available. */}
  try{if(document.referrer&&new URL(document.referrer).origin===location.origin&&history.length>1){event.preventDefault();history.back();}}catch{/* Use the safe app fallback. */}
 };
 return <a href={href} className={className} onClick={back}>← Back</a>;
}
