// Vercel serverless function: proxies Yahoo Finance chart data (server side, no CORS).
// Retorna, por ticker: retorno YTD (%), ultimo preco e variacao do dia (%).
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  const raw = (req.query.symbols || "").toString();
  const symbols = raw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 25);
  const quotes = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
        encodeURIComponent(sym) + "?interval=1d&range=2y";
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) return;
      const j = await r.json();
      const rr = j && j.chart && j.chart.result && j.chart.result[0];
      if (!rr || !rr.timestamp) return;
      const ts = rr.timestamp;
      const q = (rr.indicators.quote && rr.indicators.quote[0].close) || [];
      const adj = (rr.indicators.adjclose && rr.indicators.adjclose[0].adjclose) || q;
      let curY = 0;
      for (let i = 0; i < ts.length; i++) {
        const y = new Date(ts[i] * 1000).getUTCFullYear();
        if (y > curY) curY = y;
      }
      let lastPrevY = null, last = null, prev = null;
      for (let i = 0; i < ts.length; i++) {
        const v = adj[i];
        if (v == null) continue;
        const y = new Date(ts[i] * 1000).getUTCFullYear();
        if (y === curY - 1) lastPrevY = v;
        prev = last; last = v;
      }
      const ytd = (last != null && lastPrevY != null) ? (last / lastPrevY - 1) * 100 : null;
      const chg = (last != null && prev != null) ? (last / prev - 1) * 100 : null;
      quotes[sym] = {
        ytd: ytd == null ? null : Math.round(ytd * 10) / 10,
        last: last == null ? null : Math.round(last * 100) / 100,
        chg: chg == null ? null : Math.round(chg * 100) / 100,
      };
    } catch (e) { /* ignore individual ticker errors */ }
  }));
  res.status(200).json({ asof: new Date().toISOString().slice(0, 10), quotes });
}
