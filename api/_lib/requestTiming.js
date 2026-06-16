// Per-request timing + structured log line for the diagnostic routes
// (/api/football, /api/scores, /api/spotlight, /api/predictions).
//
// Designed to be additive: handlers and route logic are unchanged. The
// middleware attaches `req.timing` and emits ONE JSON line to stdout when
// the response finishes:
//
//   [timing] {"route":"GET /api/football/matches/today","status":200,
//             "durationMs":1843,"upstreamMs":1780,"supabase":[],
//             "cacheHit":false,"stale":false,"query":{},"params":{},
//             "error":null}
//
// Vercel function logs ingest stdout, so the line is greppable in the
// dashboard. No external deps; uses `process.hrtime.bigint()` for ms.
//
// Handlers can:
//   req.timing.markUpstream({ label, ms, ok, source })  — one upstream call
//   req.timing.markSupabase({ label, ms, error })       — one Supabase call
//   req.timing.note(key, value)                         — free-form field
//
// Errors are surfaced via the final response status and any `req.timing.error`
// set by the central errorHandler (we don't replace it).

function nowNs() {
  return process.hrtime.bigint();
}

function nsToMs(ns) {
  return Number(ns) / 1_000_000;
}

function safeJson(value) {
  // Defensive — query strings can be exotic. Cap length so a malicious
  // ?matchIds=… payload can't blow up the log line.
  try {
    const s = JSON.stringify(value);
    if (!s) return null;
    return s.length > 500 ? s.slice(0, 500) + '…' : value;
  } catch {
    return null;
  }
}

function requestTiming(routerLabel) {
  return function timingMiddleware(req, res, next) {
    const startNs = nowNs();
    let upstreamMs = 0;
    const supabaseEvents = [];
    const notes = {};
    let firstError = null;

    req.timing = {
      markUpstream({ label, ms, ok = true, source = 'live' } = {}) {
        upstreamMs += Number(ms) || 0;
        notes[`upstream:${label || 'wc26'}`] = { ms: Number(ms) || 0, ok, source };
        if (!ok && !firstError) firstError = `upstream:${label || 'wc26'} failed`;
      },
      markSupabase({ label, ms, error } = {}) {
        supabaseEvents.push({
          label: label || 'query',
          ms: Number(ms) || 0,
          ok: !error,
          code: error?.code || null,
          message: error?.message || null,
        });
        if (error && !firstError) firstError = `supabase:${label || 'query'}: ${error.message || error.code}`;
      },
      note(key, value) {
        notes[key] = value;
      },
      setError(message) {
        if (message && !firstError) firstError = String(message);
      },
    };

    const onDone = () => {
      // Make sure we only log once even if both finish + close fire.
      if (res.__timingLogged) return;
      res.__timingLogged = true;

      const durationMs = Math.round(nsToMs(nowNs() - startNs));
      const route = `${req.method} ${routerLabel}${req.path}`;
      const payload = {
        route,
        status: res.statusCode,
        durationMs,
        upstreamMs: Math.round(upstreamMs),
        supabase: supabaseEvents,
        cacheHit: notes.cacheHit === true,
        stale: notes.stale === true,
        query: safeJson(req.query) || {},
        params: safeJson(req.params) || {},
        notes,
        error: firstError,
      };

      // Single line, one console.log call. Vercel ingests this verbatim.
      // We use console.log for 2xx and console.warn for 4xx/5xx so the
      // dashboard's severity filter is useful.
      const line = `[timing] ${JSON.stringify(payload)}`;
      if (res.statusCode >= 500) console.error(line);
      else if (res.statusCode >= 400) console.warn(line);
      else console.log(line);
    };

    res.on('finish', onDone);
    res.on('close', onDone);

    next();
  };
}

// Tiny helper for routes that want to time a Supabase call inline:
//   const { data, error } = await timeSupabase(req, 'users.approved',
//     () => supabase.from('users').select(...).eq(...));
async function timeSupabase(req, label, fn) {
  const start = nowNs();
  try {
    const result = await fn();
    const ms = nsToMs(nowNs() - start);
    if (req?.timing) {
      req.timing.markSupabase({ label, ms, error: result?.error || null });
    }
    return result;
  } catch (err) {
    const ms = nsToMs(nowNs() - start);
    if (req?.timing) req.timing.markSupabase({ label, ms, error: err });
    throw err;
  }
}

module.exports = { requestTiming, timeSupabase, nowNs, nsToMs };
