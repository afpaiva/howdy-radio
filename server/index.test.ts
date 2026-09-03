import { test, expect } from "bun:test";

test("basic arithmetic", () => {
  expect(1 + 1).toBe(2);
});

test("string operations", () => {
  expect("hello".toUpperCase()).toBe("HELLO");
});

test("array operations", () => {
  const arr = [1, 2, 3];
  expect(arr.length).toBe(3);
  expect(arr.includes(2)).toBeTrue();
});