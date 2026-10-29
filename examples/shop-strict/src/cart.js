const TAX_RATE = 0.2;
const FREE_SHIPPING_AT = 50;
const SHIPPING_FEE = 5;
const MIN_ORDER = 10;

export function subtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function discount(total, code) {
  if (code === 'SAVE10') return total * 0.9;
  if (code === 'SAVE20') return total * 0.8;
  return total;
}

export function shipping(total) {
  if (total >= FREE_SHIPPING_AT) return 0;
  return SHIPPING_FEE;
}

export function total(items, code) {
  const base = discount(subtotal(items), code);
  if (base < MIN_ORDER) return base;
  return base + shipping(base) + base * TAX_RATE;
}
