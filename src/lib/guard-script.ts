import { GUARD_INTERVAL_MS, IDLE_LIMIT_MS } from "./security-rules";

// Runs in the hub and in streamed game HTML. The server-side session check is
// authoritative; browser storage is only used for tab coordination/navigation.
export const guardScript = `<script>(()=>{try{
const T=window.top,store=T.sessionStorage;
const go=(message)=>{if(message)alert(message);store.removeItem('gate-tab');store.removeItem('gate-route');store.removeItem('gate-navigation');try{T.history.replaceState(null,'','/geometry')}catch{}T.location.replace('/geometry')};
if(store.getItem('gate-tab')!=='1'){go();return}
const route=T.location.pathname;
const restore=store.getItem('gate-navigation')===route;
store.removeItem('gate-navigation');
let navigating=restore;
const permit=u=>{try{const url=new URL(u,location.href);if(url.origin===location.origin&&(url.pathname.startsWith('/play/')||url.pathname==='/hub')){navigating=true;store.setItem('gate-navigation',url.pathname)}}catch{}};
addEventListener('click',e=>{const link=e.target.closest?.('a[href]');if(link)permit(link.href)},true);
addEventListener('submit',e=>{const form=e.target;if(form?.action)permit(form.action)},true);
addEventListener('pagehide',()=>{if(!navigating&&T.location.pathname===route)store.removeItem('gate-route')});
addEventListener('pageshow',e=>{if(e.persisted)void check()});
const touch=()=>store.setItem('last-active',String(Date.now()));if(!store.getItem('last-active'))touch();
['mousemove','mousedown','keydown','touchstart','wheel'].forEach(e=>addEventListener(e,touch,{passive:true,capture:true}));
let last=0;addEventListener('keydown',e=>{if(e.key==='Escape'){const now=Date.now();if(now-last<700)go();last=now}},true);
let busy=false;const check=async()=>{if(busy)return;busy=true;try{
if(store.getItem('gate-tab')!=='1'||Date.now()-Number(store.getItem('last-active'))>${IDLE_LIMIT_MS}){go();return}
const r=await fetch('/hub?session-check=1',{cache:'no-store',credentials:'same-origin'});if(!r.ok){go();return}const s=await r.json();
if(s.broadcast){go(s.broadcast);return}if(!s.unlocked){go();return}
if(s.message&&(window===T||window===T.frames[0])){alert(s.message);await fetch('/hub?session-check=1&ack=1',{cache:'no-store',credentials:'same-origin'})}
}catch{}finally{busy=false}};void check();setInterval(check,${GUARD_INTERVAL_MS});
}catch{try{window.top.location.replace('/geometry')}catch{location.replace('/geometry')}}})()</script>`;
