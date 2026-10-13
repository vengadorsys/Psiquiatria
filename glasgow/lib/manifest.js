(function () {
  "use strict";

  window.__BRAND__ = {
    name: "Escala Glasgow",
    tagline: "Calculadora de la Escala de Coma de Glasgow",
    url: "https://glasgow.com.mx",

    // Bandas de gravedad. La clasificación es orientativa y depende del
    // contexto clínico (ver aviso en la pagina).
    bands: [
      { id: "grave",    min: 3,  max: 8,  label: "Grave",    hint: "Coma / alteración grave de la consciencia" },
      { id: "moderado", min: 9,  max: 12, label: "Moderado", hint: "Alteración moderada de la consciencia" },
      { id: "leve",     min: 13, max: 15, label: "Leve",     hint: "Alteración leve de la consciencia" }
    ],

    // Textos reutilizados por el PDF y por "copiar resultado".
    legal: {
      disclaimer: "Herramienta de apoyo educativo y clínico. No sustituye la valoración de un profesional sanitario ni constituye un diagnóstico.",
      ntNote: "NT = componente no evaluable. Si algún componente es NT, la puntuación total no debe sumarse: se informa por componentes."
    }
  };
})();
