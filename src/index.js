const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const SYMBOLS = ["XAUUSD","EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"];
const TF_MAP = {"1m":"1min","5m":"5min","15m":"15min","30m":"30min","1h":"1h","4h":"4h","1d":"1day"};

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"Content-Type":"application/json", ...CORS}
  });
}

function sma(values, n) {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length-n; i < values.length; i++) s += values[i];
  return s/n;
}

function ema(values, n) {
  if (values.length < n) return null;
  const k = 2/(n+1);
  let e = values.slice(0,n).reduce((a,b)=>a+b,0)/n;
  for (let i=n;i<values.length;i++) e = values[i]*k + e*(1-k);
  return e;
}

function rsi(values, n=14) {
  if (values.length < n+1) return null;
  let gain=0, loss=0;
  for(let i=1;i<=n;i++){
    const d=values[i]-values[i-1];
    if(d>=0) gain+=d; else loss-=d;
  }
  let ag=gain/n, al=loss/n;
  for(let i=n+1;i<values.length;i++){
    const d=values[i]-values[i-1];
    ag=((ag*(n-1)) + Math.max(d,0))/n;
    al=((al*(n-1)) + Math.max(-d,0))/n;
  }
  if(al===0) return 100;
  return 100-(100/(1+ag/al));
}

function atr(rows, n=14) {
  if(rows.length < n+1) return null;
  const tr=[];
  for(let i=1;i<rows.length;i++){
    const h=rows[i].high, l=rows[i].low, pc=rows[i-1].close;
    tr.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  return sma(tr,n);
}

function analyze(rows, symbol, timeframe) {
  const closes=rows.map(x=>x.close);
  const last=rows[rows.length-1];
  const price=last.close;
  const e20=ema(closes,20), e50=ema(closes,50), e200=ema(closes,200);
  const rv=rsi(closes,14), av=atr(rows,14);

  let score=50, reasons=[];
  if(e20 && e50){
    if(e20>e50){score+=12; reasons.push("EMA20 above EMA50");}
    else {score-=12; reasons.push("EMA20 below EMA50");}
  }
  if(e50 && e200){
    if(e50>e200){score+=15; reasons.push("EMA50 above EMA200");}
    else {score-=15; reasons.push("EMA50 below EMA200");}
  }
  if(rv!==null){
    if(rv>=52 && rv<=70){score+=8; reasons.push("RSI supports bullish momentum");}
    else if(rv<=48 && rv>=30){score-=8; reasons.push("RSI supports bearish momentum");}
    else if(rv>70){reasons.push("RSI is overbought");}
    else if(rv<30){reasons.push("RSI is oversold");}
  }
  if(e20 && price>e20){score+=5; reasons.push("Price above EMA20");}
  if(e20 && price<e20){score-=5; reasons.push("Price below EMA20");}

  score=Math.max(0,Math.min(100,Math.round(score)));
  const signal=score>=72?"STRONG BUY":score>=58?"BUY":score<=28?"STRONG SELL":score<=42?"SELL":"WAIT";

  const risk=Math.max(av || price*0.002, price*0.0005);
  let entry=price, sl, tp1, tp2, tp3;
  if(signal.includes("BUY")){
    sl=price-risk; tp1=price+risk*1.5; tp2=price+risk*2.5; tp3=price+risk*3.5;
  } else if(signal.includes("SELL")){
    sl=price+risk; tp1=price-risk*1.5; tp2=price-risk*2.5; tp3=price-risk*3.5;
  }

  return {
    symbol,timeframe,price,
    indicators:{ema20:e20,ema50:e50,ema200:e200,rsi14:rv,atr14:av},
    signal, confidence:score,
    entry, stopLoss:sl, takeProfit1:tp1, takeProfit2:tp2, takeProfit3:tp3,
    riskReward: sl ? 1.5 : null,
    reasons
  };
}

async function td(url, env) {
  if(!env.TWELVE_DATA_API_KEY) throw new Error("TWELVE_DATA_API_KEY is not configured");
  const u=new URL(url);
  u.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);
  const r=await fetch(u.toString());
  const data=await r.json();
  if(!r.ok || data.status==="error") throw new Error(data.message || "Market data request failed");
  return data;
}

async function candles(symbol, timeframe, env) {
  const interval=TF_MAP[timeframe] || "5min";
  const pair = symbol==="XAUUSD" ? "XAU/USD" : symbol.slice(0,3)+"/"+symbol.slice(3);
  const url=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=${interval}&outputsize=250&format=JSON`;
  const data=await td(url,env);
  if(!data.values) throw new Error("No market data returned");
  return data.values.reverse().map(v=>({
    time:v.datetime,
    open:Number(v.open), high:Number(v.high), low:Number(v.low), close:Number(v.close), volume:Number(v.volume||0)
  }));
}

export default {
  async fetch(request, env) {
    if(request.method==="OPTIONS") return new Response(null,{headers:CORS});
    const url=new URL(request.url);
    try {
      if(url.pathname==="/api/health") return json({ok:true,app:env.APP_NAME||"BTA AI",symbols:SYMBOLS});
      if(url.pathname==="/api/market"){
        const symbol=(url.searchParams.get("symbol")||"XAUUSD").toUpperCase();
        const timeframe=url.searchParams.get("timeframe")||"5m";
        const rows=await candles(symbol,timeframe,env);
        return json({ok:true,candles:rows,analysis:analyze(rows,symbol,timeframe)});
      }
      if(url.pathname==="/api/scanner"){
        const timeframe=url.searchParams.get("timeframe")||"15m";
        const results=[];
        for(const s of SYMBOLS){
          try{
            const rows=await candles(s,timeframe,env);
            results.push(analyze(rows,s,timeframe));
          }catch(e){ results.push({symbol:s,error:e.message}); }
        }
        results.sort((a,b)=>(b.confidence||0)-(a.confidence||0));
        return json({ok:true,timeframe,results});
      }
      return env.ASSETS.fetch(request);
    } catch(e) {
      return json({ok:false,error:e.message},500);
    }
  }
};
