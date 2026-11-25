/* Optional GA4 measurement adapted from the existing Numbers app consent pattern.
   Consent belongs to this origin. No equations, access codes or identities are sent. */
(function () {
  "use strict";
  if (window.footballAnalytics) return;
  const measurementId = "G-EYHXB09T96";
  const consentKey = "football-asymptote.analytics-consent";
  const consentLifetime = 180 * 24 * 60 * 60 * 1000;
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  const privateLanding = Boolean(window.fundamaticsPrivateLanding || location.hash);
  const query = () => new URLSearchParams(location.search);
  function isQa() {
    const params = query();
    return ["analytics_test", "qa_tracking", "internal_test"].some(key => params.get(key) === "1")
      || (params.get("utm_source") === "qa" && params.get("utm_medium") === "qa")
      || /^fundamatics_measurement_qa_[a-z0-9_]+$/.test(params.get("utm_campaign") || "");
  }
  function publicAllowed() {
    if (location.hostname !== "asymptote.fundamatics.com" || !["/", "/index.html"].includes(location.pathname)
      || privateLanding || location.hash || location.username || location.password || isQa()
      || document.documentElement.dataset.accessGranted !== "true") return false;
    for (const [key, value] of query()) {
      if (key === "lang" && ["en", "he", "ar"].includes(value)) continue;
      if (utmKeys.includes(key) && /^[a-z0-9_-]{1,100}$/.test(value)) continue;
      if (key === "utm_id" && /^[0-9]{1,30}$/.test(value)) continue;
      // These opaque advertising identifiers are discarded before any Google request.
      if (["fbclid", "li_fat_id"].includes(key) && /^[A-Za-z0-9_-]{1,1000}$/.test(value)) continue;
      return false;
    }
    return true;
  }
  let choice = null;
  let choiceExpires = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(consentKey));
    if (saved && saved.version === 1 && ["accepted", "rejected"].includes(saved.choice)
      && saved.expiresAt > Date.now() && saved.expiresAt <= Date.now() + consentLifetime) {
      choice = saved.choice;
      choiceExpires = saved.expiresAt;
    }
  } catch (_) { /* No persistent consent is inferred when storage is unavailable. */ }
  const allowed = () => choice === "accepted" && choiceExpires > Date.now() && publicAllowed();
  const campaign = () => {
    const values = {};
    for (const [key, value] of query()) if (utmKeys.includes(key) && /^[a-z0-9_-]{1,100}$/.test(value)) values[key] = value;
    return values;
  };
  function context() {
    const labels = campaign();
    const url = new URL(location.origin + location.pathname);
    for (const [key, value] of query()) if (key === "lang" || utmKeys.includes(key)) url.searchParams.set(key, value);
    let referrer = "";
    try { referrer = new URL(document.referrer).origin + "/"; } catch (_) {}
    return {
      send_to: measurementId,
      page_location: url.href,
      page_referrer: referrer,
      app_name: "asymptote",
      app_id: "asymptote",
      page_type: "interactive_app",
      language: ["en", "he", "ar"].includes(document.documentElement.lang) ? document.documentElement.lang : "he",
      campaign_label: labels.utm_campaign,
      ad_label: labels.utm_content,
    };
  }
  let loaded = false;
  let opened = false;
  function send(name, parameters) {
    if (!loaded || !allowed()) return false;
    try { window.gtag("event", name, { ...context(), ...parameters }); return true; }
    catch (_) { return false; }
  }
  function enable() {
    if (loaded || !allowed()) return;
    const clean = new URL(location.href);
    clean.searchParams.delete("fbclid");
    clean.searchParams.delete("li_fat_id");
    clean.searchParams.delete("utm_id");
    try { if (clean.href !== location.href) history.replaceState(history.state, "", clean.href); }
    catch (_) { return; } // Never send a click identifier if URL cleanup is unavailable.
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("js", new Date());
    const labels = campaign();
    window.gtag("config", measurementId, {
      send_page_view: false, ...context(),
      campaign_source: labels.utm_source, campaign_medium: labels.utm_medium,
      campaign_name: labels.utm_campaign, campaign_content: labels.utm_content,
      cookie_domain: "asymptote.fundamatics.com", cookie_prefix: "fm_football",
      cookie_expires: consentLifetime / 1000, cookie_update: false,
    });
    loaded = true;
    send("page_view", { page_title: "Horizontal Asymptotes in Football | Fundamatics" });
    if (!opened) opened = send("app_open", {});
    const script = document.createElement("script");
    script.async = true;
    script.id = "football-analytics-tag";
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.appendChild(script);
  }
  const actions = new Set(["new_question", "solve", "self_quiz", "rules", "language"]);
  function interaction(action) { if (actions.has(action)) send("app_interaction", { action }); }
  window.footballAnalytics = { allowed, interaction };

  const copy = {
    en: { title: "Your privacy choices", body: "Optional analytics measure app visits and button use to help improve Fundamatics. Equations and access codes are not recorded. You can use the app without accepting.", accept: "Accept analytics", reject: "Reject analytics", preferences: "Privacy preferences" },
    he: { title: "הבחירות שלך בנושא פרטיות", body: "מדידה אופציונלית של ביקורים ולחיצות עוזרת לשפר את פנדמטיקס. לא נרשמים ביטויים מתמטיים או קודי גישה. אפשר להשתמש ביישומון גם ללא הסכמה למדידה.", accept: "אישור מדידה", reject: "דחיית מדידה", preferences: "העדפות פרטיות" },
    ar: { title: "خيارات الخصوصية", body: "تساعدنا التحليلات الاختيارية للزيارات واستخدام الأزرار على تحسين Fundamatics. لا تُسجَّل التعبيرات الرياضية أو رموز الدخول. يمكنك استخدام التطبيق دون الموافقة.", accept: "قبول التحليلات", reject: "رفض التحليلات", preferences: "تفضيلات الخصوصية" },
  };
  const panel = document.createElement("section");
  panel.className = "football-analytics-panel";
  panel.setAttribute("aria-labelledby", "football-analytics-title");
  const title = document.createElement("h2"); title.id = "football-analytics-title";
  const body = document.createElement("p");
  const controls = document.createElement("div"); controls.className = "football-analytics-controls";
  const accept = document.createElement("button"); accept.type = "button";
  const reject = document.createElement("button"); reject.type = "button";
  const preferences = document.createElement("button"); preferences.type = "button"; preferences.className = "football-analytics-preferences";
  function setChoice(value) {
    choice = value;
    choiceExpires = Date.now() + consentLifetime;
    try { localStorage.setItem(consentKey, JSON.stringify({ version: 1, choice, expiresAt: choiceExpires })); } catch (_) {}
    panel.hidden = true;
    if (choice === "accepted") enable();
    else if (loaded) {
      window["ga-disable-" + measurementId] = true;
      location.reload();
    }
  }
  accept.addEventListener("click", () => setChoice("accepted"));
  reject.addEventListener("click", () => setChoice("rejected"));
  preferences.addEventListener("click", () => { panel.hidden = !panel.hidden; if (!panel.hidden) reject.focus(); });
  controls.append(accept, reject); panel.append(title, body, controls);
  document.body.append(panel, preferences);
  function translate() {
    const lang = document.documentElement.lang;
    const words = copy[lang] || copy.en;
    panel.dir = preferences.dir = ["he", "ar"].includes(lang) ? "rtl" : "ltr";
    title.textContent = words.title; body.textContent = words.body;
    accept.textContent = words.accept; reject.textContent = words.reject; preferences.textContent = words.preferences;
  }
  panel.hidden = choice !== null;
  translate();
  window.addEventListener("footballasymptote:localechange", () => { translate(); interaction("language"); });
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest("#randomButton, #analyzeButton, .rule-card");
    if (!target) return;
    if (target.id === "randomButton") interaction("new_question");
    else if (target.id === "analyzeButton") interaction("solve");
    else interaction("rules");
  });
  document.addEventListener("change", event => {
    if (event.target instanceof Element && event.target.id === "timedQuiz") interaction("self_quiz");
  });
  document.addEventListener("keydown", event => {
    if (event.target instanceof Element && event.target.id === "funcInput" && !event.repeat
      && (event.ctrlKey || event.metaKey) && event.key === "Enter") interaction("solve");
  });
  // The access guard remains authoritative, including after public access expires.
  const observer = new MutationObserver(() => enable());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-access-granted"] });
  enable();
})();
