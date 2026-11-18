#!/usr/bin/env node
'use strict';
// 48 frames of 960x540 RGBA. FFmpeg upscales/encodes 1080p VP9 alpha.
const WIDTH=960, HEIGHT=540, FRAMES=48;
const pixels=Buffer.alloc(WIDTH*HEIGHT*4);
const font={
 A:['01110','10001','10001','11111','10001','10001','10001'],
 C:['01111','10000','10000','10000','10000','10000','01111'],
 D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],
 F:['11111','10000','10000','11110','10000','10000','10000'],
 I:['11111','00100','00100','00100','00100','00100','11111'],
 K:['10001','10010','10100','11000','10100','10010','10001'],
 R:['11110','10001','10001','11110','10100','10010','10001'],
 T:['11111','00100','00100','00100','00100','00100','00100'],
 V:['10001','10001','10001','10001','01010','01010','00100'],
 ' ':['00000','00000','00000','00000','00000','00000','00000']
};
const title='VICE AFTER DARK', charScale=6, charStep=charScale*6;
const titleX=Math.round((WIDTH-title.length*charStep+charScale)/2), titleY=HEIGHT/2-24;
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
function smooth(t){return t*t*(3-2*t);}
function titleLit(x,y){
 const xx=x-titleX, yy=y-titleY;
 if(xx<0||yy<0||yy>=7*charScale)return false;
 const index=Math.floor(xx/charStep);if(index>=title.length)return false;
 const col=Math.floor((xx%charStep)/charScale);
 return col<5 && font[title[index]][Math.floor(yy/charScale)][col]==='1';
}
for(let frame=0;frame<FRAMES;frame++){
 const p=frame/(FRAMES-1);
 pixels.fill(0);
 if(p!==0&&p!==1){
  const isEntry=p<=0.5,ratio=isEntry?p*2:(p-0.5)*2,phase=smooth(ratio);
  const front=(-0.28+1.56*phase)*WIDTH;
  const labelOpacity=clamp((p-0.24)/0.09,0,1)*clamp((0.76-p)/0.09,0,1);
  for(let y=0;y<HEIGHT;y++){
   const yNorm=y/HEIGHT;
   for(let x=0;x<WIDTH;x++){
    const skewX=x+(yNorm-0.5)*145;
    const visible=isEntry?skewX<=front:skewX>front;
    if(!visible)continue;
    const idx=(y*WIDTH+x)*4,edge=Math.abs(skewX-front);
    const diagonal=((x+y*0.62)%310+310)%310;
    let r=diagonal<54?180:diagonal<90?123:78;
    let g=diagonal<54?12:4,b=diagonal<54?37:22;
    if((y%54)<2){r+=19;g+=9;b+=8;}
    if(edge<42){r=235;g=29;b=54;}
    if(edge<14){r=255;g=220;b=222;}
    if(y>titleY-37&&y<titleY+7*charScale+37&&x>titleX-45&&x<titleX+title.length*charStep+32&&labelOpacity>0){
      r=Math.floor(r*(1-0.45*labelOpacity));g=Math.floor(g*(1-0.45*labelOpacity));b=Math.floor(b*(1-0.45*labelOpacity));
    }
    if(labelOpacity>0&&titleLit(x,y)){
      r=Math.round(r*(1-labelOpacity)+255*labelOpacity);
      g=Math.round(g*(1-labelOpacity)+245*labelOpacity);
      b=Math.round(b*(1-labelOpacity)+235*labelOpacity);
    }
    pixels[idx]=Math.min(255,r);pixels[idx+1]=Math.min(255,g);pixels[idx+2]=Math.min(255,b);pixels[idx+3]=255;
   }
  }
 }
 // stdout writes are asynchronous: never reuse a queued buffer.
 process.stdout.write(Buffer.from(pixels));
}
