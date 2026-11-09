// Runs before upstream game scripts. All browser work stays inside the injected script.
export const tabDisguiseScript = `<script>(()=>{try{
document.title='Untitled document - Google Docs';
let icon=document.querySelector('link[rel~="icon"]');if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon)}icon.href='https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico';
let muted=true;const media=new Set(),contexts=new Set();
const apply=m=>{media.add(m);m.muted=muted;if(muted)m.volume=0};
const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...a){apply(this);return play.apply(this,a)};
const scan=()=>document.querySelectorAll('audio,video').forEach(apply);
new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
for(const key of ['AudioContext','webkitAudioContext']){const Original=window[key];if(!Original)continue;window[key]=new Proxy(Original,{construct(Target,args){const ctx=Reflect.construct(Target,args);contexts.add(ctx);const resume=ctx.resume.bind(ctx);ctx.resume=()=>muted?Promise.resolve():resume();if(muted)ctx.suspend().catch(()=>{});return ctx}})}
const mount=()=>{scan();const control=document.createElement('button');control.type='button';control.textContent='🔇';control.title='Unmute game';control.setAttribute('aria-label','Unmute game');control.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;width:36px;height:36px;border-radius:4px;cursor:pointer';control.onclick=()=>{muted=!muted;media.forEach(m=>{m.muted=muted;m.volume=muted?0:1});contexts.forEach(c=>{(muted?c.suspend():c.resume()).catch(()=>{})});control.textContent=muted?'🔇':'🔊';control.title=muted?'Unmute game':'Mute game';control.setAttribute('aria-label',control.title)};document.body.appendChild(control)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}catch{}})()</script>`;