import { GUARD_INTERVAL_MS, IDLE_LIMIT_MS } from "./security-rules";

// Runs in the hub and in streamed game HTML. The server-side session check is
// authoritative; browser storage is only used for tab coordination/navigation.
export const guardScript = `<script>(()=>{try{
const T=window.top,store=T.sessionStorage;
const go=(message)=>{if(message){try{store.setItem('gate-tripwire-notice',String(message))}catch{}}store.removeItem('gate-tab');store.removeItem('gate-route');store.removeItem('gate-navigation');try{T.history.replaceState(null,'','/geometry')}catch{}T.location.replace('/geometry')};
const notify=(message)=>{try{const d=T.document;let n=d.getElementById('gate-admin-message');if(!n){n=d.createElement('div');n.id='gate-admin-message';n.setAttribute('role','status');n.setAttribute('aria-live','polite');n.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(92vw,560px);padding:13px 18px;border:1px solid rgba(255,255,255,.2);border-radius:12px;background:#172033;color:#fff;font:500 14px/1.45 system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.28);';d.body.appendChild(n)}n.textContent=String(message);n.style.opacity='1';if(n.__gateTimer)T.clearTimeout(n.__gateTimer);n.__gateTimer=T.setTimeout(()=>{n.style.transition='opacity .25s';n.style.opacity='0';T.setTimeout(()=>n.remove(),300)},7000)}catch{}};
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
if(s.message&&(window===T||window===T.frames[0])){notify(s.message);await fetch('/hub?session-check=1&ack=1',{cache:'no-store',credentials:'same-origin'})}
}catch{}finally{busy=false}};void check();setInterval(check,${GUARD_INTERVAL_MS});
}catch{try{window.top.location.replace('/geometry')}catch{location.replace('/geometry')}}})()</script>`;
