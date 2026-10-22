/** Decode ordinary image uploads independently of filename/MIME mistakes. */
export async function decodeBrowserImage(file:File):Promise<ImageBitmap|HTMLImageElement> {
  if(!file.size)throw new Error("This file is empty or has not finished downloading. Download the original file first.");
  if(file.size>20*1024*1024)throw new Error("Choose an image up to 20 MB. Larger originals can be attached as artwork.");
  const bytes=new Uint8Array(await file.slice(0,512).arrayBuffer());
  const text=new TextDecoder().decode(bytes).trimStart();
  let type=file.type;
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)type="image/png";
  else if(bytes[0]===255&&bytes[1]===216)type="image/jpeg";
  else if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')type="image/webp";
  else if(text.startsWith('GIF8'))type="image/gif";
  else if(text.startsWith('BM'))type="image/bmp";
  else if(/^(?:<\?xml[\s\S]*?\?>\s*)?<svg[\s>]/i.test(text))type="image/svg+xml";
  if(!['image/png','image/jpeg','image/webp','image/gif','image/bmp','image/svg+xml'].includes(type))throw new Error("Choose a PNG, JPEG, WebP, GIF, BMP or SVG image. Renaming another file to .jpeg does not convert it.");
  const blob=new Blob([file],{type});
  try{return await createImageBitmap(blob);}catch{/* Use the browser's image-element decoder as a fallback. */}
  const load=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>reject(new Error('decode')),15000);img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=()=>{clearTimeout(timer);reject(new Error('decode'));};img.src=src;});
  const url=URL.createObjectURL(blob);
  try{return await load(url);}catch{
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
    try{return await load(data);}catch{throw new Error("The browser cannot read this image's contents. Choose the original image file; the existing saved asset has been kept.");}
  }finally{URL.revokeObjectURL(url);}
}

export async function prepareBillingImage(file:File) {
  const image=await decodeBrowserImage(file);
  try{
    for(const edge of [1800,1400,1000,800,600]){
      const scale=Math.min(1,edge/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('Image preparation is unavailable in this browser.');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      // Prefer PNG for sharp QR modules and transparency. WebP preserves alpha for complex artwork.
      const png=canvas.toDataURL('image/png');if(png.length<=1_600_000)return png;
      for(const quality of [.96,.9,.82]){const webp=canvas.toDataURL('image/webp',quality);if(webp.startsWith('data:image/webp;')&&webp.length<=1_600_000)return webp;}
    }
    throw new Error('This image could not be prepared. Choose another image; the existing asset has been kept.');
  }finally{if('close' in image)image.close();}
}
