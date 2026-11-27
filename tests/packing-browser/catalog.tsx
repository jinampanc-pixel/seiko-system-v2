import '../../app/globals.css';
import '../../app/seiko-brand-theme.css';
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {AccessProvider} from '../../app/access-control';
import {GarmentCatalog,OrderCatalogPicker,ProductReferenceImages} from '../../app/garment-catalog';
import type {SeikoOrder} from '../../app/lib/order-domain';
function Demo(){const [order,setOrder]=useState<SeikoOrder>({orderId:'new',status:'Draft',archived:false,details:{orderNo:'TEST',clientName:'Test',contactNumber:'9999999999',clientType:'',orderDate:'',deliveryDate:'',contactPerson:'',attnRequired:false,shipTo:'',billTo:'',remarks:''},products:[],fields:[{id:'class-new',name:'Class',type:'text',options:[],required:false}],measurements:[],records:[],revisions:[],updatedAt:''});return <><OrderCatalogPicker order={order} onChange={setOrder}/><output data-testid="order">{JSON.stringify(order)}</output><div data-testid="order-images">{order.products.map(p=><ProductReferenceImages key={p.id} product={p}/>)}</div><GarmentCatalog/></>;}
createRoot(document.getElementById('root')!).render(<AccessProvider><Demo/></AccessProvider>);
