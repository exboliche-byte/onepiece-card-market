/* Detect photo card rectangles off the UI thread. Pure functions exposed for tests. */
"use strict";
const MAX_PHOTO_CARDS=40;
function median(a){if(!a.length)return 0;const v=a.sort((x,y)=>x-y);return v[v.length>>1]}
function estimateBackground(pixels,w,h){
 const samples=[[],[],[]],margin=Math.max(4,Math.round(Math.min(w,h)*.075)),step=Math.max(3,Math.round(Math.min(w,h)/130));
 for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
  if(x>margin&&x<w-margin&&y>margin&&y<h-margin)continue;
  const p=4*(y*w+x);
  for(let c=0;c<3;c++)samples[c].push(pixels[p+c]);
 }
 return samples.map(median);
}
function findComponents(mask,w,h,mode){
 const N=w*h,used=new Uint8Array(N),queue=new Int32Array(N),results=[];
 const minArea=N*.0018,minDim=Math.max(20,Math.min(w,h)*.058);
 for(let index=0;index<N;index++){
  if(!mask[index]||used[index])continue;
  used[index]=1;queue[0]=index;let head=0,tail=1;
  let xmin=w,xmax=0,ymin=h,ymax=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
  while(head<tail){
   const at=queue[head++],y=(at/w)|0,x=at-y*w;
   if(x<xmin)xmin=x;if(x>xmax)xmax=x;if(y<ymin)ymin=y;if(y>ymax)ymax=y;
   sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
   const left=x>0?at-1:-1,right=x<w-1?at+1:-1,up=y>0?at-w:-1,down=y<h-1?at+w:-1;
   if(left>=0&&mask[left]&&!used[left]){used[left]=1;queue[tail++]=left}
   if(right>=0&&mask[right]&&!used[right]){used[right]=1;queue[tail++]=right}
   if(up>=0&&mask[up]&&!used[up]){used[up]=1;queue[tail++]=up}
   if(down>=0&&mask[down]&&!used[down]){used[down]=1;queue[tail++]=down}
  }
  const bw=xmax-xmin+1,bh=ymax-ymin+1,area=bw*bh;
  if(area<minArea||area>N*.77||bw<minDim||bh<minDim||tail<Math.min(180,area*(mode==="edge"?.018:.12)))continue;
  const cx=sx/tail,cy=sy/tail;
  const angle=-.5*Math.atan2(2*(sxy/tail-cx*cy),syy/tail-cy*cy-(sxx/tail-cx*cx));
  const ca=Math.cos(angle),sa=Math.sin(angle);
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  const stride=Math.max(1,Math.round(tail/7000));
  for(let k=0;k<tail;k+=stride){
   const at=queue[k],y=(at/w)|0,x=at-y*w,dx=x-cx,dy=y-cy;
   const xx=dx*ca+dy*sa,yy=-dx*sa+dy*ca;
   if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;
  }
  let rw=x1-x0+1,rh=y1-y0+1,a=angle;
  if(rw>rh){const swap=rw;rw=rh;rh=swap;a+=Math.PI/2}
  const ratio=rw/rh,density=tail/area;
  if(rw<minDim||rh<minDim*1.5||ratio<.38||ratio>1.02||density<(mode==="edge"?.012:.12))continue;
  const fill=mode==="edge"?1.055:1.11;
  results.push({cx,cy,w:rw*fill,h:rh*fill,angle:a,manual:false,area:rw*rh,mode});
 }
 return results;
}
function growMask(src,w,h,radius=2){
 const N=w*h,out=new Uint8Array(N);
 for(let y=radius;y<h-radius;y++)for(let x=radius;x<w-radius;x++){
  let active=0,at=y*w+x;
  for(let dy=-radius;dy<=radius&&!active;dy++)for(let dx=-radius;dx<=radius;dx++)if(src[at+dy*w+dx]){active=1;break}
  out[at]=active;
 }
 return out;
}
function detectCardRegions(pixels,w,h){
 if(w<80||h<80||pixels.length!==w*h*4)return [];
 const bg=estimateBackground(pixels,w,h),N=w*h,colorMask=new Uint8Array(N),edgeMask=new Uint8Array(N);
 const threshold=Math.max(65,Math.min(160,Math.round((Math.max(...bg)-Math.min(...bg))*.35+84)));
 const gray=new Uint8Array(N);
 for(let i=0;i<N;i++){
  const p=i*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2];
  gray[i]=(r*77+g*150+b*29)>>8;
  const dist=Math.abs(r-bg[0])+Math.abs(g-bg[1])+Math.abs(b-bg[2]);
  if(dist>threshold)colorMask[i]=1;
 }
 for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
  const i=y*w+x,gx=Math.abs(gray[i+1]-gray[i-1]),gy=Math.abs(gray[i+w]-gray[i-w]);
  if(gx+gy>64)edgeMask[i]=1;
 }
 const color=findComponents(growMask(colorMask,w,h,2),w,h,"color");
 const edge=findComponents(growMask(edgeMask,w,h,2),w,h,"edge");
 const candidates=[...color,...edge].sort((a,b)=>b.area-a.area);
 const found=[];
 for(const candidate of candidates){
  if(found.some(prev=>{
   const dx=Math.abs(prev.cx-candidate.cx),dy=Math.abs(prev.cy-candidate.cy);
   return dx<Math.min(prev.w,candidate.w)*.55&&dy<Math.min(prev.h,candidate.h)*.35
     ||Math.hypot(dx,dy)<Math.min(prev.w,candidate.w)*.45;
  }))continue;
  found.push(candidate);if(found.length>=MAX_PHOTO_CARDS)break;
 }
 return found.sort((a,b)=>a.cy-b.cy||a.cx-b.cx);
}
if(typeof self!=="undefined"&&typeof self.postMessage==="function"){
 self.onmessage=({data})=>{
  if(data?.type!=="detect")return;
  try{
   const regions=detectCardRegions(new Uint8ClampedArray(data.pixels),data.width,data.height);
   self.postMessage({type:"detected",requestId:data.requestId,regions});
  }catch(error){self.postMessage({type:"error",requestId:data.requestId,message:String(error?.message||error)})}
 };
}
if(typeof globalThis!=="undefined")globalThis.__photoDetectorTest={detectCardRegions,estimateBackground};
