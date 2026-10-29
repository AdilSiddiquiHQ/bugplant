// What the example looks like when the tests are written to kill bugs.
// Run: node --test examples/shop/test/cart.spec.test.js
// (It is not in test/ so the weak example stays the default demo.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { subtotal, discount, shipping, total } from '../src/cart.js';

test('subtotal multiplies price by quantity', () => {
  assert.equal(subtotal([{ price: 10, qty: 2 }]), 20);
  assert.equal(subtotal([]), 0);
  assert.equal(subtotal([{ price: 10, qty: 2 }, { price: 5, qty: 3 }]), 35);
});

test('SAVE10 takes ten percent', () => {
  assert.equal(discount(100, 'SAVE10'), 90);
});

test('SAVE20 takes twenty percent', () => {
  assert.equal(discount(100, 'SAVE20'), 80);
});

test('unknown codes are ignored', () => {
  assert.equal(discount(100, 'NOPE'), 100);
});

test('shipping is free at the threshold and costs five below it', () => {
  assert.equal(shipping(50), 0);
  assert.equal(shipping(49), 5);
  assert.equal(shipping(0), 5);
});

test('total applies the discount, then shipping and tax', () => {
  // 100 - 10% = 90; free shipping; + 20% tax = 108
  assert.equal(total([{ price: 100, qty: 1 }], 'SAVE10'), 108);
  // 20 with no code: 20 + 5 shipping = 25; + 20% tax on the base = 29
  assert.equal(total([{ price: 20, qty: 1 }], null), 29);
});
