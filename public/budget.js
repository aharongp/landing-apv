/* A preliminary budget guide. The vehicle calculator supplies all fee rules. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.APVBudget = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  function quote(total, reserve, estimate) {
    total = Number(total); reserve = Number(reserve);
    if (!Number.isFinite(total) || !Number.isFinite(reserve) || total <= 0 || total > 1000000 || reserve < 0 || reserve >= total) {
      throw new RangeError('Indica un presupuesto válido y una reserva menor que el total.');
    }
    const available = total - reserve;
    let low = 0, high = Math.floor(available);
    // Find a whole-dollar ceiling that leaves room for the selected fee assumptions.
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (estimate(mid).total <= available) low = mid;
      else high = mid - 1;
    }
    if (!low) throw new RangeError('El saldo disponible no cubre una puja y sus tarifas. Revisa el presupuesto o la reserva.');
    const cost = estimate(low);
    return { bid: low, purchase: cost.total, reserve, total: cost.total + reserve };
  }
  return { quote };
});
