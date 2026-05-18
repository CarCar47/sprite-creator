import { describe, it, expect } from "vitest";
import { buildBasePrompt, buildBasePromptFromRequest } from "./baseCharacter";

describe("buildBasePrompt", () => {
  it("includes the user description verbatim", () => {
    const prompt = buildBasePrompt({
      description: "a small green dragon with red eyes",
      style: "pixel32",
      chromaColor: "#00FF00",
    });
    expect(prompt).toContain("a small green dragon with red eyes");
  });

  it("specifies the chroma color in the background instruction", () => {
    const greenPrompt = buildBasePrompt({
      description: "a knight in silver armor",
      style: "modern",
      chromaColor: "#00FF00",
    });
    expect(greenPrompt).toContain("#00FF00");

    const magentaPrompt = buildBasePrompt({
      description: "a knight in silver armor",
      style: "modern",
      chromaColor: "#FF00FF",
    });
    expect(magentaPrompt).toContain("#FF00FF");
    expect(magentaPrompt).not.toContain("#00FF00");
  });

  it("includes a style-specific instruction", () => {
    const pixel = buildBasePrompt({
      description: "a wizard with a long beard",
      style: "pixel16",
      chromaColor: "#00FF00",
    });
    expect(pixel.toLowerCase()).toContain("pixel art");

    const cartoon = buildBasePrompt({
      description: "a wizard with a long beard",
      style: "cartoon",
      chromaColor: "#00FF00",
    });
    expect(cartoon.toLowerCase()).toContain("cartoon");
  });

  it("includes negative guidance", () => {
    const prompt = buildBasePrompt({
      description: "an archer in a green cloak",
      style: "pixel32",
      chromaColor: "#00FF00",
    });
    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/no watermark/i);
    expect(prompt).toMatch(/no border/i);
  });

  it("appends a palette clause when palette is provided", () => {
    const prompt = buildBasePrompt({
      description: "a knight in silver armor",
      style: "modern",
      chromaColor: "#00FF00",
      palette: ["#1A1A1A", "#C0C0C0", "#FF0000"],
    });
    expect(prompt).toContain("#1A1A1A");
    expect(prompt).toContain("#C0C0C0");
    expect(prompt).toContain("#FF0000");
    expect(prompt.toLowerCase()).toContain("palette");
  });

  it("omits palette clause entirely when palette is empty or undefined", () => {
    const noPalette = buildBasePrompt({
      description: "a knight in silver armor",
      style: "modern",
      chromaColor: "#00FF00",
    });
    expect(noPalette.toLowerCase()).not.toContain("constrain the character's colors");

    const emptyPalette = buildBasePrompt({
      description: "a knight in silver armor",
      style: "modern",
      chromaColor: "#00FF00",
      palette: [],
    });
    expect(emptyPalette.toLowerCase()).not.toContain("constrain the character's colors");
  });

  it("specifies single subject and front-facing pose", () => {
    const prompt = buildBasePrompt({
      description: "a knight",
      style: "modern",
      chromaColor: "#00FF00",
    });
    expect(prompt.toLowerCase()).toContain("single character");
    expect(prompt.toLowerCase()).toContain("front-facing");
  });
});

describe("buildBasePromptFromRequest", () => {
  it("delegates to buildBasePrompt with the request fields", () => {
    const prompt = buildBasePromptFromRequest({
      description: "a small green dragon with red eyes",
      style: "pixel32",
      chromaColor: "#FF00FF",
    });
    expect(prompt).toContain("a small green dragon with red eyes");
    expect(prompt).toContain("#FF00FF");
  });
});
