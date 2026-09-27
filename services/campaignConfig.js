'use strict';
// Copy pending legal validation is intentionally kept in one reviewable configuration.
module.exports = {
  deposit: { percent: 10, minimum: 600, provisional: true },
  variants: {
    ahorro: { eyebrow:'AUTOS A PRECIO DE SUBASTA', title:'Compra tu auto a precio de subasta, como los concesionarios.', subtitle:'APV Motors puja por ti en Copart. Honorarios desde US$350, solo si ganas.' },
    'primera-vez': { eyebrow:'¿PRIMERA VEZ EN UNA SUBASTA?', title:'Te explicamos todo antes de que pujes.', subtitle:'Elige el auto, conoce el costo y nosotros pujamos por ti con nuestra licencia.' },
    conocedor: { eyebrow:'COPART SIN LICENCIA', title:'Honorarios fijos desde US$350. Sin sorpresas.', subtitle:'Busca por lote o VIN, revisa el costo y pujamos por ti.' }
  }
};
