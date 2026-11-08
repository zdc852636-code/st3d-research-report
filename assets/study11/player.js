"use strict";
(() => {
  const colors = {estimate:"#1965b2", truth:"#127652", court:"#50e3d3", net:"#ffc369", point:"#ff9e27"};
  const rootURL = new URL("assets/study11/", document.baseURI);
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const floor = [
    ...[-3.05,-2.59,2.59,3.05].map(x=>[[x,-6.7,0],[x,6.7,0]]),
    ...[-6.7,-5.94,-1.98,1.98,5.94,6.7].map(y=>[[-3.05,y,0],[3.05,y,0]]),
    [[0,-6.7,0],[0,-1.98,0]],[[0,1.98,0],[0,6.7,0]]
  ];
  const corners=[[-3.05,-6.7,0],[3.05,-6.7,0],[3.05,6.7,0],[-3.05,6.7,0]];
  const net=[[-3.05,0,0],[-3.05,0,1.55],[3.05,0,1.55],[3.05,0,0]];
  const views={diagonal:[-.95,.48],opposite:[2.2,.46],side:[Math.PI/2,.18],rear:[0,.2],top:[Math.PI/2,1.55]};
  function context(canvas){
    const {width:w,height:h}=canvas.getBoundingClientRect();
    if(!w||!h)return null;
    const ratio=Math.min(window.devicePixelRatio||1,2),rw=Math.round(w*ratio),rh=Math.round(h*ratio);
    if(canvas.width!==rw||canvas.height!==rh){canvas.width=rw;canvas.height=rh;}
    const c=canvas.getContext("2d");c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
    return {c,w,h};
  }
  function line(c,points,color,width=1,dash=[]){
    if(points.length<2)return;
    c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);
    c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);
  }
  function dot(c,p,col,r){
    c.beginPath();c.arc(...p,r,0,2*Math.PI);c.fillStyle=col;c.fill();c.strokeStyle="white";c.lineWidth=1;c.stroke();
  }
  class Replay{
    constructor(section, cases){
      this.root=section;this.cases=cases;this.sim=section.dataset.group==="sim";this.ticket=0;this.frame=0;this.zoom=1;
      this.view="diagonal";[this.yaw,this.pitch]=views.diagonal;
      this.el=(key)=>section.querySelector('[data-ui="'+key+'"]');
      this.select=this.el("case");this.slider=this.el("seek");this.world=this.el("world");
      cases.forEach(x=>this.select.add(new Option(x.title,x.key)));
      this.select.onchange=()=>this.load(this.select.value);
      this.el("play").onclick=()=>this.togglePlay();
      this.el("home")?.addEventListener("click",()=>this.seek(this.lo));
      this.el("rate")?.addEventListener("change",()=>{if(this.video)this.video.playbackRate=Number(this.el("rate").value);});
      this.slider.oninput=()=>this.seek(Number(this.slider.value));
      this.el("prev").onclick=()=>this.seek(this.frame-1);this.el("next").onclick=()=>this.seek(this.frame+1);
      this.el("scope")?.addEventListener("change",()=>{if(this.data){this.bounds();this.seek(this.lo);}});
      this.el("scope") && (this.el("scope").checked=new URL(location.href).searchParams.get("rally")==="full");
      for(const key of ["cal","reference","whole"])this.el(key).onchange=()=>this.draw();
      this.el("zoom").oninput=e=>{this.zoom=Number(e.target.value);this.drawWorld();};
      section.querySelectorAll("[data-view]").forEach(btn=>btn.onclick=()=>{
        this.view=btn.dataset.view;[this.yaw,this.pitch]=views[this.view];this.zoom=1;this.el("zoom").value=1;this.drawWorld();
      });
      this.world.onpointerdown=e=>{if(e.button===0){this.world.setPointerCapture(e.pointerId);this.drag=[e.clientX,e.clientY];}};
      this.world.onpointermove=e=>{if(this.drag){this.yaw+=(e.clientX-this.drag[0])*.012;this.pitch=clamp(this.pitch+(e.clientY-this.drag[1])*.009,.04,1.55);this.view="custom";this.drag=[e.clientX,e.clientY];this.drawWorld();}};
      this.world.onlostpointercapture=this.world.onpointerup=this.world.onpointercancel=()=>{this.drag=null;};
      this.world.addEventListener("wheel",e=>{
        e.preventDefault();this.zoom=clamp(this.zoom*Math.exp(-e.deltaY*.001),.7,2);
        this.el("zoom").value=this.zoom;this.drawWorld();
      },{passive:false});
      this.world.onkeydown=e=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();this.yaw+=({"ArrowLeft":-.1,"ArrowRight":.1}[e.key]||0);this.pitch=clamp(this.pitch+({"ArrowUp":.1,"ArrowDown":-.1}[e.key]||0),.04,1.55);this.view="custom";this.drawWorld();}};
      new ResizeObserver(()=>this.draw()).observe(section);
      this.load(cases[0].key);
    }
    bounds(){[this.lo,this.hi]=this.sim||this.el("scope")?.checked?[0,this.data.n-1]:this.data.focus;this.slider.min=this.lo;this.slider.max=this.hi;}
    async load(key){
      const ticket=++this.ticket, initial=this.sim?this.frame:0;
      this.video?.pause();this.video?.removeAttribute("src");this.video?.load();this.video=null;this.data=null;
      this.root.dataset.ready="loading";this.el("status").textContent="正在载入录像…";
      this.root.querySelectorAll("button,input").forEach(x=>x.disabled=true);
      try{
        const spec=this.cases.find(x=>x.key===key);
        const response=await fetch(new URL(spec.file,rootURL));if(!response.ok)throw Error("坐标文件未载入");
        const d=await response.json();if(ticket!==this.ticket)return;
        if(this.sim&&this.el("crop")){
          const tiles=await Promise.all(["crop","heat"].map(async kind=>{
            const image=new Image();image.src=new URL(key+"_"+kind+".png",rootURL);
            await image.decode();return image;
          }));
          if(ticket!==this.ticket)return;
          this.tiles=tiles;
        }
        const v=document.createElement("video");v.muted=true;v.playsInline=true;v.preload="auto";v.setAttribute("aria-label",spec.title+"的原始画面");
        v.playbackRate=Number(this.el("rate")?.value||1);
        this.el("original").replaceChildren(v);this.video=v;
        await new Promise((ok,fail)=>{v.onloadeddata=ok;v.onerror=()=>fail(Error("录像未载入"));v.onemptied=()=>{if(ticket!==this.ticket)ok();};v.src=new URL(d.video,rootURL);v.load();});
        if(ticket!==this.ticket)return;
        this.data=d;this.bounds();this.frame=clamp(this.sim?initial:this.lo,this.lo,this.hi);this.target=this.frame;
        v.onplay=()=>{this.el("play").textContent="暂停";window.dispatchEvent(new CustomEvent("replay-playing",{detail:v}));};
        v.onpause=()=>{this.el("play").textContent="播放";};
        v.onended=()=>{this.frame=this.hi;this.draw();};v.onseeked=()=>{if(ticket===this.ticket){this.target=null;this.frame=clamp(Math.floor(v.currentTime*d.fps+.001),this.lo,this.hi);this.draw();}};
        const update=(t)=>{
          if(ticket!==this.ticket||this.target!==null||v.seeking)return;
          const f=Math.round(t*d.fps);
          if(!v.paused&&f>=this.hi){this.seek(this.hi);return;}
          this.frame=clamp(f,this.lo,this.hi);this.draw();
        };
        if(v.requestVideoFrameCallback){
          const watch=(_,m)=>{if(ticket!==this.ticket)return;update(m.mediaTime);v.requestVideoFrameCallback(watch);};v.requestVideoFrameCallback(watch);
        }else{const watch=()=>{if(ticket!==this.ticket)return;if(!v.paused)update(v.currentTime);requestAnimationFrame(watch);};requestAnimationFrame(watch);}
        this.seek(this.frame);this.root.dataset.ready="true";this.root.querySelectorAll("button,input").forEach(x=>x.disabled=false);
        this.el("status").textContent=this.sim?"该机位三维平均误差 "+(d.metric/100).toFixed(2)+" 米":"选段二维定位误差 "+d.metric.toFixed(2)+" 像素";
        if(this.sim&&this.el("crop")){
          const stats=this.root.closest("section");
          stats.querySelector("[data-stat=mean]").textContent=(d.metric/100).toFixed(2)+" m";
          stats.querySelector("[data-stat=observed]").textContent=d.obs.filter(Boolean).length+" 帧";
        }
        this.el("play").textContent="播放";this.draw();
      }catch(err){if(ticket===this.ticket){this.el("status").textContent=err.message;this.root.dataset.ready="error";}}
    }
    seek(index){if(!this.data)return;const f=clamp(index,this.lo,this.hi);this.video.pause();this.frame=f;this.target=f;this.video.currentTime=(f+.08)/this.data.fps;this.draw();}
    async togglePlay(){if(!this.data)return;if(!this.video.paused)return this.video.pause();if(this.frame>=this.hi)this.seek(this.lo);
      try{await this.video.play();}catch(err){this.el("status").textContent="播放未开始，请再点击播放。";}}
    draw(){
      if(!this.data)return;
      this.slider.value=this.frame;this.el("clock").textContent=(this.frame/this.data.fps).toFixed(2)+" / "+(this.hi/this.data.fps).toFixed(2)+" s";
      if(this.el("frame"))this.el("frame").textContent="第 "+(this.frame-this.lo+1)+" / "+(this.hi-this.lo+1)+" 帧";
      if(this.tiles){
        ["crop","heat"].forEach((key,k)=>{
          const ctx=this.el(key).getContext("2d");
          ctx.drawImage(this.tiles[k],(this.frame%16)*24,Math.floor(this.frame/16)*24,24,24,0,0,24,24);
        });
      }
      this.root.dataset.frame=this.frame;this.drawCamera();this.drawWorld();
    }
    drawCamera(){
      const a=context(this.el("overlay"));if(!a)return;const {c,w,h}=a,d=this.data,i=this.frame;
      const s=Math.min(w/d.w,h/d.h),ox=(w-s*d.w)/2,oy=(h-s*d.h)/2,xy=p=>[ox+p[0]*s,oy+p[1]*s];
      c.fillStyle="#12202c";c.fillRect(0,0,w,h);if(this.video.readyState>=2)c.drawImage(this.video,ox,oy,d.w*s,d.h*s);
      c.save();c.beginPath();c.rect(ox,oy,d.w*s,d.h*s);c.clip();
      if(this.el("cal").checked){
        for(const pts of d.court.floor)line(c,pts.map(xy),colors.court,1.25);
        for(const pts of d.court.net)line(c,pts.map(xy),colors.net,1.25,[4,3]);
        for(const q of d.court.anchors)dot(c,xy(q),colors.court,2.1);
      }
      for(let k=Math.max(this.lo+1,i-16);k<=i;k++)if(d.obs[k]&&d.obs[k-1])line(c,[xy(d.obs[k-1]),xy(d.obs[k])],colors.point,1.8);
      if(d.obs[i]){const p=xy(d.obs[i]);c.strokeStyle="#ffad35";c.lineWidth=2;c.strokeRect(p[0]-5,p[1]-5,10,10);}
      if(!this.sim&&this.el("reference").checked&&d.label?.[i]){const [x,y]=xy(d.label[i]);for(const [col,sz] of [["#24303a",3.5],["white",1.5]]){line(c,[[x-5,y],[x+5,y]],col,sz);line(c,[[x,y-5],[x,y+5]],col,sz);}}
      c.restore();
    }
    drawWorld(){
      if(!this.data)return;const a=context(this.world);if(!a)return;
      const {c,w,h}=a,d=this.data,i=this.frame;const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);
      const rot=([x,y,z])=>[x*cy-y*sy,(x*sy+y*cy)*sp+(z-1.5)*cp];
      const points=[...corners,...net,...d.xyz.slice(this.lo,this.hi+1),...(d.truth?.slice(this.lo,this.hi+1)||[])].map(rot);
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
      const scale=Math.min((w-32)/Math.max(1,right-left),(h-44)/Math.max(1,top-bottom))*this.zoom;
      const q=p=>{const [x,y]=rot(p);return [w/2+(x-(left+right)/2)*scale,h/2+4-(y-(top+bottom)/2)*scale];};
      c.fillStyle="#f4f8f6";c.fillRect(0,0,w,h);const poly=corners.map(q);c.beginPath();c.moveTo(...poly[0]);poly.slice(1).forEach(p=>c.lineTo(...p));c.closePath();c.fillStyle="#dcece0";c.fill();
      floor.forEach(l=>line(c,l.map(q),"#91ad9b",1));line(c,net.map(q),"#617d85",1.4);
      const end=this.el("whole").checked?this.hi:i,start=this.el("whole").checked?this.lo:Math.max(this.lo,i-60);
      if(d.truth&&this.el("reference").checked){line(c,d.truth.slice(start,end+1).map(q),colors.truth,1.5,[4,2]);dot(c,q(d.truth[i]),colors.truth,3);}
      for(let j=start+1;j<=end;j++){const seen=d.obs[j]&&d.obs[j-1];line(c,[q(d.xyz[j-1]),q(d.xyz[j])],j>i?"#aabccf":seen?colors.estimate:"#9069a9",j>i?1:2.2,seen?[]:[3,2]);}
      const cur=d.xyz[i];line(c,[q(cur),q([cur[0],cur[1],0])],"#8ba4ac",1,[3,3]);dot(c,q(cur),colors.estimate,4.5);
      this.root.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.view===this.view)));
      this.el("height").textContent="高度 "+cur[2].toFixed(2)+" m";
    }
  }
  fetch(new URL("cases.json",rootURL)).then(r=>{if(!r.ok)throw Error();return r.json();}).then(cases=>{
    document.querySelectorAll(".replay").forEach(s=>{const viewer=new Replay(s,cases.filter(x=>x.group===s.dataset.group));
      window.addEventListener("replay-playing",e=>{if(viewer.video!==e.detail)viewer.video?.pause();});});
  }).catch(()=>document.querySelectorAll('[data-ui="status"]').forEach(s=>s.textContent="回放目录载入失败，请刷新。"));
})();
