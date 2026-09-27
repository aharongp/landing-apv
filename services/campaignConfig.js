'use strict';
// Copy pending legal validation is intentionally kept in one reviewable configuration.
module.exports = {
  deposit: { percent: 10, minimum: 600, provisional: true },
  variants: {
    ahorro: { en:{eyebrow:'CARS AT AUCTION PRICES',title:'Buy your car at auction prices, just like dealers.',subtitle:'APV Motors bids for you at Copart. Fees from US$350, only if you win.'}, eyebrow:'AUTOS A PRECIO DE SUBASTA', title:'Compra tu auto a precio de subasta, como los concesionarios.', subtitle:'APV Motors puja por ti en Copart. Honorarios desde US$350, solo si ganas.' },
    'primera-vez': { en:{eyebrow:'YOUR FIRST AUCTION?',title:'We explain everything before you bid.',subtitle:'Choose your car, understand the cost and let us bid with our license.'}, eyebrow:'¿PRIMERA VEZ EN UNA SUBASTA?', title:'Te explicamos todo antes de que pujes.', subtitle:'Elige el auto, conoce el costo y nosotros pujamos por ti con nuestra licencia.' },
    conocedor: { en:{eyebrow:'COPART WITHOUT A LICENSE',title:'Fixed fees from US$350. No surprises.',subtitle:'Search by lot or VIN, review the cost and let us bid for you.'}, eyebrow:'COPART SIN LICENCIA', title:'Honorarios fijos desde US$350. Sin sorpresas.', subtitle:'Busca por lote o VIN, revisa el costo y pujamos por ti.' }
  }
};
