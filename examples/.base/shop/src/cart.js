// The "before" version of the example. scripts/demo.mjs commits this, then
// overlays the current version so bugplant has a real diff to work with.

const TAX_RATE = 0.2;

export function subtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function discount(total, code) {
  if (code === 'SAVE10') return total * 0.9;
  return total;
}

export function shipping(total) {
  if (total >= 50) return 0;
  return 5;
}

export function total(items, code) {
  const base = subtotal(items);
  return base + shipping(base) + base * TAX_RATE;
}
