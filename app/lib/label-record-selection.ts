/** Inclusive range in the displayed order; hidden records never enter a range. */
export function labelRecordRange(ids:string[], anchor:string|null, target:string, shift:boolean):string[]{
  const end=ids.indexOf(target),start=anchor?ids.indexOf(anchor):-1;
  if(end<0)return [];
  return shift&&start>=0?ids.slice(Math.min(start,end),Math.max(start,end)+1):[target];
}
