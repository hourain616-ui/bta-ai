const $=id=>document.getElementById(id);
const fmt=n=>n==null?"--":Number(n).toLocaleString(undefined,{maximumFractionDigits:5});
function showPage(page){
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  $(page).classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  const titles={dashboard:"Market Analysis",scanner:"Market Scanner",chart:"Chart Analyzer",journal:"Trade Journal",news:"News & Macro",settings:"Settings"};
  $("title").textContent=titles[page];
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showPage(b.dataset.page));

function draw(candles){
  const cv=$("chartCanvas"), ctx=cv.getContext("2d");
  const dpr=devicePixelRatio||1, w=cv.clientWidth, h=cv.clientHeight;
  cv.width=w*dpr; cv.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  if(!candles?.length)return;
  const vals=candles.map(x=>x.close), min=Math.min(...vals), max=Math.max(...vals);
  const pad=20, scale=(h-pad*2)/(max-min||1);
  ctx.beginPath();
  vals.forEach((v,i)=>{const x=pad+i*(w-pad*2)/(vals.length-1);const y=h-pad-(v-min)*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.strokeStyle="#19d5b0";ctx.lineWidth=2;ctx.stroke();
}

async function analyze(){
  $("status").textContent="Scanning live market data…";
  try{
    const r=await fetch(`/api/market?symbol=${$("symbol").value}&timeframe=${$("tf").value}`);
    const d=await r.json(); if(!d.ok)throw Error(d.error);
    const a=d.analysis, i=a.indicators;
    $("price").textContent=fmt(a.price);
    $("rsi").textContent=fmt(i.rsi14);
    $("confidence").textContent=`${a.confidence}/100`;
    $("trend").textContent=i.ema20&&i.ema50?(i.ema20>i.ema50?"BULLISH":"BEARISH"):"--";
    $("signal").textContent=a.signal;
    $("reason").textContent=a.reasons.join(" • ");
    $("entry").textContent=fmt(a.entry); $("sl").textContent=fmt(a.stopLoss);
    $("tp1").textContent=fmt(a.takeProfit1); $("tp2").textContent=fmt(a.takeProfit2); $("tp3").textContent=fmt(a.takeProfit3);
    draw(d.candles); $("status").textContent="Live analysis updated";
  }catch(e){$("status").textContent=e.message}
}
$("analyze").onclick=analyze;

$("scan").onclick=async()=>{
  $("scanout").innerHTML="<p>Scanning…</p>";
  try{
    const d=await (await fetch(`/api/scanner?timeframe=${$("tf").value}`)).json();
    $("scanout").innerHTML=d.results.map(x=>`<div class="scanrow"><b>${x.symbol}</b><span>${x.signal||"ERROR"}</span><span>${x.confidence??"--"}/100</span><span>${x.price?fmt(x.price):x.error}</span></div>`).join("");
  }catch(e){$("scanout").textContent=e.message}
};
analyze();
