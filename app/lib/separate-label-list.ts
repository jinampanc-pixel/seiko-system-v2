import type { SeikoOrder, OrderRecord, ProductPolicy, MeasurementPolicy } from "./order-domain";

/** A label-only snapshot; never written to the order or its Google Sheet. */
export function separateLabelOrder(base:SeikoOrder,input:string):SeikoOrder {
 const lines=input.split(/\r?\n/).filter(line=>line.trim());
 if(!lines.length||lines.length>5000)throw Error('Enter between 1 and 5,000 garment lines.');
 const products=new Map<string,ProductPolicy>(),measurements:MeasurementPolicy[]=[],records=new Map<string,OrderRecord>();
 for(const [index,line] of lines.entries()){
  const parts=line.split('|').map(part=>part.trim());
  const [name,group,productName,size,qty,waist='']=parts;
  const fail=()=>{throw Error(`Line ${index+1}: use Name | Class / group | Product | Size (or Pending) | Qty | Waist (optional).`);};
  if(parts.length<5||parts.length>6||!name||!group||!productName||!size||parts.some(part=>part.length>200)||!/^\d+$/.test(qty)||Number(qty)<1||Number(qty)>100000)fail();
  const matches=base.products.filter(product=>product.name.trim().toLowerCase()===productName.toLowerCase());
  if(matches.length!==1)throw Error(`Line ${index+1}: choose an unambiguous product from this order.`);
  let product=products.get(matches[0].id);
  if(!product){product={id:matches[0].id,name:matches[0].name.trim(),sizeHeader:'Size',quantityMode:'per_person',defaultQuantity:0,orderTotal:0,quantityGroupRules:[],specifications:[]};products.set(product.id,product);measurements.push({id:'label-size-'+product.id,name:'Size',type:'text',appliesTo:[product.id],requiredMode:'Optional'});}
  const key=JSON.stringify([name,group]);let record=records.get(key);
  if(!record){record={recordId:'label-person-'+(records.size+1),personId:'',values:{'field:label-name':name,'field:label-class':group}};records.set(key,record);}
  const quantityKey='product:'+product.id+':qty';
  if(record.values[quantityKey]!==undefined)throw Error(`Line ${index+1}: this person already has this product. Combine its quantity into one line, or distinguish the person name / group.`);
  record.values[quantityKey]=Number(qty);record.values['measurement:label-size-'+product.id+':product:'+product.id]=size;
  if(waist){const id='label-waist-'+product.id;if(!measurements.some(measurement=>measurement.id===id))measurements.push({id,name:'Waist',type:'text',appliesTo:[product.id],requiredMode:'Optional'});record.values['measurement:'+id+':product:'+product.id]=waist;}
 }
 // Explicit zeroes prevent a garment from appearing on another person's label.
 for(const record of records.values())for(const product of products.values())record.values['product:'+product.id+':qty']??=0;
 return {orderId:base.orderId,status:'Draft',archived:false,details:{orderNo:base.details.orderNo,clientName:base.details.clientName,clientType:base.details.clientType,orderDate:'',deliveryDate:'',contactPerson:'',attnRequired:false,contactNumber:'',shipTo:'',billTo:'',remarks:'Separate label list'},fields:[{id:'label-name',name:'Name',type:'text',options:[],required:true},{id:'label-class',name:'Class',type:'text',options:[],required:true}],products:[...products.values()],measurements,records:[...records.values()],revisions:[],updatedAt:new Date().toISOString()};
}
