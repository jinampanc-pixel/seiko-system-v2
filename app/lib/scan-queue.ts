export function mergeScanAcknowledgements<T extends {id:string}>(current:T[],sent:T[],failed:T[]):T[]{
 if(!Array.isArray(current))throw Error("The saved scan queue is unreadable; no queued scans were removed.");
 const failedIds=new Set(failed.map(item=>item.id));
 const acknowledged=new Set(sent.filter(item=>!failedIds.has(item.id)).map(item=>item.id));
 return current.filter(item=>!acknowledged.has(item.id));
}
