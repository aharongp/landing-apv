'use strict';
const {variants}=require('./campaignConfig');
const {esc}=require('./marketing');
function section(html,name){return html.split(`<!-- shared:${name}:start -->`)[1]?.split(`<!-- shared:${name}:end -->`)[0]||'';}
function landingPage(home,variant='ahorro') {
  const key=Object.hasOwn(variants,variant)?variant:'ahorro',v=variants[key];
  const intro=`<div class="auction-explainer"><h2 data-i18n="lpExplain">Las subastas, en 3 frases</h2><ol><li data-i18n="lpExplain1">Copart vende cada semana miles de autos de aseguradoras, bancos y flotas por debajo del precio al público.</li><li data-i18n="lpExplain2">Muchos lotes solo admiten pujas de compradores con licencia. APV Motors la tiene.</li><li data-i18n="lpExplain3">Evaluamos el auto, te damos el costo y pujamos por ti hasta el tope que tú apruebas.</li></ol><p data-i18n="lpRisk">Muchos de estos autos tienen daño o título de salvamento. Por eso revisamos cada uno contigo antes de pujar.</p></div>`;
  const chips=`<div class="lp-budget"><h2 data-i18n="lpBudget">Elige tu presupuesto y mira autos reales</h2><p data-i18n="lpBudgetNote">Rangos de puja o compra inmediata; no incluyen tarifas, transporte ni reparaciones.</p><div class="budget-chips" role="group" aria-label="Rango de precio"><button type="button" data-budget="0" aria-pressed="true">Hasta $6.000</button><button type="button" data-budget="1" aria-pressed="false">$6.000–$10.000</button><button type="button" data-budget="2" aria-pressed="false">$10.000–$15.000</button><button type="button" data-budget="3" aria-pressed="false" data-i18n="lpOver">Más de $15.000</button></div></div>`;
  let featured=section(home,'featured').replace('<section ', '<section id="autos" ');
  featured=featured.replace(/<h2[^>]*>[\s\S]*?<\/h2>/,chips).replace(/<a[^>]*class="home-catalog-link"[\s\S]*?<\/a>/,'');
  featured += '<p class="lp-range-link"><a id="lp-range-link" href="/catalogo?priceMin=0&amp;priceMax=6000" data-i18n="lpAllRange">Ver todos los autos de este rango →</a></p>';
  const faq=section(home,'faq').replace(/<a[^>]*href="https:\/\/wa\.me\/[^"]*"[\s\S]*?<\/a>/g,'').replace(/<details(?![^>]*data-key-faq)[\s\S]*?<\/details>/g,'');
  const compactCosts=section(home,'costs')
    .replace(/<p[^>]*>(?:(?!<\/p>)[\s\S])*?href="#planes"(?:(?!<\/p>)[\s\S])*?<\/p>/g,'')
    .replace(/<a[^>]*href="#presupuesto"[\s\S]*?<\/a>/,'').replace(/<a[^>]*href="https:\/\/wa\.me\/[^"]*"[\s\S]*?<\/a>/g,'');
  const main=`<main class="home-content"><section class="lp-hero wrap"><p class="eyebrow" data-i18n="variant_${key}_eyebrow">${esc(v.eyebrow)}</p><h1 data-i18n="variant_${key}_title">${esc(v.title)}</h1><p class="lead" data-i18n="variant_${key}_subtitle">${esc(v.subtitle)}</p><a class="btn btn-primary" href="#autos" data-cta="lp-hero" data-i18n="lpCta">Ver autos en subasta →</a><div class="hero-assurances"><span data-live-rating hidden></span><span data-i18n="lpDeposit">Depósito reembolsable</span><span data-i18n="lpAdvisor">Asesor humano</span></div></section><section class="wrap lp-explainer">${key==='conocedor'?`<details><summary data-i18n="lpFirstTime">¿Primera vez? Así funciona</summary>${intro}</details>`:intro}</section>${featured}${section(home,'reviews')}${compactCosts}${faq}<section class="final-cta wrap"><div><h2 data-i18n="lpFinal">Encuentra tu auto hoy</h2></div><div class="final-actions"><a class="button white" href="#autos" data-cta="lp-final" data-i18n="lpCta">Ver autos en subasta →</a><a href="https://wa.me/13462048308" data-cta="lp-final" class="final-whatsapp" data-i18n="lpQuestions">¿Tienes dudas? Escríbenos ↗</a></div></section><div hidden inert>${section(home,'hooks')}${section(home,'catalog')}</div></main><a class="lp-sticky btn btn-primary" href="#autos" data-cta="lp-sticky" data-i18n="lpCta">Ver autos en subasta →</a>`;
  return home.replace('<body class="home-page"','<body class="home-page lp-page" data-variant="'+key+'"')
    .replace(/<main>[\s\S]*?<\/main>/,main)
    .replace(/(<header[\s\S]*?<\/header>)/,header=>'<div hidden inert>'+header.replace(/<nav[\s\S]*?<\/nav>/,'')+'</div><div class="lp-brand wrap"><img src="/assets/apv-logo-red.png" alt="APV Motors" width="130" height="64"></div>')
    .replace(/(<form[^>]*id="sticky-search"[\s\S]*?<\/form>)/,'<div hidden inert>$1</div>');
}
module.exports=landingPage;
