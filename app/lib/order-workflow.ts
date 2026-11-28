export type OrderNote = { id:string; text:string; at:string; by:string };
export type RequiredOrderAction = { id:string; typeId:string; name:string; at:string; by:string; completedAt?:string; completedBy?:string; removedAt?:string; removedBy?:string };
export type OrderWorkflow = { notes:OrderNote[]; actions:RequiredOrderAction[]; trackingStatus?:string; statusAt?:string; statusBy?:string };
export type WorkflowCommand = { kind:"status"; id:string; value:string } | { kind:"note"; id:string; text:string } | { kind:"action"; id:string; typeId:string; name:string } | { kind:"complete"; id:string; completed:boolean } | { kind:"remove"; id:string };
export type OrderActionType = { id:string; name:string; deletedAt?:string };
export const DEFAULT_ORDER_ACTIONS:OrderActionType[] = [
  {id:"attach-logo",name:"Attach Logo"},{id:"confirm-design",name:"Confirm Design"},{id:"complete-measurements",name:"Complete Measurements"},{id:"confirm-pricing",name:"Confirm Pricing"},{id:"confirm-delivery",name:"Confirm Delivery"},
];
export function actionName(value:unknown){if(typeof value!=="string")throw Error("Enter an action name.");const name=value.trim().replace(/\s+/g," ");if(!name||name.length>120)throw Error("Use an action name between 1 and 120 characters.");return name;}
export function applyWorkflowCommand(current:OrderWorkflow|undefined,command:WorkflowCommand,actor:string,at:string):OrderWorkflow {
  const workflow:OrderWorkflow={...current,notes:[...(current?.notes||[])],actions:[...(current?.actions||[])]};
  if(!command||typeof command!=="object"||typeof command.id!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(command.id))throw Error("Choose a valid note or action.");
  if(command.kind==="status"){
    if(typeof command.value!=="string"||!command.value.trim()||command.value.length>80)throw Error("Choose a valid tracking status.");
    if(workflow.trackingStatus!==command.value)Object.assign(workflow,{trackingStatus:command.value,statusAt:at,statusBy:actor});
  }else if(command.kind==="note"){
    if(typeof command.text!=="string"||!command.text.trim()||command.text.trim().length>2000)throw Error("Enter a note up to 2,000 characters.");
    const existing=workflow.notes.find(n=>n.id===command.id);if(existing){if(existing.text!==command.text.trim())throw Error("This note reference already has different text.");return workflow;}
    if(workflow.notes.length>=200)throw Error("This order reached its note limit.");
    workflow.notes.push({id:command.id,text:command.text.trim(),by:actor,at});
  }else if(command.kind==="action"){
    const name=actionName(command.name);if(typeof command.typeId!=="string"||!command.typeId||command.typeId.length>100)throw Error("Choose an action type.");
    const existing=workflow.actions.find(a=>a.id===command.id);if(existing){if(existing.typeId!==command.typeId)throw Error("This action reference already has different details.");return workflow;}
    if(workflow.actions.some(a=>!a.removedAt&&!a.completedAt&&a.typeId===command.typeId))throw Error("This action is already selected for this order.");
    if(workflow.actions.length>=500)throw Error("This order reached its action-history limit.");
    workflow.actions.push({id:command.id,typeId:command.typeId,name,at,by:actor});
  }else if(command.kind==="complete"||command.kind==="remove"){
    const item=workflow.actions.find(a=>a.id===command.id);if(!item)throw Error("This action no longer exists.");
    if(command.kind==="remove"){if(!item.removedAt)workflow.actions=workflow.actions.map(a=>a.id===item.id?{...a,removedAt:at,removedBy:actor}:a);}
    else {if(item.removedAt||typeof command.completed!=="boolean")throw Error("Choose an active action and its completion state.");workflow.actions=workflow.actions.map(a=>a.id===item.id?{...a,completedAt:command.completed?(a.completedAt||at):undefined,completedBy:command.completed?(a.completedBy||actor):undefined}:a);}
  }else throw Error("Choose a valid workflow action.");
  return workflow;
}
