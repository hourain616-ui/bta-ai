const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SYMBOLS = [
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY",
  "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"
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

const GEMINI_MODEL = "gemini-2.5-flash";

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
    values.slice(0, n).reduce((a, b) => a + b, 0) / n;

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

    if (d >= 0) gain += d;
    else loss -= d;
  }

  let avgGain = gain / n;
  let avgLoss = loss / n;

  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];

    avgGain =
      ((avgGain * (n - 1)) + Math.max(d, 0)) / n;

    avgLoss =
      ((avgLoss * (n - 1)) + Math.max(-d, 0)) / n;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;

  return 100 - (100 / (1 + rs));
}

function atr(rows, n = 14) {
  if (rows.length < n + 1) return null;

  const tr = [];

  for (let i = 1; i < rows.length; i++) {
    const h = rows[i].high;
    const l = rows[i].low;
    const pc = rows[i - 1].close;

    tr.push(
      Math.max(
        h - l,
        Math.abs(h - pc),
        Math.abs(l - pc)
      )
    );
  }

  return sma(tr, n);
}

function roundPrice(value) {
  if (value === null || value === undefined) return null;

  if (!Number.isFinite(value)) return null;

  return Number(value.toFixed(6));
}

function detectStructure(rows) {
  if (rows.length < 20) {
    return {
      trend: "UNKNOWN",
      structure: "INSUFFICIENT_DATA"
    };
  }

  const recent = rows.slice(-20);

  const highs = recent.map(x => x.high);
  const lows = recent.map(x => x.low);

  const previousHigh = Math.max(...highs.slice(0, 10));
  const recentHigh = Math.max(...highs.slice(10));

  const previousLow = Math.min(...lows.slice(0, 10));
  const recentLow = Math.min(...lows.slice(10));

  if (
    recentHigh > previousHigh &&
    recentLow > previousLow
  ) {
    return {
      trend: "BULLISH",
      structure: "HIGHER_HIGH_HIGHER_LOW"
    };
  }

  if (
    recentHigh < previousHigh &&
    recentLow < previousLow
  ) {
    return {
      trend: "BEARISH",
      structure: "LOWER_HIGH_LOWER_LOW"
    };
  }

  return {
    trend: "RANGE",
    structure: "MIXED"
  };
}

function detectLevels(rows) {
  if (!rows.length) {
    return {
      support: null,
      resistance: null
    };
  }

  const recent = rows.slice(-50);

  const support = Math.min(...recent.map(x => x.low));
  const resistance = Math.max(...recent.map(x => x.high));

  return {
    support: roundPrice(support),
    resistance: roundPrice(resistance)
  };
}

function technicalAnalysis(rows, symbol, timeframe) {
  if (!rows || rows.length < 50) {
    throw new Error("Not enough candle data for analysis");
  }

  const closes = rows.map(x => x.close);

  const last = rows[rows.length - 1];

  const price = last.close;

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);

  const rsi14 = rsi(closes, 14);
  const atr14 = atr(rows, 14);

  const structure = detectStructure(rows);
  const levels = detectLevels(rows);

  let score = 50;
  const reasons = [];

  if (ema20 !== null && ema50 !== null) {
    if (ema20 > ema50) {
      score += 12;
      reasons.push("EMA20 above EMA50");
    } else {
      score -= 12;
      reasons.push("EMA20 below EMA50");
    }
  }

  if (ema50 !== null && ema200 !== null) {
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
      reasons.push("RSI bullish momentum");
    } else if (rsi14 <= 48 && rsi14 >= 30) {
      score -= 8;
      reasons.push("RSI bearish momentum");
    } else if (rsi14 > 70) {
      reasons.push("RSI overbought");
    } else if (rsi14 < 30) {
      reasons.push("RSI oversold");
    }
  }

  if (ema20 !== null) {
    if (price > ema20) {
      score += 5;
      reasons.push("Price above EMA20");
    } else {
      score -= 5;
      reasons.push("Price below EMA20");
    }
  }

  if (structure.trend === "BULLISH") {
    score += 8;
    reasons.push("Bullish market structure");
  }

  if (structure.trend === "BEARISH") {
    score -= 8;
    reasons.push("Bearish market structure");
  }

  score = Math.max(
    0,
    Math.min(100, Math.round(score))
  );

  let signal = "WAIT";

  if (score >= 75) signal = "STRONG BUY";
  else if (score >= 60) signal = "BUY";
  else if (score <= 25) signal = "STRONG SELL";
  else if (score <= 40) signal = "SELL";

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

  const riskReward =
    stopLoss !== null && takeProfit1 !== null
      ? Math.abs(takeProfit1 - entry) /
        Math.abs(entry - stopLoss)
      : null;

  return {
    symbol,
    timeframe,
    price: roundPrice(price),

    indicators: {
      ema20: roundPrice(ema20),
      ema50: roundPrice(ema50),
      ema200: roundPrice(ema200),
      rsi14: roundPrice(rsi14),
      atr14: roundPrice(atr14)
    },

    marketStructure: structure,

    levels,

    signal,
    confidence: score,

    entry: roundPrice(entry),
    stopLoss: roundPrice(stopLoss),
    takeProfit1: roundPrice(takeProfit1),
    takeProfit2: roundPrice(takeProfit2),
    takeProfit3: roundPrice(takeProfit3),

    riskReward:
      riskReward !== null
        ? Number(riskReward.toFixed(2))
        : null,

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
  if (!SYMBOLS.includes(symbol)) {
    throw new Error(
      `Unsupported symbol: ${symbol}`
    );
  }

  if (!TF_MAP[timeframe]) {
    throw new Error(
      `Unsupported timeframe: ${timeframe}`
    );
  }

  const interval = TF_MAP[timeframe];

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

  if (!data.values || !Array.isArray(data.values)) {
    throw new Error(
      "No market data returned"
    );
  }

  const rows = data.values
    .slice()
    .reverse()
    .map(v => ({
      time: v.datetime,
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: Number(v.volume || 0)
    }));

  const invalid = rows.some(
    x =>
      !Number.isFinite(x.open) ||
      !Number.isFinite(x.high) ||
      !Number.isFinite(x.low) ||
      !Number.isFinite(x.close)
  );

  if (invalid) {
    throw new Error(
      "Invalid candle data received"
    );
  }

  return rows;
}

function buildGeminiPayload(
  rows,
  analysis
) {
  const recentCandles = rows
    .slice(-30)
    .map(c => ({
      time: c.time,
      open: roundPrice(c.open),
      high: roundPrice(c.high),
      low: roundPrice(c.low),
      close: roundPrice(c.close),
      volume: c.volume
    }));

  return {
    market: {
      symbol: analysis.symbol,
      timeframe: analysis.timeframe,
      price: analysis.price
    },

    indicators: analysis.indicators,

    marketStructure:
      analysis.marketStructure,

    supportResistance:
      analysis.levels,

    technicalSignal: {
      signal: analysis.signal,
      confidence: analysis.confidence,
      reasons: analysis.reasons
    },

    recentCandles
  };
}

async function geminiAnalyze(
  payload,
  env
) {
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured"
    );
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/` +
    `models/${GEMINI_MODEL}:generateContent`;

  const schema = {
    type: "OBJECT",
    properties: {
      signal: {
        type: "STRING",
        enum: [
          "STRONG BUY",
          "BUY",
          "WAIT",
          "SELL",
          "STRONG SELL"
        ]
      },

      confidence: {
        type: "INTEGER",
        minimum: 0,
        maximum: 100
      },

      entry: {
        type: ["NUMBER", "NULL"]
      },

      stopLoss: {
        type: ["NUMBER", "NULL"]
      },

      takeProfit1: {
        type: ["NUMBER", "NULL"]
      },

      takeProfit2: {
        type: ["NUMBER", "NULL"]
      },

      takeProfit3: {
        type: ["NUMBER", "NULL"]
      },

      marketBias: {
        type: "STRING"
      },

      setupQuality: {
        type: "STRING",
        enum: [
          "HIGH",
          "MEDIUM",
          "LOW"
        ]
      },

      reasons: {
        type: "ARRAY",
        items: {
          type: "STRING"
        }
      },

      warning: {
        type: "STRING"
      }
    },

    required: [
      "signal",
      "confidence",
      "entry",
      "stopLoss",
      "takeProfit1",
      "takeProfit2",
      "takeProfit3",
      "marketBias",
      "setupQuality",
      "reasons",
      "warning"
    ]
  };

  const prompt = `
You are the AI confirmation engine for a trading-analysis system.

Analyze the supplied market data objectively.

Rules:

1. Do NOT invent market data.
2. Do NOT guarantee profit or accuracy.
3. If the setup is unclear, conflicting, overextended,
   or lacks confirmation, return WAIT.
4. Only return BUY when bullish evidence is sufficiently
   stronger than bearish evidence.
5. Only return SELL when bearish evidence is sufficiently
   stronger than bullish evidence.
6. STRONG BUY and STRONG SELL require strong multi-factor
   confirmation.
7. Respect the supplied current price.
8. Entry, stop loss and take-profit levels must be realistic
   relative to ATR and current market structure.
9. Do not use confidence above 90 unless several independent
   factors strongly agree.
10. Keep the reasons concise.
11. This is analysis, not financial advice.

Pay special attention to:

- EMA alignment
- RSI
- ATR
- market structure
- support/resistance
- recent candle behavior
- momentum
- trend consistency

Return ONLY the requested JSON object.

MARKET DATA:
${JSON.stringify(payload)}
`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],

    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  };

  const response = await fetch(
    endpoint,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },

      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Gemini API request failed"
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error(
      "Gemini returned an empty response"
    );
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON"
    );
  }

  return result;
}

function validateGeminiResult(result, fallback) {
  const allowed = [
    "STRONG BUY",
    "BUY",
    "WAIT",
    "SELL",
    "STRONG SELL"
  ];

  if (
    !result ||
    !allowed.includes(result.signal)
  ) {
    return {
      ...fallback,
      ai: {
        enabled: false,
        error: "Invalid Gemini signal"
      }
    };
  }

  const confidence = Math.max(
    0,
    Math.min(
      100,
      Number(result.confidence) || 0
    )
  );

  return {
    ...fallback,

    signal: result.signal,
    confidence,

    entry:
      result.entry !== null
        ? roundPrice(Number(result.entry))
        : fallback.entry,

    stopLoss:
      result.stopLoss !== null
        ? roundPrice(Number(result.stopLoss))
        : fallback.stopLoss,

    takeProfit1:
      result.takeProfit1 !== null
        ? roundPrice(Number(result.takeProfit1))
        : fallback.takeProfit1,

    takeProfit2:
      result.takeProfit2 !== null
        ? roundPrice(Number(result.takeProfit2))
        : fallback.takeProfit2,

    takeProfit3:
      result.takeProfit3 !== null
        ? roundPrice(Number(result.takeProfit3))
        : fallback.takeProfit3,

    ai: {
      enabled: true,
      model: GEMINI_MODEL,
      marketBias: result.marketBias || "UNKNOWN",
      setupQuality: result.setupQuality || "LOW",
      reasons: Array.isArray(result.reasons)
        ? result.reasons.slice(0, 8)
        : [],
      warning: result.warning || ""
    }
  };
}

async function fullAnalysis(
  rows,
  symbol,
  timeframe,
  env
) {
  const technical =
    technicalAnalysis(
      rows,
      symbol,
      timeframe
    );

  const payload =
    buildGeminiPayload(
      rows,
      technical
    );

  try {
    const ai =
      await geminiAnalyze(
        payload,
        env
      );

    return validateGeminiResult(
      ai,
      technical
    );
  } catch (error) {
    return {
      ...technical,

      ai: {
        enabled: false,
        model: GEMINI_MODEL,
        error: error.message
      }
    };
  }
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
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          app: env.APP_NAME || "BTA AI",
          symbols: SYMBOLS,
          geminiConfigured:
            Boolean(env.GEMINI_API_KEY),
          twelveDataConfigured:
            Boolean(env.TWELVE_DATA_API_KEY)
        });
      }

      if (url.pathname === "/api/market") {
        const symbol =
          (
            url.searchParams.get("symbol") ||
            "XAUUSD"
          ).toUpperCase();

        const timeframe =
          url.searchParams.get("timeframe") ||
          "5m";

        const rows =
          await candles(
            symbol,
            timeframe,
            env
          );

        const analysis =
          await fullAnalysis(
            rows,
            symbol,
            timeframe,
            env
          );

        return json({
          ok: true,
          candles: rows,
          analysis
        });
      }

      if (url.pathname === "// ... upar wala code

if (url.pathname === "/api/chart-analyze") {
  if (request.method !== "POST") {
    return json({ ok: false, error: "POST required" }, 405);
  }

  try {
    const body = await request.json();

    if (!body.image || !body.mimeType) {
      return json({
        ok: false,
        error: "Chart image is required"
      }, 400);
    }

    if (!env.GEMINI_API_KEY) {
      return json({
        ok: false,
        error: "GEMINI_API_KEY is not configured"
      }, 500);
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Analyze this trading chart. Return ONLY valid JSON with:
trend, structure, momentum, support, resistance, signal, confidence, entry, stop_loss, tp1, tp2, tp3.
Signal must be BUY, SELL, or WAIT. Do not guarantee profit.`
              },
              {
                inline_data: {
                  mime_type: body.mimeType,
                  data: body.image
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return json({
        ok: false,
        error: data?.error?.message || "Gemini analysis failed"
      }, 500);
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("")
      .trim();

    if (!text) {
      return json({
        ok: false,
        error: "Gemini returned empty analysis"
      }, 500);
    }

    return json({
      ok: true,
      analysis: JSON.parse(text)
    });

  } catch (error) {
    return json({
      ok: false,
      error: error.message || "Chart analysis failed"
    }, 500);
  }
}

// ISKE BAAD:
if (url.pathname === "/api/scanner") {
  // existing scanner code
}/api/scanner") {
        const timeframe =
          url.searchParams.get("timeframe") ||
          "15m";

        if (!TF_MAP[timeframe]) {
          return json(
            {
              ok: false,
              error:
                `Unsupported timeframe: ${timeframe}`
            },
            400
          );
        }

        const results =
          await Promise.all(
            SYMBOLS.map(
              async symbol => {
                try {
                  const rows =
                    await candles(
                      symbol,
                      timeframe,
                      env
                    );

                  const analysis =
                    await fullAnalysis(
                      rows,
                      symbol,
                      timeframe,
                      env
                    );

                  return analysis;
                } catch (error) {
                  return {
                    symbol,
                    timeframe,
                    error: error.message
                  };
                }
              }
            )
          );

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

