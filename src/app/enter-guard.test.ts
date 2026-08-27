import { describe, expect, it } from "vitest";
import { submitsOnEnter } from "./enter-guard";

/**
 * Which controls have their Enter taken away, and which keep it.
 *
 * The rule is one predicate because the alternative — deciding it at each `<form>` — is how the
 * archive-search panel would have lost its Enter along with the registration form beside it. What is
 * worth a test is the shape of the allowlist: that a control the guard has never heard of keeps its
 * key, and that the submit button does too, because a form no one can operate by keyboard is a worse
 * bug than the one being fixed.
 */
describe("submitsOnEnter", () => {
  it("swallows Enter in a text field, which is where the accidental save came from", () => {
    expect(submitsOnEnter("INPUT", "text")).toBe(true);
  });

  it("treats an input with no type as the text field it is", () => {
    expect(submitsOnEnter("INPUT", null)).toBe(true);
  });

  it("swallows Enter in a native select, which submits just as a field does", () => {
    expect(submitsOnEnter("SELECT", null)).toBe(true);
  });

  it("leaves the textarea its newline", () => {
    expect(submitsOnEnter("TEXTAREA", null)).toBe(false);
  });

  it("leaves the submit button its Enter, so the form stays keyboard-operable", () => {
    expect(submitsOnEnter("BUTTON", null)).toBe(false);
    expect(submitsOnEnter("INPUT", "submit")).toBe(false);
  });

  it("leaves the other button-shaped inputs alone", () => {
    expect(submitsOnEnter("INPUT", "button")).toBe(false);
    expect(submitsOnEnter("INPUT", "reset")).toBe(false);
    expect(submitsOnEnter("INPUT", "image")).toBe(false);
  });

  it("leaves a disclosure its own toggle", () => {
    expect(submitsOnEnter("SUMMARY", null)).toBe(false);
  });

  it("leaves an unforeseen element untouched rather than guessing", () => {
    expect(submitsOnEnter("DIV", null)).toBe(false);
    expect(submitsOnEnter("A", null)).toBe(false);
  });

  it("reads a tag name in either case, because the DOM and JSX disagree about it", () => {
    expect(submitsOnEnter("input", "TEXT")).toBe(true);
    expect(submitsOnEnter("input", "Submit")).toBe(false);
    expect(submitsOnEnter("select", null)).toBe(true);
  });
});
