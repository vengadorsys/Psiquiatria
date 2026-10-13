/* ==========================================================================
   Escala Glasgow — calculadora GCS. Script clásico + IIFE, sin dependencias
   en el arranque. jsPDF se carga solo al pedir el PDF.
   ========================================================================== */
(function () {
  "use strict";

  var BRAND = window.__BRAND__ || {};
  var BANDS = BRAND.bands || [
    { id: "grave", min: 3, max: 8, label: "Grave", hint: "" },
    { id: "moderado", min: 9, max: 12, label: "Moderado", hint: "" },
    { id: "leve", min: 13, max: 15, label: "Leve", hint: "" }
  ];
  var LEGAL = BRAND.legal || {};
  var PDF_SRC = "lib/pdf/jspdf.umd.min.js";

  var COMPS = [
    { key: "E", name: "Apertura ocular" },
    { key: "V", name: "Respuesta verbal" },
    { key: "M", name: "Respuesta motora" }
  ];

  var $ = function (sel, scope) { return (scope || document).querySelector(sel); };
  var $$ = function (sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  };

  var card, form, elTotal, elBreakdown, elBand, elInterp, elInterpText;
  var btnPdf, btnPdfLabel, btnCopy, btnCopyLabel, btnReset;
  var lastTotal = null;
  var pdfLoading = false;
  // En un visor que no permite descargas directas (p. ej. una vista previa
  // incrustada), el anfitrión puede ofrecer su propio canal de guardado.
  var saveChannel = null;

  /* ----- 1. Lectura del formulario ----- */

  // Devuelve { E:{value,label}, V:…, M:…, total, band, complete, hasNT }
  function readState() {
    var out = { items: {}, total: null, band: null, complete: false, hasNT: false };
    var sum = 0;
    var picked = 0;

    COMPS.forEach(function (c) {
      var input = $('input[name="' + c.key + '"]:checked', form);
      if (!input) { out.items[c.key] = null; return; }
      picked++;
      var isNT = input.value === "NT";
      if (isNT) { out.hasNT = true; } else { sum += parseInt(input.value, 10); }
      out.items[c.key] = {
        value: isNT ? "NT" : parseInt(input.value, 10),
        label: input.getAttribute("data-label") || ""
      };
    });

    out.complete = picked === COMPS.length;
    if (out.complete && !out.hasNT) {
      out.total = sum;
      out.band = bandFor(sum);
    }
    return out;
  }

  function bandFor(total) {
    for (var i = 0; i < BANDS.length; i++) {
      if (total >= BANDS[i].min && total <= BANDS[i].max) { return BANDS[i]; }
    }
    return null;
  }

  // "E3 V4 M6" · los componentes NT se muestran como "V-NT"
  function breakdownText(st) {
    return COMPS.map(function (c) {
      var it = st.items[c.key];
      if (!it) { return c.key + "?"; }
      return it.value === "NT" ? c.key + "-NT" : c.key + it.value;
    }).join(" ");
  }

  function sumText(st) {
    if (st.total === null) { return breakdownText(st); }
    var v = COMPS.map(function (c) { return st.items[c.key].value; });
    return "E" + v[0] + " + V" + v[1] + " + M" + v[2] + " = " + st.total;
  }

  /* ----- 2. Pintado del resultado ----- */

  function render() {
    var st = readState();

    if (!st.complete) {
      card.setAttribute("data-state", "idle");
      card.removeAttribute("data-band");
      elTotal.textContent = "–";
      elBreakdown.textContent = partialText(st);
      elBand.textContent = "Sin valoración";
      elInterp.hidden = true;
      setActions(false);
      lastTotal = null;
      return;
    }

    card.setAttribute("data-state", "done");
    setActions(true);

    if (st.hasNT) {
      card.setAttribute("data-band", "nt");
      elTotal.textContent = "NT";
      elBreakdown.textContent = breakdownText(st);
      elBand.textContent = "Total no sumable";
      elInterpText.textContent =
        "Hay al menos un componente no evaluable (NT): la puntuación total no debe sumarse. " +
        "Informa el resultado por componentes — " + breakdownText(st) +
        " — indicando el motivo (intubación, sedación, edema periorbitario…).";
      elInterp.hidden = false;
      lastTotal = null;
      return;
    }

    card.setAttribute("data-band", st.band ? st.band.id : "");
    if (lastTotal !== st.total) { pop(elTotal); }
    lastTotal = st.total;
    elTotal.textContent = String(st.total);
    elBreakdown.textContent = sumText(st);
    elBand.textContent = st.band ? st.band.label : "";

    elInterpText.textContent = interpSentence(st);
    elInterp.hidden = false;
  }

  function partialText(st) {
    var missing = COMPS.filter(function (c) { return !st.items[c.key]; })
      .map(function (c) { return c.key; });
    if (missing.length === 3) { return "Selecciona los tres componentes"; }
    return "Falta " + (missing.length > 1 ? "por valorar: " : "") + missing.join(", ");
  }

  function interpSentence(st) {
    var b = st.band;
    var txt = "Puntuación total " + st.total + "/15 (" + sumText(st) + "): " +
      (b ? b.label.toLowerCase() : "") + (b && b.hint ? " — " + b.hint.toLowerCase() : "") + ".";
    if (st.total <= 8) {
      txt += " Un GCS de 8 o menos se asocia clásicamente a coma y a riesgo de no proteger la vía aérea.";
    } else if (st.total <= 12) {
      txt += " Requiere vigilancia estrecha y reevaluación frecuente.";
    } else if (st.total < 15) {
      txt += " Mantén la vigilancia: una puntuación de 13 o 14 puede empeorar.";
    } else {
      txt += " Paciente alerta y orientado en el momento de la valoración.";
    }
    return txt;
  }

  function pop(el) {
    el.classList.remove("is-pop");
    // Reflow para reiniciar la animación
    void el.offsetWidth;
    el.classList.add("is-pop");
  }

  function setActions(on) {
    if (btnPdf) { btnPdf.disabled = !on; }
    if (btnCopy) { btnCopy.disabled = !on; }
  }

  /* ----- 3. Texto plano (copiar y PDF) ----- */

  function resultLines() {
    var st = readState();
    if (!st.complete) { return null; }
    var lines = [];
    lines.push("Escala de Coma de Glasgow (GCS)");
    lines.push(formatNow());
    lines.push("");
    COMPS.forEach(function (c) {
      var it = st.items[c.key];
      var pts = it.value === "NT" ? "NT (no evaluable)" : it.value + " pts";
      lines.push(c.key + " · " + c.name + ": " + pts + " — " + it.label);
    });
    lines.push("");
    if (st.hasNT) {
      lines.push("Resultado: " + breakdownText(st) + " · total no sumable");
      lines.push(LEGAL.ntNote || "NT = componente no evaluable.");
    } else {
      lines.push("Resultado: " + sumText(st) + " / 15");
      lines.push("Interpretación: " + (st.band ? st.band.label : "") +
        (st.band && st.band.hint ? " (" + st.band.hint + ")" : ""));
      lines.push("Clasificación orientativa: 13-15 leve · 9-12 moderado · 3-8 grave. " +
        "Depende del contexto clínico.");
    }
    lines.push("");
    lines.push(LEGAL.disclaimer || "Herramienta de apoyo educativo y clínico.");
    return { st: st, lines: lines };
  }

  function formatNow() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return "Valoración registrada el " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" +
      d.getFullYear() + " a las " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ----- 4. Copiar ----- */

  function initCopy() {
    if (!btnCopy) { return; }
    btnCopy.addEventListener("click", function () {
      var res = resultLines();
      if (!res) { return; }
      var text = res.lines.join("\n");
      copyText(text).then(function (ok) {
        btnCopyLabel.textContent = ok ? "✓ Copiado" : "No se pudo copiar";
        btnCopy.classList.toggle("is-ok", ok);
        setTimeout(function () {
          btnCopyLabel.textContent = "Copiar resultado";
          btnCopy.classList.remove("is-ok");
        }, 2200);
      });
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ----- 5. PDF (jsPDF se carga al primer clic) ----- */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = $('script[data-src="' + src + '"]');
      if (existing && existing.getAttribute("data-loaded") === "1") { return resolve(); }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.setAttribute("data-src", src);
      s.onload = function () { s.setAttribute("data-loaded", "1"); resolve(); };
      s.onerror = function () { reject(new Error("No se pudo cargar " + src)); };
      document.head.appendChild(s);
    });
  }

  function initPdf() {
    if (!btnPdf) { return; }
    btnPdf.addEventListener("click", function () {
      if (pdfLoading) { return; }
      var res = resultLines();
      if (!res) { return; }

      pdfLoading = true;
      btnPdf.disabled = true;
      var engineReady = !!(window.jspdf && window.jspdf.jsPDF);
      btnPdfLabel.textContent = engineReady ? "Generando PDF…" : "Preparando el generador…";

      loadScript(PDF_SRC).then(function () {
        if (!window.jspdf || !window.jspdf.jsPDF) {
          throw new Error("jsPDF no disponible");
        }
        btnPdfLabel.textContent = "Generando PDF…";
        return buildPdf(res);
      }).then(function () {
        btnPdfLabel.textContent = "✓ PDF descargado";
        notifyDownloaded();
      }).catch(function (err) {
        var code = err && err.code;
        if (code === "declined") {
          btnPdfLabel.textContent = "Descarga cancelada";
        } else {
          console.warn("[pdf] fallo:", err);
          btnPdfLabel.textContent = "No se pudo generar el PDF";
        }
      }).then(function () {
        pdfLoading = false;
        btnPdf.disabled = false;
        setTimeout(function () {
          btnPdfLabel.textContent = "Descargar resultado en PDF";
        }, 2600);
      });
    });
  }

  function buildPdf(res) {
    var st = res.st;
    var jsPDFCtor = window.jspdf.jsPDF;
    var doc = new jsPDFCtor({ unit: "mm", format: "a4" });
    var W = 210, M = 18;
    var y = 0;

    // Cabecera azul
    doc.setFillColor(11, 78, 162);
    doc.rect(0, 0, W, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(pdfText("Escala de Coma de Glasgow (GCS)"), M, 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(pdfText(formatNow()), M, 20);

    y = 40;
    doc.setTextColor(16, 36, 58);

    // Caja de resultado
    var band = st.hasNT ? null : st.band;
    var rgb = band ? bandRGB(band.id) : [91, 120, 152];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(M, y, W - M * 2, 24, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(st.hasNT ? "NT" : String(st.total) + " / 15", M + 8, y + 15);
    doc.setFontSize(11);
    doc.text(pdfText(st.hasNT ? "Total no sumable" : (band ? band.label.toUpperCase() : "")), M + 62, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(pdfText(breakdownText(st)), M + 62, y + 17);

    y += 36;
    doc.setTextColor(16, 36, 58);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(pdfText("Desglose por componentes"), M, y);
    y += 7;

    doc.setFontSize(10);
    COMPS.forEach(function (c) {
      var it = st.items[c.key];
      var pts = it.value === "NT" ? "NT" : String(it.value);
      doc.setFont("helvetica", "bold");
      doc.text(pdfText(c.key + " " + pts), M, y);
      doc.setFont("helvetica", "normal");
      doc.text(pdfText(c.name + ": " + it.label), M + 16, y);
      y += 7;
    });

    y += 4;
    doc.setDrawColor(219, 229, 240);
    doc.line(M, y, W - M, y);
    y += 9;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(pdfText("Interpretación"), M, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    var interp = st.hasNT
      ? (LEGAL.ntNote || "NT = componente no evaluable.")
      : interpSentence(st);
    y = wrap(doc, interp, M, y, W - M * 2, 5);

    y += 3;
    y = wrap(doc, "Clasificación orientativa: 13-15 leve, 9-12 moderado, 3-8 grave. " +
      "Los puntos de corte son convencionales y dependen del contexto clínico.", M, y, W - M * 2, 5);

    // Pie legal
    doc.setFillColor(242, 247, 253);
    doc.rect(0, 272, W, 25, "F");
    doc.setTextColor(70, 97, 124);
    doc.setFontSize(8.5);
    wrap(doc, LEGAL.disclaimer || "Herramienta de apoyo educativo y clínico.", M, 280, W - M * 2, 4);
    doc.setFontSize(8);
    doc.text(pdfText((BRAND.name || "Escala Glasgow") + " · cálculo realizado en el dispositivo del usuario"), M, 292);

    var filename = "escala-glasgow-" + (st.hasNT ? "NT" : st.total) + ".pdf";
    return deliverPdf(doc.output("blob"), filename);
  }

  // Descarga normal en cualquier alojamiento web; si la página corre dentro de
  // un visor con canal propio de guardado, se usa ese.
  function deliverPdf(blob, filename) {
    if (!saveChannel) {
      anchorDownload(blob, filename);
      return Promise.resolve("saved");
    }
    return saveChannel.then(function (host) {
      if (!host || typeof host.save !== "function") {
        anchorDownload(blob, filename);
        return "saved";
      }
      return host.save({ filename: filename, data: blob }).then(function () { return "saved"; });
    });
  }

  function anchorDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function initSaveChannel() {
    if (window.claude && typeof window.claude.use === "function") {
      try {
        saveChannel = Promise.resolve(window.claude.use("downloads"))
          .catch(function () { return null; });
      } catch (e) { saveChannel = null; }
    }
  }

  // Las fuentes estándar del PDF no incluyen algunos signos tipográficos:
  // los sustituimos por equivalentes que sí se imprimen.
  function pdfText(text) {
    return String(text)
      .replace(/[\u2014\u2013]/g, "-")
      .replace(/\u2264/g, "<=")
      .replace(/\u2265/g, ">=")
      .replace(/\u2026/g, "...");
  }

  function wrap(doc, text, x, y, maxW, lh) {
    var lines = doc.splitTextToSize(pdfText(text), maxW);
    for (var i = 0; i < lines.length; i++) {
      doc.text(pdfText(lines[i]), x, y);
      y += lh;
    }
    return y;
  }

  function bandRGB(id) {
    if (id === "leve") { return [15, 157, 110]; }
    if (id === "moderado") { return [199, 119, 0]; }
    if (id === "grave") { return [198, 40, 40]; }
    return [91, 120, 152];
  }

  /* ----- 6. Anuncios: pop-up tras la descarga + aviso de esquina ----- */

  // Se dispara DESPUÉS de que doc.save() haya iniciado la descarga, para no
  // bloquearla nunca.
  function notifyDownloaded() {
    try { document.dispatchEvent(new CustomEvent("gcs:downloaded")); } catch (e) { /* noop */ }
  }

  function initAdDialog() {
    var dlg = $("[data-ad-dialog]");
    if (!dlg) { return; }
    document.addEventListener("gcs:downloaded", function () {
      setTimeout(function () {
        try {
          if (typeof dlg.showModal === "function" && !dlg.open) { dlg.showModal(); }
        } catch (e) { /* noop */ }
      }, 350);
    });
    // Cerrar al pulsar el fondo
    dlg.addEventListener("click", function (ev) {
      if (ev.target === dlg) { try { dlg.close(); } catch (e) { /* noop */ } }
    });
  }

  function initAdToast() {
    var toast = $("[data-ad-toast]");
    if (!toast) { return; }
    var KEY = "gcs_ad_toast_cerrado";
    var closed = false;
    try { closed = sessionStorage.getItem(KEY) === "1"; } catch (e) { /* noop */ }
    if (closed) { return; }

    setTimeout(function () { toast.hidden = false; }, 9000);

    var btn = $("[data-ad-toast-close]", toast);
    if (btn) {
      btn.addEventListener("click", function () {
        toast.hidden = true;
        try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* noop */ }
      });
    }
  }

  /* ----- 7. Reinicio y apariciones ----- */

  function initReset() {
    if (!btnReset) { return; }
    btnReset.addEventListener("click", function () {
      form.reset();
      render();
      try {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) { card.scrollIntoView(); }
    });
  }

  function initReveals() {
    var targets = $$(".steps li, .card, .band, .case, .ad-slot");
    if (!targets.length) { return; }
    targets.forEach(function (el) { el.classList.add("reveal"); });

    var show = function (el) { el.classList.add("is-in"); };

    if (!("IntersectionObserver" in window)) {
      targets.forEach(show);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -40px 0px" });

    targets.forEach(function (el) { io.observe(el); });
    // Red de seguridad: nada queda invisible si el observador no dispara
    setTimeout(function () { targets.forEach(show); }, 2500);
  }

  function initForm() {
    form.addEventListener("change", render);
    // Evita que Enter envíe el formulario (no hay servidor)
    form.addEventListener("submit", function (ev) { ev.preventDefault(); });
  }

  /* ----- 8. Arranque ----- */

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "] falló:", e); }
  }

  function boot() {
    card = $("[data-tool]");
    form = $("[data-form]");
    if (!card || !form) { return; }

    elTotal = $("[data-total]", card);
    elBreakdown = $("[data-breakdown]", card);
    elBand = $("[data-band-label]", card);
    elInterp = $("[data-interp]", card);
    elInterpText = $("[data-interp-text]", card);
    btnPdf = $("[data-pdf]", card);
    btnPdfLabel = $("[data-pdf-label]", card);
    btnCopy = $("[data-copy]", card);
    btnCopyLabel = $("[data-copy-label]", card);
    btnReset = $("[data-reset]", card);

    safe(initSaveChannel, "initSaveChannel");
    safe(initForm, "initForm");
    safe(render, "render");
    safe(initCopy, "initCopy");
    safe(initPdf, "initPdf");
    safe(initReset, "initReset");
    safe(initAdDialog, "initAdDialog");
    safe(initAdToast, "initAdToast");
    safe(initReveals, "initReveals");

    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
