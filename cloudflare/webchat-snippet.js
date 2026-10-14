// Paste in the Cloudflare editor directly below the line: if (req.method !== "POST") return json(...)
//
// The website chat box (docs/index.html) sends its request with
// Content-Type "text/plain" so browsers send it straight away (no CORS
// preflight). For the browser to READ the answer, your Worker's json()
// helper must add the header  Access-Control-Allow-Origin: *  (or your site's
// address) to every response. Without it, rows are still saved but the
// patient sees the "could not send" message.

    // --- Website chat box -> Requests sheet ---
    if (new URL(req.url).pathname === "/webchat") {
      let d = {};
      try { d = JSON.parse(await req.text()); } catch (e) { return json({ ok: false, error: "bad json" }, 400); }
      if (d.website) return json({ ok: true }); // honeypot: silently drop bots
      const allow = ["patient_name","mobile","doctor","preferred_date","preferred_time","reason","patient_type","language","email"];
      const out = { type: "request", source: "Website chat", status: "New" };
      for (const k of allow) if (d[k] != null) out[k] = String(d[k]).slice(0, 300);
      const digits = String(out.mobile || "").replace(/\D/g, "").slice(-10);
      if (!out.patient_name || !/^[6-9]\d{9}$/.test(digits)) return json({ ok: false, error: "missing" }, 400);
      out.mobile = digits;
      out[SECRET_FIELD] = SHEETS_SECRET;
      const r = await fetch(SHEETS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(out), redirect: "follow" });
      let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {}
      return json({ ok: !!j.success, request_no: j.request_no || "" }, j.success ? 200 : 502);
    }
