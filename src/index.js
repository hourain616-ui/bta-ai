const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SYMBOLS = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD"
];

const TF_MAP = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS
    }
  });
}

function sma(values, n) {
  if (values.length < n) return null;

  let sum = 0;

  for (let i = values.length - n; i < values.length; i++) {
    sum += values[i];
  }

  return sum / n;
}

function ema(values, n) {
  if (values.length < n) return null;

  const k = 2 / (n + 1);

  let e =
    values
      .slice(0, n)
      .reduce((a, b) => a + b, 0) / n;

  for (let i = n; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }

  return e;
}

function rsi(values, n = 14) {
  if (values.length < n + 1) return null;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];

    if (d >= 0) {
      gain += d;
    } else {
      loss -= d;
    }
  }

  let avgGain = gain / n;
  let avgLoss = loss / n;

  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];

    avgGain =
      (avgGain * (n - 1) + Math.max(d, 0)) / n;

    avgLoss =
      (avgLoss * (n - 1) + Math.max(-d, 0)) / n;
  }

  if (avgLoss === 0) return 100;

  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(rows, n = 14) {
  if (rows.length < n + 1) return null;

  const tr = [];

  for (let i = 1; i < rows.length; i++) {
    const high = rows[i].high;
    const low = rows[i].low;
    const previousClose = rows[i - 1].close;

    tr.push(
      Math.max(
        high - low,
        Math.abs(high - previousClose),
        Math.abs(low - previousClose)
      )
    );
  }

  return sma(tr, n);
}

function analyze(rows, symbol, timeframe) {
  const closes = rows.map(x => x.close);

  const last = rows[rows.length - 1];
  const price = last.close;

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);

  const rsi14 = rsi(closes, 14);
  const atr14 = atr(rows, 14);

  let score = 50;
  const reasons = [];

  if (ema20 && ema50) {
    if (ema20 > ema50) {
      score += 12;
      reasons.push("EMA20 above EMA50");
    } else {
      score -= 12;
      reasons.push("EMA20 below EMA50");
    }
  }

  if (ema50 && ema200) {
    if (ema50 > ema200) {
      score += 15;
      reasons.push("EMA50 above EMA200");
    } else {
      score -= 15;
      reasons.push("EMA50 below EMA200");
    }
  }

  if (rsi14 !== null) {
    if (rsi14 >= 52 && rsi14 <= 70) {
      score += 8;
      reasons.push("RSI supports bullish momentum");
    } else if (rsi14 <= 48 && rsi14 >= 30) {
      score -= 8;
      reasons.push("RSI supports bearish momentum");
    } else if (rsi14 > 70) {
      reasons.push("RSI is overbought");
    } else if (rsi14 < 30) {
      reasons.push("RSI is oversold");
    }
  }

  if (ema20 && price > ema20) {
    score += 5;
    reasons.push("Price above EMA20");
  }

  if (ema20 && price < ema20) {
    score -= 5;
    reasons.push("Price below EMA20");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const signal =
    score >= 72
      ? "STRONG BUY"
      : score >= 58
      ? "BUY"
      : score <= 28
      ? "STRONG SELL"
      : score <= 42
      ? "SELL"
      : "WAIT";

  const risk = Math.max(
    atr14 || price * 0.002,
    price * 0.0005
  );

  let entry = price;
  let stopLoss = null;
  let takeProfit1 = null;
  let takeProfit2 = null;
  let takeProfit3 = null;

  if (signal.includes("BUY")) {
    stopLoss = price - risk;
    takeProfit1 = price + risk * 1.5;
    takeProfit2 = price + risk * 2.5;
    takeProfit3 = price + risk * 3.5;
  }

  if (signal.includes("SELL")) {
    stopLoss = price + risk;
    takeProfit1 = price - risk * 1.5;
    takeProfit2 = price - risk * 2.5;
    takeProfit3 = price - risk * 3.5;
  }

  return {
    symbol,
    timeframe,
    price,

    indicators: {
      ema20,
      ema50,
      ema200,
      rsi14,
      atr14
    },

    signal,
    confidence: score,

    entry,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,

    riskReward: stopLoss ? 1.5 : null,

    reasons
  };
}

async function td(url, env) {
  if (!env.TWELVE_DATA_API_KEY) {
    throw new Error(
      "TWELVE_DATA_API_KEY is not configured"
    );
  }

  const u = new URL(url);

  u.searchParams.set(
    "apikey",
    env.TWELVE_DATA_API_KEY
  );

  const response = await fetch(u.toString());
  const data = await response.json();

  if (!response.ok || data.status === "error") {
    throw new Error(
      data.message ||
      "Market data request failed"
    );
  }

  return data;
}

async function candles(symbol, timeframe, env) {
  const interval =
    TF_MAP[timeframe] || "5min";

  const pair =
    symbol === "XAUUSD"
      ? "XAU/USD"
      : symbol.slice(0, 3) +
        "/" +
        symbol.slice(3);

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${encodeURIComponent(pair)}` +
    `&interval=${interval}` +
    `&outputsize=250` +
    `&format=JSON`;

  const data = await td(url, env);

  if (!data.values) {
    throw new Error(
      "No market data returned"
    );
  }

  return data.values.reverse().map(v => ({
    time: v.datetime,
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    close: Number(v.close),
    volume: Number(v.volume || 0)
  }));
}function cleanJsonText(text) {
  const cleaned = String(text || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Gemini returned invalid analysis");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyzeChartImage(image, mimeType, env) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  if (!image || !mimeType) {
    throw new Error("Chart image is required");
  }

  if (!/^image\/(png|jpeg|webp|jpg)$/.test(mimeType)) {
    throw new Error(
      "Only PNG, JPEG or WEBP images are supported"
    );
  }

  const prompt = `
You are an advanced technical chart analyst.

Carefully analyze the uploaded trading chart screenshot.

Look for:
- Market structure
- Trend direction
- Support and resistance
- Candlestick behavior
- Chart patterns
- Visible indicators
- Momentum
- Possible entry
- Stop loss
- Take profit levels

Return ONLY valid JSON using exactly this structure:

{
  "signal": "BUY or SELL or WAIT",
  "confidence": 0,
  "entry": null,
  "stopLoss": null,
  "takeProfit1": null,
  "takeProfit2": null,
  "takeProfit3": null,
  "pattern": "",
  "trend": "",
  "reasons": []
}

Rules:
- confidence must be an integer from 0 to 100.
- Do not invent prices that cannot reasonably be read from the chart.
- If a price level cannot be determined reliably, use null.
- reasons must contain short explanations.
- Do not invent indicators that are not visible.
- Signal must be BUY, SELL or WAIT.
- This is technical analysis, not a guarantee of future price movement.
`;

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

  const response = await fetch(endpoint, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },

    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: image
              }
            }
          ]
        }
      ],

      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Gemini chart analysis failed"
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("") || "";

  const result = cleanJsonText(text);

  return {
    ok: true,

    analysis: {
      signal:
        result.signal || "WAIT",

      confidence:
        Number.isFinite(
          Number(result.confidence)
        )
          ? Math.max(
              0,
              Math.min(
                100,
                Number(result.confidence)
              )
            )
          : 0,

      entry:
        result.entry ?? null,

      stopLoss:
        result.stopLoss ?? null,

      takeProfit1:
        result.takeProfit1 ?? null,

      takeProfit2:
        result.takeProfit2 ?? null,

      takeProfit3:
        result.takeProfit3 ?? null,

      pattern:
        result.pattern ||
        "Not clearly identified",

      trend:
        result.trend ||
        "Not clearly identified",

      reasons:
        Array.isArray(result.reasons)
          ? result.reasons
          : []
    }
  };
}

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: CORS
      });
    }

    const url = new URL(request.url);

    try {

      if (
        url.pathname === "/api/health"
      ) {
        return json({
          ok: true,
          app: env.APP_NAME || "BTA AI",
          symbols: SYMBOLS
        });
      }

      if (
        url.pathname === "/api/market"
      ) {

        const symbol =
          (
            url.searchParams.get("symbol") ||
            "XAUUSD"
          ).toUpperCase();

        const timeframe =
          url.searchParams.get(
            "timeframe"
          ) || "5m";

        const rows =
          await candles(
            symbol,
            timeframe,
            env
          );

        return json({
          ok: true,
          candles: rows,
          analysis: analyze(
            rows,
            symbol,
            timeframe
          )
        });
      }

      if (
        url.pathname === "/api/scanner"
      ) {

        const timeframe =
          url.searchParams.get(
            "timeframe"
          ) || "15m";

        const results = [];

        for (const symbol of SYMBOLS) {

          try {

            const rows =
              await candles(
                symbol,
                timeframe,
                env
              );

            results.push(
              analyze(
                rows,
                symbol,
                timeframe
              )
            );

          } catch (error) {

            results.push({
              symbol,
              error: error.message
            });

          }
        }

        results.sort(
          (a, b) =>
            (b.confidence || 0) -
            (a.confidence || 0)
        );

        return json({
          ok: true,
          timeframe,
          results
        });
      }

      if (
        url.pathname === "/api/chart-analyze" &&
        request.method === "POST"
      ) {

        const body =
          await request.json();

        return json(
          await analyzeChartImage(
            body.image,
            body.mimeType,
            env
          )
        );
      }

      return env.ASSETS.fetch(request);

    } catch (error) {

      return json(
        {
          ok: false,
          error: error.message
        },
        500
      );
    }
  }
};
