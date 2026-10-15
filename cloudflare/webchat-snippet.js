// Paste in the Cloudflare editor directly below the line: if (req.method !== "POST") return json(...)
// (replace the older "Website chat box" block if it is already there).
//
// The website chat box (docs/index.html) sends its requests with
// Content-Type "text/plain" (fetch, or navigator.sendBeacon when the chat is
// closed) so browsers send them straight away (no CORS preflight). For the
// browser to READ the answer, your Worker's json() helper must add the header
// Access-Control-Allow-Origin: *  (or your site's address) to every response.
// Without it, rows are still saved but the patient sees the "could not send"
// message.
//
//   {action:"update", session_id, transcript, …}  → chat_update: creates/updates that chat's row
//   {session_id, transcript, patient_name, mobile, …} (Confirm) → request: same row + request number

    // --- Website chat box -> Requests sheet (one row per chat session) ---
    if (new URL(req.url).pathname === "/webchat") {
      let d = {};
      try { d = JSON.parse(await req.text()); } catch (e) { return json({ ok: false, error: "bad json" }, 400); }
      if (d.website) return json({ ok: true }); // honeypot: silently drop bots
      const isUpdate = d.action === "update";
      const allow = ["patient_name","mobile","age","doctor","preferred_date","preferred_time","reason","patient_type","language","email"];
      const out = { type: isUpdate ? "chat_update" : "request", source: "Website chat", status: "New" };
      for (const k of allow) if (d[k] != null && d[k] !== "") out[k] = String(d[k]).slice(0, 300);
      const digits = String(out.mobile || "").replace(/\D/g, "").slice(-10);
      if (/^[6-9]\d{9}$/.test(digits)) out.mobile = digits; else delete out.mobile; // only a valid 10-digit mobile is saved
      const sid = String(d.session_id || "");
      if (/^[A-Za-z0-9_-]{8,64}$/.test(sid)) { out.session_id = sid; out.transcript = String(d.transcript || "").slice(0, 45000); }
      if (isUpdate ? !out.session_id : (!out.patient_name || !out.mobile)) return json({ ok: false, error: "missing" }, 400);
      out[SECRET_FIELD] = SHEETS_SECRET;
      const r = await fetch(SHEETS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(out), redirect: "follow" });
      let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {}
      return json({ ok: !!j.success, request_no: j.request_no || "" }, j.success ? 200 : 502);
    }
