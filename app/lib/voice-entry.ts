/** Accept one unambiguous numeric measurement; never concatenate separate numbers. */
export function spokenNumber(text:string):number|null{
 const digits=text.replace(/[૦-૯]/g,c=>String(c.charCodeAt(0)-0x0ae6)).replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x0966));
 if(/^\s*-/.test(digits))return null;
 let s=digits.toLowerCase().trim().replace(/[.,!?]+$/,"").replace(/\b(inch|inches|centimeter|centimeters|centimetres|cm)\b/g,"").replace(/[-]/g," ").replace(/\s+/g," ").trim();
 let fraction=0;const f=s.match(/(?:\s+(?:and\s+)?(?:a\s+)?)?(half|quarter|three quarters|1\/2|1\/4|3\/4)$/);if(f){fraction=['half','1/2'].includes(f[1])?0.5:['quarter','1/4'].includes(f[1])?0.25:0.75;s=s.slice(0,f.index).trim();}
 if(!s)return fraction||null;if(/^\d+(?:\.\d+)?$/.test(s)){const n=Number(s)+fraction;return Number.isFinite(n)?n:null;}
 const small:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 const parts=s.split(' point ');if(parts.length>2)return null;const words=parts[0].split(' ');let whole:number;if(words.length===1&&words[0] in small)whole=small[words[0]];else if(words.length===2&&small[words[0]]>=20&&small[words[0]]%10===0&&small[words[1]]>0&&small[words[1]]<10)whole=small[words[0]]+small[words[1]];else return null;
 if(parts[1]){const decimal=parts[1].split(' ');if(fraction||!decimal.every(w=>w in small&&small[w]<10))return null;whole+=Number('0.'+decimal.map(w=>small[w]).join(''));}return whole+fraction;
}
