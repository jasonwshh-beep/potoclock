const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PIN = String(process.env.ADMIN_PIN || '');
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

const emptyState = () => ({pot:0,calls:[],winner:null,rolling:false,rollStartedAt:null,round:1,updatedAt:Date.now()});
let state = emptyState();

function ensureDataDir(){ try{fs.mkdirSync(DATA_DIR,{recursive:true})}catch(_){} }
function loadState(){ ensureDataDir(); try{ if(fs.existsSync(DATA_FILE)){ const p=JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); state={...emptyState(),...p,rolling:false,rollStartedAt:null}; } }catch(e){ console.error('Load state:',e.message); } }
function saveState(){ ensureDataDir(); state.updatedAt=Date.now(); try{fs.writeFileSync(DATA_FILE,JSON.stringify(state,null,2))}catch(e){console.error('Save state:',e.message)} }
function safeName(v){return String(v||'').trim().replace(/\s+/g,' ').slice(0,40)}
function publicState(){
  const m=new Map();
  for(const c of state.calls){ const k=c.name.toLowerCase(); const x=m.get(k)||{name:c.name,calls:0,contributed:0}; x.calls++; x.contributed+=Number(c.amount||0); m.set(k,x); }
  const stats=[...m.values()].sort((a,b)=>b.calls-a.calls||b.contributed-a.contributed||a.name.localeCompare(b.name));
  return {...state,pot:Number(state.pot.toFixed(2)),stats:stats.map(x=>({...x,contributed:Number(x.contributed.toFixed(2))})),entryCount:state.calls.length,uniqueCallers:stats.length,adminProtected:Boolean(ADMIN_PIN)};
}
function json(res,status,obj){ const body=JSON.stringify(obj); res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(body); }
function text(res,status,body,type='text/plain; charset=utf-8'){ res.writeHead(status,{'content-type':type}); res.end(body); }
function readBody(req){ return new Promise((resolve,reject)=>{ let d=''; req.on('data',c=>{d+=c;if(d.length>1e6){req.destroy();reject(new Error('Body too large'))}}); req.on('end',()=>{ if(!d)return resolve({}); try{resolve(JSON.parse(d))}catch(e){reject(new Error('Invalid JSON'))} }); req.on('error',reject); }); }
function isAuthed(req,body){ if(!ADMIN_PIN)return true; return String(req.headers['x-admin-pin']||body.pin||'')===ADMIN_PIN; }
function serveFile(res,file){ try{ const ext=path.extname(file).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'}; const data=fs.readFileSync(file); res.writeHead(200,{'content-type':types[ext]||'application/octet-stream'}); res.end(data); }catch(e){text(res,404,'Not found')} }

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`); const p=u.pathname;
  if(req.method==='GET'&&p==='/api/state') return json(res,200,publicState());
  if(req.method==='GET'&&(p==='/'||p==='/index.html')) return serveFile(res,path.join(PUBLIC,'index.html'));
  if(req.method==='GET'&&p==='/overlay') return serveFile(res,path.join(PUBLIC,'overlay.html'));
  if(req.method==='GET'&&!p.startsWith('/api/')){ const f=path.normalize(path.join(PUBLIC,p)); if(f.startsWith(PUBLIC)&&fs.existsSync(f)&&fs.statSync(f).isFile()) return serveFile(res,f); }

  let body={};
  if(['POST','DELETE','PUT','PATCH'].includes(req.method)){ try{body=await readBody(req)}catch(e){return json(res,400,{error:e.message})} if(!isAuthed(req,body)) return json(res,401,{error:'Invalid admin PIN'}); }

  if(req.method==='POST'&&p==='/api/call'){
    const name=safeName(body.name), amount=Number(body.amount);
    if(!name)return json(res,400,{error:'Enter a caller name'});
    if(!Number.isFinite(amount)||amount<=0)return json(res,400,{error:'Amount must be greater than 0'});
    const rounded=Math.round(amount*100)/100;
    state.calls.push({id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name,amount:rounded,createdAt:Date.now()});
    state.pot=Math.round((state.pot+rounded)*100)/100; state.winner=null; saveState(); return json(res,200,publicState());
  }
  if(req.method==='POST'&&p==='/api/adjust-pot'){
    const amount=Number(body.amount); if(!Number.isFinite(amount)||amount===0)return json(res,400,{error:'Enter a non-zero adjustment'});
    const next=Math.round((state.pot+amount)*100)/100; if(next<0)return json(res,400,{error:'Pot cannot go below $0'}); state.pot=next; saveState(); return json(res,200,publicState());
  }
  if(req.method==='DELETE'&&p.startsWith('/api/call/')){
    const id=decodeURIComponent(p.slice('/api/call/'.length)); const idx=state.calls.findIndex(c=>c.id===id); if(idx<0)return json(res,404,{error:'Call not found'});
    const [r]=state.calls.splice(idx,1); state.pot=Math.max(0,Math.round((state.pot-Number(r.amount||0))*100)/100); saveState(); return json(res,200,publicState());
  }
  if(req.method==='POST'&&p==='/api/roll'){
    if(state.rolling)return json(res,409,{error:'Already rolling'}); if(!state.calls.length)return json(res,400,{error:'Add at least one profitable caller first'}); if(state.pot<=0)return json(res,400,{error:'The pot is empty'});
    state.rolling=true; state.winner=null; state.rollStartedAt=Date.now(); const winning=state.calls[Math.floor(Math.random()*state.calls.length)]; const prize=Number(state.pot.toFixed(2)); saveState();
    setTimeout(()=>{state.winner={name:winning.name,prize,entryId:winning.id,wonAt:Date.now()};state.rolling=false;saveState();},5200);
    return json(res,200,{ok:true,rollStartedAt:state.rollStartedAt});
  }
  if(req.method==='POST'&&p==='/api/clear-winner'){state.winner=null;state.rolling=false;state.rollStartedAt=null;saveState();return json(res,200,publicState())}
  if(req.method==='POST'&&p==='/api/new-round'){state={...emptyState(),round:Number(state.round||1)+1};saveState();return json(res,200,publicState())}
  return json(res,404,{error:'Not found'});
});

loadState();
server.listen(PORT,'0.0.0.0',()=>console.log(`W Profit Pot running on port ${PORT}`));
