import { describe, it, expect } from "vitest";
import { buildActionPromptFor, ACTION_KEYS } from "./index";
import type { ActionPromptInput } from "./types";

const BASE_INPUT: ActionPromptInput = {
  description: "a small green dragon with red eyes and leather wings",
  style: "pixel32",
  chromaColor: "#00FF00",
  frameCount: 4,
};

describe("action prompts", () => {
  for (const action of ACTION_KEYS) {
    it(`${action}: includes the character description verbatim`, () => {
      const prompt = buildActionPromptFor(action, BASE_INPUT);
      expect(prompt).toContain(BASE_INPUT.description);
    });

    it(`${action}: includes the requested chroma color`, () => {
      const prompt = buildActionPromptFor(action, BASE_INPUT);
      expect(prompt).toContain("#00FF00");
    });

    it(`${action}: enumerates exactly N cells when N frames requested`, () => {
      const prompt = buildActionPromptFor(action, BASE_INPUT);
      // Should contain "Cell 1:" through "Cell 4:" but NOT "Cell 5:"
      expect(prompt).toContain("Cell 1:");
      expect(prompt).toContain("Cell 4:");
      expect(prompt).not.toContain("Cell 5:");
    });

    it(`${action}: includes the identity-lock clause`, () => {
      const prompt = buildActionPromptFor(action, BASE_INPUT);
      expect(prompt).toMatch(/EXACT SAME CHARACTER/i);
      expect(prompt.toLowerCase()).toContain("silhouette");
    });

    it(`${action}: includes negative guidance against text and borders`, () => {
      const prompt = buildActionPromptFor(action, BASE_INPUT);
      expect(prompt).toMatch(/no text/i);
      expect(prompt).toMatch(/no border/i);
    });
  }

  it("walks through 9-cell grids correctly", () => {
    const prompt = buildActionPromptFor("walk", { ...BASE_INPUT, frameCount: 9 });
    expect(prompt).toContain("3x3 grid");
    expect(prompt).toContain("Cell 9:");
    expect(prompt).not.toContain("Cell 10:");
  });

  it("walks through 16-cell grids correctly", () => {
    const prompt = buildActionPromptFor("walk", { ...BASE_INPUT, frameCount: 16 });
    expect(prompt).toContain("4x4 grid");
    expect(prompt).toContain("Cell 16:");
    expect(prompt).not.toContain("Cell 17:");
  });

  it("includes palette clause when palette is provided", () => {
    const prompt = buildActionPromptFor("idle", {
      ...BASE_INPUT,
      palette: ["#FF0000", "#00FF00"],
    });
    expect(prompt).toContain("#FF0000");
    expect(prompt).toContain("#00FF00");
    expect(prompt.toLowerCase()).toContain("palette");
  });
});
