const $ = id => document.getElementById(id);

const fmt = n => {
  if (n === null || n === undefined || n === "") return "--";

  const num = Number(n);

  if (!Number.isFinite(num)) return "--";

  return num.toLocaleString(undefined, {
    maximumFractionDigits: 5
  });
};


function showPage(page) {

  document.querySelectorAll(".page").forEach(x => {
    x.classList.add("hidden");
  });

  const target = $(page);

  if (target) {
    target.classList.remove("hidden");
  }

  document.querySelectorAll(".nav").forEach(x => {

    x.classList.toggle(
      "active",
      x.dataset.page === page
    );

  });

  const titles = {
    dashboard: "Market Analysis",
    scanner: "Market Scanner",
    chart: "Chart Analyzer",
    journal: "Trade Journal",
    news: "News & Macro",
    settings: "Settings"
  };

  if ($("title")) {
    $("title").textContent =
      titles[page] || "BTA AI";
  }
}


document.querySelectorAll(".nav").forEach(button => {

  button.onclick = () => {
    showPage(button.dataset.page);
  };

});


function draw(candles) {

  const canvas = $("chartCanvas");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const dpr =
    window.devicePixelRatio || 1;

  const width =
    canvas.clientWidth || 600;

  const height =
    canvas.clientHeight || 350;

  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  if (!candles || !candles.length) {
    return;
  }

  const values =
    candles.map(x =>
      Number(x.close)
    );

  const min =
    Math.min(...values);

  const max =
    Math.max(...values);

  const padding = 20;

  const scale =
    (height - padding * 2) /
    (max - min || 1);

  ctx.beginPath();

  values.forEach(
    (value, index) => {

      const x =
        padding +
        index *
        (
          (width - padding * 2) /
          Math.max(
            values.length - 1,
            1
          )
        );

      const y =
        height -
        padding -
        (value - min) * scale;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

    }
  );

  ctx.strokeStyle =
    "#19d5b0";

  ctx.lineWidth = 2;

  ctx.stroke();
}


async function analyze() {

  if (!$("status")) return;

  $("status").textContent =
    "Scanning live market data…";

  try {

    const symbol =
      $("symbol").value;

    const timeframe =
      $("tf").value;

    const response =
      await fetch(
        `/api/market?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
      );

    const data =
      await response.json();

    if (!data.ok) {

      throw new Error(
        data.error ||
        "Market analysis failed"
      );

    }

    const analysis =
      data.analysis || {};

    const indicators =
      analysis.indicators || {};

    $("price").textContent =
      fmt(analysis.price);

    $("rsi").textContent =
      fmt(indicators.rsi14);

    $("confidence").textContent =
      `${analysis.confidence ?? 0}/100`;

    if (
      indicators.ema20 &&
      indicators.ema50
    ) {

      $("trend").textContent =
        indicators.ema20 >
        indicators.ema50
          ? "BULLISH"
          : "BEARISH";

    } else {

      $("trend").textContent =
        "--";

    }

    $("signal").textContent =
      analysis.signal ||
      "WAIT";

    $("reason").textContent =
      Array.isArray(
        analysis.reasons
      )
        ? analysis.reasons.join(" • ")
        : "";

    $("entry").textContent =
      fmt(analysis.entry);

    $("sl").textContent =
      fmt(analysis.stopLoss);

    $("tp1").textContent =
      fmt(analysis.takeProfit1 ?? analysis.tp1);

    $("tp2").textContent =
      fmt(analysis.takeProfit2 ?? analysis.tp2);

    $("tp3").textContent =
      fmt(analysis.takeProfit3 ?? analysis.tp3);

    draw(data.candles);

    $("status").textContent =
      "Live analysis updated";

  } catch (error) {

    $("status").textContent =
      error.message ||
      "Analysis failed";

  }
}


if ($("analyze")) {
  $("analyze").onclick =
    analyze;
}


if ($("scan")) {

  $("scan").onclick =
    async () => {

      $("scanout").innerHTML =
        "<p>🔍 Scanning all markets…</p>";

      try {

        const timeframe =
          $("tf").value;

        const response =
          await fetch(
            `/api/scanner?timeframe=${encodeURIComponent(timeframe)}`
          );

        const data =
          await response.json();

        if (!data.ok) {

          throw new Error(
            data.error ||
            "Scanner failed"
          );

        }

        $("scanout").innerHTML =
          data.results
            .map(item => {

              let direction =
                "WAIT";

              if (
                item.signal &&
                item.signal.includes("BUY")
              ) {
                direction =
                  "⬆ UP";
              }

              if (
                item.signal &&
                item.signal.includes("SELL")
              ) {
                direction =
                  "⬇ DOWN";
              }

              return `
                <div class="scanrow">

                  <b>${item.symbol}</b>

                  <span>
                    ${direction}
                  </span>

                  <span>
                    ${item.signal || "WAIT"}
                  </span>

                  <span>
                    ${item.confidence ?? "--"}/100
                  </span>

                  <span>
                    ${
                      item.price
                        ? fmt(item.price)
                        : (item.error || "--")
                    }
                  </span>

                </div>
              `;

            })
            .join("");

      } catch (error) {

        $("scanout").textContent =
          error.message ||
          "Scanner failed";

      }

    };

}


function fileToBase64(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload = () => {

        const result =
          String(reader.result);

        const comma =
          result.indexOf(",");

        if (comma === -1) {

          reject(
            new Error(
              "Could not read image"
            )
          );

          return;
        }

        resolve(
          result.slice(
            comma + 1
          )
        );

      };

      reader.onerror = () => {

        reject(
          new Error(
            "Could not read image"
          )
        );

      };

      reader.readAsDataURL(file);

    }
  );

}


const chartButton =
  $("analyzeChart");


if (chartButton) {

  chartButton.onclick =
    async () => {

      const file =
        $("image")?.files?.[0];

      const status =
        $("chartStatus");

      const result =
        $("chartResult");

      if (!file) {

        status.textContent =
          "Please select a chart screenshot first.";

        return;
      }


      if (
        file.size >
        15 * 1024 * 1024
      ) {

        status.textContent =
          "Image is too large. Please use an image smaller than 15 MB.";

        return;
      }


      const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp"
      ];


      if (
        !allowedTypes.includes(
          file.type
        )
      ) {

        status.textContent =
          "Please select a PNG, JPG or WEBP image.";

        return;
      }


      status.textContent =
        "🔍 SCANNING CHART…";

      result.classList.add(
        "hidden"
      );


      try {

        const image =
          await fileToBase64(file);


        const response =
          await fetch(
            "/api/chart-analyze",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body: JSON.stringify({
                image,
                mimeType:
                  file.type
              })
            }
          );


        const data =
          await response.json();


        if (!data.ok) {

          throw new Error(
            data.error ||
            "Chart analysis failed"
          );

        }


        const analysis =
          data.analysis || {};


        const signal =
          String(
            analysis.signal ||
            "WAIT"
          ).toUpperCase();


        let direction =
          "SIDEWAYS";


        if (
          signal.includes("BUY")
        ) {

          direction =
            "⬆ UP";

        } else if (
          signal.includes("SELL")
        ) {

          direction =
            "⬇ DOWN";

        }


        if ($("chartSignal")) {

          $("chartSignal").textContent =
            signal;

        }


        if ($("chartDirection")) {

          $("chartDirection").textContent =
            direction;

        }


        if ($("chartSignalBox")) {

          $("chartSignalBox").textContent =
            signal;

        }


        if ($("chartConfidence")) {

          $("chartConfidence").textContent =
            `${analysis.confidence ?? 0}/100`;

        }


        if ($("chartTrend")) {

          $("chartTrend").textContent =
            analysis.trend ||
            "--";

        }


        if ($("chartPattern")) {

          $("chartPattern").textContent =
            analysis.pattern ||
            "--";

        }


        if ($("chartEntry")) {

          $("chartEntry").textContent =
            fmt(analysis.entry);

        }


        if ($("chartSL")) {

          $("chartSL").textContent =
            fmt(analysis.stopLoss ?? analysis.stop_loss);

        }


        if ($("chartTP1")) {

          $("chartTP1").textContent =
            fmt(
              analysis.takeProfit1
            );

        }


        if ($("chartTP2")) {

          $("chartTP2").textContent =
            fmt(
              analysis.takeProfit2
            );

        }


        if ($("chartTP3")) {

          $("chartTP3").textContent =
            fmt(
              analysis.takeProfit3
            );

        }


        const reasons =
          $("chartReasons");


        if (reasons) {

          reasons.innerHTML =
            "";

          const list =
            Array.isArray(
              analysis.reasons
            )
              ? analysis.reasons
              : [];


          list.forEach(
            reason => {

              const li =
                document.createElement(
                  "li"
                );

              li.textContent =
                reason;

              reasons.appendChild(
                li
              );

            }
          );

        }


        result.classList.remove(
          "hidden"
        );


        status.textContent =
          "✅ Chart scan completed.";

      } catch (error) {

        status.textContent =
          error.message ||
          "Chart analysis failed";

      }

    };

}


analyze();
