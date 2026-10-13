import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostMediaPicker } from "@/components/posts/PostMediaPicker";

const html = renderToStaticMarkup(createElement(PostMediaPicker, { onClose: () => {}, onNext: () => {} }));
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function textOf(markup: string): string {
  return markup.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
}

describe("PostMediaPicker media sources", () => {
  it("renders exactly three labeled sources: Camera, Video, Library", () => {
    const labels = Array.from(html.matchAll(/<span class="cq-mediapicker-source-label">([^<]*)<\/span>/g), (m) => m[1]);
    expect(labels).toEqual(["Camera", "Video", "Library"]);
    expect(html.match(/class="cq-mediapicker-source"/g)).toHaveLength(3);
  });

  it("does not render the old run-together labels or debug text", () => {
    const text = textOf(html);
    expect(text).not.toMatch(/PhotoRecord|Photo\/Video|Record|Text only/);
    expect(text).toContain("You can add up to 15 photos and videos.");
    expect(text).toContain("Add photos and videos");
  });

  it("keeps the camera, video, and library inputs hidden and wired", () => {
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(3);
    for (const input of inputs) expect(input).toContain('class="hidden"');
    expect(inputs.some((i) => i.includes('accept="image/*"') && i.includes('capture="environment"'))).toBe(true);
    expect(inputs.some((i) => i.includes('accept="video/*"') && i.includes('capture="environment"'))).toBe(true);
    expect(inputs.some((i) => i.includes("multiple"))).toBe(true);
  });

  it("has styles for every media-source class the component uses", () => {
    for (const cls of [
      "cq-mediapicker-sources",
      "cq-mediapicker-source",
      "cq-mediapicker-source-icon",
      "cq-mediapicker-source-label",
      "cq-mediapicker-helper",
      "cq-mediapicker-helper-text",
      "cq-mediapicker-clear",
      "cq-mediapicker-stage--empty",
    ]) {
      expect(css, cls).toContain(`.${cls} {`);
    }
    expect(css).toMatch(/\.cq-mediapicker-sources \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  });
});
