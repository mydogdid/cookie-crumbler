// ═══════════════════════════════════════════════════════
// SCORES API
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// PIXEL ART RENDERER  (48×48 → 288×288 at 6× scale)
// ═══════════════════════════════════════════════════════
const INT=48, DISP=288;
const mainC=document.getElementById('c');
mainC.width=mainC.height=DISP;
const mctx=mainC.getContext('2d');
mctx.imageSmoothingEnabled=false;

const offC=document.createElement('canvas');
offC.width=offC.height=INT;
const octx=offC.getContext('2d');
octx.imageSmoothingEnabled=false;

const CX=24,CY=24,R=21;
const P={lo:'#FFECC0',mi:'#FFD07A',dk:'#DDA040',ed:'#B07030',chip:'#3D1D0A',chipH:'#6B3820',crk:'#8B4510',crkL:'#FFE8A0'};

const CHIPS=[[27,13,4,3],[16,10,3,3],[33,21,4,3],[12,21,3,3],[25,30,4,3],[14,32,3,3],[35,32,3,2],[10,31,3,2],[29,39,3,2],[19,38,3,2]];

const CRACKS=[
  [[[26,19],[31,25],[35,28]]],
  [[[26,19],[31,25],[35,28]],[[21,25],[15,31],[12,27]],[[22,15],[25,11]]],
  [[[26,19],[31,25],[35,28]],[[21,25],[15,31],[12,27]],[[22,15],[25,11]],[[25,23],[28,17],[31,13]],[[23,26],[21,33],[23,38]],[[26,27],[31,33],[30,40]]],
  [[[26,19],[31,25],[35,28]],[[21,25],[15,31],[12,27]],[[22,15],[25,11]],[[25,23],[28,17],[31,13]],[[23,26],[21,33],[23,38]],[[26,27],[31,33],[30,40]],[[17,18],[13,14]],[[28,24],[35,23],[38,26]],[[23,12],[21,8]],[[23,24],[10,25]],[[24,24],[25,40]],[[18,27],[22,32],[17,36]]],
];

function bresenham(x0,y0,x1,y1){
  const pts=[],dx=Math.abs(x1-x0),dy=Math.abs(y1-y0);
  let sx=x0<x1?1:-1,sy=y0<y1?1:-1,er=dx-dy;
  for(;;){pts.push([x0,y0]);if(x0===x1&&y0===y1)break;const e2=2*er;if(e2>-dy){er-=dy;x0+=sx;}if(e2<dx){er+=dx;y0+=sy;}}
  return pts;
}

function renderCookie(hp,exploded){
  octx.clearRect(0,0,INT,INT);
  if(exploded){drawPieces();flush();return;}
  const pct=hp/MAX_HP;
  for(let py=0;py<INT;py++)for(let px=0;px<INT;px++){
    const dx=px-CX+0.5,dy=py-CY+0.5,d=Math.hypot(dx,dy);
    if(d<R-3){octx.fillStyle=dx+dy<-3?P.lo:dx+dy>4?P.dk:P.mi;octx.fillRect(px,py,1,1);}
    else if(d<R){octx.fillStyle=P.ed;octx.fillRect(px,py,1,1);}
  }
  CHIPS.forEach(([cx,cy,cw,ch])=>{
    if(Math.hypot(cx+cw/2-CX,cy+ch/2-CY)>R-2)return;
    octx.fillStyle=P.chip;octx.fillRect(cx,cy,cw,ch);
    octx.fillStyle=P.chipH;octx.fillRect(cx,cy,cw,1);
  });
  const stage=pct<0.10?3:pct<0.25?2:pct<0.50?1:pct<0.75?0:-1;
  if(stage>=0)CRACKS[stage].forEach(path=>{
    for(let i=0;i<path.length-1;i++)
      bresenham(path[i][0],path[i][1],path[i+1][0],path[i+1][1]).forEach(([px,py])=>{
        if(px+1<INT&&py+1<INT){octx.fillStyle=P.crkL;octx.fillRect(px+1,py+1,1,1);}
        octx.fillStyle=P.crk;octx.fillRect(px,py,1,1);
      });
  });
  if(pct<0.25){
    octx.save();octx.globalAlpha=parseFloat(((1-pct/0.25)*0.20).toFixed(2));
    octx.fillStyle='#E03030';octx.beginPath();octx.arc(CX,CY,R,0,Math.PI*2);octx.fill();octx.restore();
  }
  flush();
}

function drawPieces(){
  [[-16,-18,9],[17,-16,8],[-15,17,9],[16,17,9],[-20,1,7],[3,21,7],[21,-3,6],[-3,-21,7]].forEach(([ox,oy,r])=>{
    const cx=CX+ox,cy=CY+oy;
    for(let py=cy-r;py<=cy+r;py++)for(let px=cx-r;px<=cx+r;px++){
      if(px<0||py<0||px>=INT||py>=INT)continue;
      const dx=px-cx,dy=py-cy,d=Math.hypot(dx,dy);
      if(d<r-2){octx.fillStyle=dx+dy<-2?P.lo:dx+dy>3?P.dk:P.mi;octx.fillRect(px,py,1,1);}
      else if(d<r){octx.fillStyle=P.ed;octx.fillRect(px,py,1,1);}
    }
  });
}

function flush(){
  mctx.clearRect(0,0,DISP,DISP);mctx.imageSmoothingEnabled=false;
  mctx.drawImage(offC,0,0,INT,INT,0,0,DISP,DISP);
}

// ═══════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════
const MAX_HP=500;
let hp,clicks,clickTs,over,tStart,tInt,finalClicks=0,finalTimeMs=0;

function getCPS(){
  const now=Date.now();
  clickTs=clickTs.filter(t=>now-t<2000);
  return clickTs.length/2;
}

function getMult(cps){
  if(cps<3)return 1; if(cps<4)return 1.5;
  if(cps<6)return 2.5; if(cps<8)return 4; return 6;
}

function fmtMM(ms){
  const s=Math.floor(ms/1000);
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}
function fmtSec(ms){ return (ms/1000).toFixed(2)+'s'; }

// ═══════════════════════════════════════════════════════
// NAME VALIDATION
// ═══════════════════════════════════════════════════════
function isValidName(name){
  const value=name.trim().toUpperCase();
  return value.length===0||/^[A-Z0-9 _.-]{1,8}$/.test(value);
}

function cleanName(name){
  return (name.trim().toUpperCase().replace(/[^A-Z0-9 _.-]/g,'')||'ANON').slice(0,8);
}

// ═══════════════════════════════════════════════════════
// LEADERBOARD  (Supabase — global, shared across all devices)
// ═══════════════════════════════════════════════════════
const LB_PER_PAGE=15;
let lbCurrentPage=0;

async function getScores(){
  const res=await fetch('/api/scores');
  if(!res.ok) throw new Error('score load failed');
  const data=await res.json();
  return Array.isArray(data.scores)?data.scores:[];
}

let gameToken=null,gameTokenPromise=null;

async function startGameSession(){
  if(gameToken)return gameToken;
  if(!gameTokenPromise){
    gameTokenPromise=fetch('/api/game-session')
      .then(res=>{if(!res.ok)throw new Error('game session failed');return res.json();})
      .then(data=>{
        if(!data.token)throw new Error('game session missing token');
        gameToken=data.token;
        return gameToken;
      })
      .catch(err=>{gameTokenPromise=null;throw err;});
  }
  return gameTokenPromise;
}

async function addScore(name,clicks,timeMs,gameToken){
  const res=await fetch('/api/scores',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,clicks,time_ms:timeMs,game_token:gameToken})
  });
  if(!res.ok) throw new Error('score save failed');
}

async function wouldBeRecord(c){
  const scores=await getScores();
  return scores.length===0||c<scores[0].clicks;
}

function lbPage(delta){
  lbCurrentPage=Math.max(0,lbCurrentPage+delta);
  refreshLeaderboard();
}

async function refreshLeaderboard(){
  const lb=document.getElementById('leaderboard');
  lb.replaceChildren();
  const loading=document.createElement('div');
  loading.className='lb-loading';
  loading.textContent='loading...';
  lb.appendChild(loading);
  try{
    const scores=await getScores();
    const total=scores.length;
    const totalPages=Math.max(1,Math.ceil(total/LB_PER_PAGE));
    lbCurrentPage=Math.min(lbCurrentPage,totalPages-1);
    const start=lbCurrentPage*LB_PER_PAGE;

    lb.replaceChildren();
    if(total===0){
      const empty=document.createElement('div');
      empty.className='lb-empty';
      empty.textContent='no scores yet!';
      lb.appendChild(empty);
    }else{
      scores.slice(start,start+LB_PER_PAGE).forEach((s,i)=>{
        const row=document.createElement('div');
        row.className='lb-row';

        const rank=document.createElement('span');
        rank.className='lb-rank';
        rank.textContent=`#${start+i+1}`;

        const name=document.createElement('span');
        name.className='lb-name';
        name.textContent=String(s.name||'ANON').slice(0,8);

        const score=document.createElement('span');
        score.className='lb-score';
        score.textContent=String(Number(s.clicks)||0).padStart(4,'0');

        const time=document.createElement('span');
        time.className='lb-time';
        time.textContent=fmtSec(Number(s.time_ms)||0);

        row.append(rank,name,score,time);
        lb.appendChild(row);
      });
    }

    document.getElementById('lbPageInfo').textContent=`${lbCurrentPage+1} / ${totalPages}`;
    document.getElementById('lbPrev').disabled=lbCurrentPage===0;
    document.getElementById('lbNext').disabled=lbCurrentPage>=totalPages-1;
  }catch{
    lb.replaceChildren();
    const empty=document.createElement('div');
    empty.className='lb-empty';
    empty.textContent='could not load scores';
    lb.appendChild(empty);
  }
}

// ═══════════════════════════════════════════════════════
// CLICK HANDLER
// ═══════════════════════════════════════════════════════
mainC.addEventListener('click',e=>{
  if(over)return;
  const rect=mainC.getBoundingClientRect();
  const sx=DISP/rect.width,sy=DISP/rect.height;
  const dx=(e.clientX-rect.left)*sx-DISP/2;
  const dy=(e.clientY-rect.top)*sy-DISP/2;
  if(dx*dx+dy*dy>(R*DISP/INT)**2)return;

  if(tStart===null){
    tStart=Date.now();
    startGameSession().catch(()=>{});
    document.getElementById('btnRestart').classList.remove('is-hidden');
    tInt=setInterval(()=>{
      if(!over&&tStart!==null)
        document.getElementById('sTime').textContent=fmtMM(Date.now()-tStart);
    },200);
  }

  clickTs.push(Date.now()); clicks++;
  const cps=getCPS(),mult=getMult(cps),dmg=Math.max(1,Math.ceil(mult));
  hp=Math.max(0,hp-dmg);

  refreshStats(cps,mult);
  spawnFloat(e.clientX-rect.left,e.clientY-rect.top,dmg,mult);
  if(mult>=4)spawnSparks(e.clientX-rect.left,e.clientY-rect.top,mult>=6?8:5);

  document.getElementById('hpFill').style.width=(hp/MAX_HP*100)+'%';
  document.getElementById('hpPct').textContent=Math.ceil(hp/MAX_HP*100)+'%';

  if(hp<=0)endGame();
  else{renderCookie(hp,false);if(hp/MAX_HP<0.2)shake();}
});

function refreshStats(cps,mult){
  document.getElementById('sClicks').textContent=String(clicks).padStart(4,'0');
  document.getElementById('sCps').textContent=cps.toFixed(1);
  const el=document.getElementById('sDmg');
  el.textContent='×'+mult.toFixed(1);
  el.classList.toggle('hot',mult>1);
  const tip=document.getElementById('tip');
  if(mult>=6){tip.textContent='🔥 FRENZY! ×6 DAMAGE! 🔥';tip.className='tip blink';tip.style.color='#FF3080';}
  else if(mult>=4){tip.textContent='⚡⚡ TURBO! ×4 damage!';tip.className='tip';tip.style.color='#FF6090';}
  else if(mult>=2.5){tip.textContent='⚡ fast clicks! ×2.5!';tip.className='tip';tip.style.color='#FF80A8';}
  else if(mult>1){tip.textContent='keep clicking faster!';tip.className='tip';tip.style.color='#C878F0';}
  else{tip.textContent='click the cookie!';tip.className='tip';tip.style.color='#C878F0';}
}

function spawnFloat(x,y,dmg,mult){
  const el=document.createElement('div');
  el.className='floaty';
  el.style.left=x+'px';el.style.top=(y-24)+'px';
  if(mult>=4){el.style.fontSize='14px';el.style.color='#FF3888';el.style.textShadow='2px 2px 0 #A00848';el.textContent=`-${dmg}!!`;}
  else if(mult>=2.5){el.style.fontSize='11px';el.style.color='#FFD030';el.style.textShadow='2px 2px 0 #906800';el.textContent=`-${dmg}!`;}
  else{el.style.fontSize='10px';el.style.color='#E8E0FF';el.style.textShadow='1px 1px 0 #7850C0';el.textContent=`-${dmg}`;}
  document.getElementById('wrap').appendChild(el);
  setTimeout(()=>el.remove(),750);
}

function spawnSparks(x,y,count){
  const pal=['#FFD040','#FF80C8','#80FFCC','#A0C8FF','#FF90A0','#D0A0FF'];
  for(let i=0;i<count;i++){
    const el=document.createElement('div');
    el.className='spark';
    const tx=(Math.random()-.5)*80,ty=(Math.random()-.5)*80-20;
    el.style.background=pal[Math.floor(Math.random()*pal.length)];
    el.style.left=x+'px';el.style.top=y+'px';
    document.getElementById('wrap').appendChild(el);
    el.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${tx}px,${ty}px)`,opacity:0}],
      {duration:550+Math.random()*200,easing:'ease-out',fill:'forwards'}).onfinish=()=>el.remove();
  }
}

function shake(){
  const w=document.getElementById('wrap');
  w.style.animation='none';void w.offsetWidth;
  w.style.animation='pixelShake 0.3s steps(4) 1';
}

// ═══════════════════════════════════════════════════════
// END / SUBMIT / RESET
// ═══════════════════════════════════════════════════════
async function endGame(){
  over=true;clearInterval(tInt);
  finalTimeMs=tStart?Date.now()-tStart:0;
  finalClicks=clicks;

  renderCookie(0,true);
  document.getElementById('hpFill').style.width='0%';
  document.getElementById('hpPct').textContent='0%';
  document.getElementById('sTime').textContent=fmtMM(finalTimeMs);
  document.getElementById('rClicks').textContent=String(finalClicks).padStart(4,'0');
  document.getElementById('rTime').textContent=fmtSec(finalTimeMs);

  const isNew=await wouldBeRecord(finalClicks);
  document.getElementById('newRecMsg').classList.toggle('is-hidden',!isNew);

  const inp=document.getElementById('nameInput');
  inp.value=localStorage.getItem('cookieCrumbler_lastName')||'';
  document.getElementById('overlay').classList.add('show');
  setTimeout(()=>inp.focus(),380);
}

async function submitScore(){
  const name=document.getElementById('nameInput').value;
  if(!isValidName(name)){
    document.getElementById('nameInput').classList.add('invalid');
    document.getElementById('nameError').classList.add('show');
    document.getElementById('nameInput').focus();
    return;
  }
  const savedName=cleanName(name);
  localStorage.setItem('cookieCrumbler_lastName',savedName);

  const btn=document.getElementById('btnSubmit');
  btn.textContent='SAVING...';btn.disabled=true;

  try{
    const token=await startGameSession();
    await addScore(savedName,finalClicks,finalTimeMs,token);
    await refreshLeaderboard();
  }catch{
    // save failed silently — still close overlay
  }

  btn.textContent='SUBMIT';btn.disabled=false;
  closeOverlayAndReset();
}

function skipAndReset(){ closeOverlayAndReset(); }

function closeOverlayAndReset(){
  document.getElementById('overlay').classList.remove('show');
  resetGame();
}

document.getElementById('nameInput').addEventListener('input',e=>{
  const bad=e.target.value.length>0&&!isValidName(e.target.value);
  e.target.classList.toggle('invalid',bad);
  document.getElementById('nameError').classList.toggle('show',bad);
});

document.getElementById('nameInput').addEventListener('keydown',e=>{
  if(e.key==='Enter')submitScore();
});

document.getElementById('btnRestart').addEventListener('click',resetGame);
document.getElementById('lbPrev').addEventListener('click',()=>lbPage(-1));
document.getElementById('lbNext').addEventListener('click',()=>lbPage(1));
document.getElementById('btnSubmit').addEventListener('click',submitScore);
document.querySelector('.btn-skip').addEventListener('click',skipAndReset);

function resetGame(){
  hp=MAX_HP;clicks=0;clickTs=[];over=false;tStart=null;
  gameToken=null;gameTokenPromise=null;
  clearInterval(tInt);tInt=null;
  document.getElementById('sClicks').textContent='0000';
  document.getElementById('sTime').textContent='00:00';
  document.getElementById('sCps').textContent='0.0';
  document.getElementById('sDmg').textContent='×1';
  document.getElementById('sDmg').classList.remove('hot');
  document.getElementById('hpFill').style.width='100%';
  document.getElementById('hpPct').textContent='100%';
  document.getElementById('tip').textContent='click the cookie!';
  document.getElementById('tip').className='tip';
  document.getElementById('tip').style.color='#C878F0';
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('btnRestart').classList.add('is-hidden');
  renderCookie(hp,false);
}

// ── Idle CPS refresh ──────────────────────────────────
setInterval(()=>{
  if(over)return;
  const cps=getCPS(),mult=getMult(cps);
  document.getElementById('sCps').textContent=cps.toFixed(1);
  const el=document.getElementById('sDmg');
  el.textContent='×'+mult.toFixed(1);el.classList.toggle('hot',mult>1);
  if(cps===0){
    document.getElementById('tip').textContent='click the cookie!';
    document.getElementById('tip').className='tip';
    document.getElementById('tip').style.color='#C878F0';
  }
},250);

// ── Init ──────────────────────────────────────────────
hp=MAX_HP;clicks=0;clickTs=[];over=false;tStart=null;tInt=null;
refreshLeaderboard();
renderCookie(hp,false);
