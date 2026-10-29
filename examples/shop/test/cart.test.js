// These tests pass, and they are close to worthless. That is the point of the
// example: every one of them checks a type, not a behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';
import { subtotal, discount, shipping, total } from '../src/cart.js';

test('subtotal returns a number', () => {
  const value = subtotal([{ price: 10, qty: 2 }]);
  assert.equal(typeof value, 'number');
});

test('discount returns a number', () => {
  assert.equal(typeof discount(100, 'SAVE10'), 'number');
});

test('shipping returns a number', () => {
  assert.equal(typeof shipping(100), 'number');
});

test('total returns a number', () => {
  assert.equal(typeof total([{ price: 10, qty: 1 }], 'SAVE10'), 'number');
});

// One real boundary assertion. It is the only reason the score is not zero,
// and it is the shape the README asks you to copy.
test('shipping is free at the threshold', () => {
  assert.equal(shipping(50), 0);
  assert.equal(shipping(49), 5);
});
