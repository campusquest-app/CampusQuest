import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

function fakeElement() {
  const attrs = new Map<string, string>();
  const props = new Map<string, string>();
  return {
    attrs,
    props,
    style: {
      overflow: "",
      setProperty: (k: string, v: string) => props.set(k, v),
      removeProperty: (k: string) => props.delete(k),
    },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
    hasAttribute: (k: string) => attrs.has(k),
    toggleAttribute: (k: string, force: boolean) => {
      if (force) attrs.set(k, "");
      else attrs.delete(k);
      return force;
    },
  };
}

function installDom() {
  const html = fakeElement();
  const body = fakeElement();
  const vvListeners = new Map<string, Listener>();
  const visualViewport = {
    height: 844,
    offsetTop: 0,
    addEventListener: (t: string, fn: Listener) => vvListeners.set(t, fn),
    removeEventListener: (t: string) => vvListeners.delete(t),
  };
  const win = {
    innerHeight: 844,
    scrollX: 0,
    scrollY: 1200,
    visualViewport,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    scrollTo: vi.fn((x: number, y: number) => {
      win.scrollX = x;
      win.scrollY = y;
    }),
  };
  vi.stubGlobal("document", { documentElement: html, body });
  vi.stubGlobal("window", win);
  return { html, body, win, visualViewport, vvListeners };
}

async function loadModule() {
  vi.resetModules();
  return import("./modalLayer");
}

describe("modal layer", () => {
  let dom: ReturnType<typeof installDom>;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("locks background scroll and hides the dock while open, then restores", async () => {
    const { acquireModalLayer, MODAL_OPEN_ATTR } = await loadModule();
    dom.html.style.overflow = "auto";
    const layer = acquireModalLayer();
    expect(dom.html.style.overflow).toBe("hidden");
    expect(dom.body.style.overflow).toBe("hidden");
    expect(dom.html.hasAttribute(MODAL_OPEN_ATTR)).toBe(true);

    layer.release();
    expect(dom.html.style.overflow).toBe("auto");
    expect(dom.body.style.overflow).toBe("");
    expect(dom.html.hasAttribute(MODAL_OPEN_ATTR)).toBe(false);
  });

  it("ref-counts nested layers and only unlocks after the last closes", async () => {
    const { acquireModalLayer, getOpenModalLayerCount, isTopModalLayer, MODAL_OPEN_ATTR } = await loadModule();
    const edit = acquireModalLayer();
    const tags = acquireModalLayer();
    expect(getOpenModalLayerCount()).toBe(2);
    expect(isTopModalLayer(tags.id)).toBe(true);
    expect(isTopModalLayer(edit.id)).toBe(false);

    tags.release();
    tags.release();
    expect(getOpenModalLayerCount()).toBe(1);
    expect(isTopModalLayer(edit.id)).toBe(true);
    expect(dom.html.hasAttribute(MODAL_OPEN_ATTR)).toBe(true);

    edit.release();
    expect(getOpenModalLayerCount()).toBe(0);
    expect(dom.html.hasAttribute(MODAL_OPEN_ATTR)).toBe(false);
  });

  it("puts the feed back where it was if the document scroll drifted", async () => {
    const { acquireModalLayer } = await loadModule();
    const layer = acquireModalLayer();
    dom.win.scrollY = 0;
    layer.release();
    expect(dom.win.scrollTo).toHaveBeenCalledWith(0, 1200);
  });

  it("tracks the visual viewport so the keyboard cannot cover the sheet", async () => {
    const { acquireModalLayer, MODAL_KEYBOARD_ATTR } = await loadModule();
    const layer = acquireModalLayer();
    expect(dom.html.props.get("--cq-modal-vv-h")).toBe("844px");

    dom.visualViewport.height = 480;
    dom.visualViewport.offsetTop = 40;
    dom.vvListeners.get("resize")?.();
    expect(dom.html.props.get("--cq-modal-vv-h")).toBe("480px");
    expect(dom.html.props.get("--cq-modal-vv-top")).toBe("40px");
    expect(dom.html.hasAttribute(MODAL_KEYBOARD_ATTR)).toBe(true);

    layer.release();
    expect(dom.html.props.has("--cq-modal-vv-h")).toBe(false);
    expect(dom.html.hasAttribute(MODAL_KEYBOARD_ATTR)).toBe(false);
    expect(dom.vvListeners.size).toBe(0);
  });

  it("scrolls the focused field above the pinned footer once the keyboard shrinks the sheet", async () => {
    const { acquireModalLayer } = await loadModule();
    const body = {
      scrollTop: 100,
      getBoundingClientRect: () => ({ top: 120, bottom: 400 }),
    };
    const field = {
      closest: (sel: string) => (sel === ".cq-modal-body" ? body : null),
      getBoundingClientRect: () => ({ top: 380, bottom: 460 }),
    };
    (document as unknown as { activeElement: unknown }).activeElement = field;
    const frames: (() => void)[] = [];
    (window as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = (fn: () => void) =>
      frames.push(fn);

    const layer = acquireModalLayer();
    expect(frames).toHaveLength(0);
    dom.visualViewport.height = 480;
    dom.vvListeners.get("resize")?.();
    frames.forEach((fn) => fn());
    expect(body.scrollTop).toBe(100 + (460 - 400) + 12);
    layer.release();
  });
});

describe("background isolation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("makes everything outside the top layer inert and restores only what it changed", async () => {
    const app = { inert: false };
    const alreadyInert = { inert: true };
    const edit = { inert: false };
    const tags = { inert: false };
    const children = [app, alreadyInert, edit];
    vi.stubGlobal("document", { body: { children } });
    const { isolateModalLayer } = await loadModule();

    const restoreEdit = isolateModalLayer(edit as unknown as Element);
    expect([app.inert, alreadyInert.inert, edit.inert]).toEqual([true, true, false]);

    children.push(tags);
    const restoreTags = isolateModalLayer(tags as unknown as Element);
    expect(edit.inert).toBe(true);
    expect(tags.inert).toBe(false);

    restoreTags();
    expect([app.inert, edit.inert]).toEqual([true, false]);
    restoreEdit();
    expect([app.inert, alreadyInert.inert, edit.inert]).toEqual([false, true, false]);
  });
});

describe("modal touch guard", () => {
  type Node = {
    tagName: string;
    parentElement: Node | null;
    overflowX?: string;
    overflowY?: string;
    scrollTop?: number;
    scrollLeft?: number;
    scrollHeight?: number;
    clientHeight?: number;
    scrollWidth?: number;
    clientWidth?: number;
  };
  const styleOf = (el: Element) => {
    const n = el as unknown as Node;
    return { overflowX: n.overflowX ?? "visible", overflowY: n.overflowY ?? "visible" };
  };
  const layer: Node = { tagName: "DIV", parentElement: null };
  const panel: Node = { tagName: "FORM", parentElement: layer };
  const asEl = (n: Node) => n as unknown as Element;

  it("cancels drags on non-scrolling chrome (header, footer, backdrop)", async () => {
    const { canModalTouchScroll } = await loadModule();
    const header: Node = { tagName: "HEADER", parentElement: panel };
    expect(canModalTouchScroll(asEl(header), asEl(layer), 0, -40, styleOf)).toBe(false);
    expect(canModalTouchScroll(asEl(layer), asEl(layer), 0, 40, styleOf)).toBe(false);
  });

  it("allows the modal body to scroll but not chain past its edges", async () => {
    const { canModalTouchScroll } = await loadModule();
    const body: Node = {
      tagName: "DIV",
      parentElement: panel,
      overflowY: "auto",
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 400,
    };
    const row: Node = { tagName: "BUTTON", parentElement: body };
    expect(canModalTouchScroll(asEl(row), asEl(layer), 0, -30, styleOf)).toBe(true);
    expect(canModalTouchScroll(asEl(row), asEl(layer), 0, 30, styleOf)).toBe(false);
    body.scrollTop = 500;
    expect(canModalTouchScroll(asEl(row), asEl(layer), 0, -30, styleOf)).toBe(false);
    expect(canModalTouchScroll(asEl(row), asEl(layer), 0, 30, styleOf)).toBe(true);
  });

  it("allows horizontal filter rows and text inputs", async () => {
    const { canModalTouchScroll } = await loadModule();
    const filters: Node = {
      tagName: "DIV",
      parentElement: panel,
      overflowX: "auto",
      scrollLeft: 0,
      scrollWidth: 500,
      clientWidth: 300,
    };
    const chip: Node = { tagName: "BUTTON", parentElement: filters };
    expect(canModalTouchScroll(asEl(chip), asEl(layer), -40, 2, styleOf)).toBe(true);
    const input: Node = { tagName: "INPUT", parentElement: panel };
    expect(canModalTouchScroll(asEl(input), asEl(layer), 0, 30, styleOf)).toBe(true);
  });
});

describe("Edit Post and Add Tags use the shared modal layer", () => {
  const root = process.cwd();
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const layer = read("components/ui/CqModalLayer.tsx");
  const edit = read("components/FieldNoteEditModal.tsx");
  const tags = read("components/quad/TagPickerSheet.tsx");
  const css = read("app/modal-layer.css");

  it("portals to document.body so transformed tab shells cannot trap position: fixed", () => {
    expect(layer).toContain("createPortal(");
    expect(layer).toContain("document.body");
    expect(layer).toContain('placement?: "sheet" | "dialog"');
    expect(css).toContain(".cq-modal-layer--dialog");
    expect(css).toContain(".cq-modal-panel--dialog");
  });

  it("centers the Events filter dialog via the shared modal layer", () => {
    const filters = read("components/events/EventsFilterSheet.tsx");
    expect(filters).toContain("<CqModalLayer");
    expect(filters).toContain('placement="dialog"');
    expect(filters).toContain("cq-modal-header");
    expect(filters).toContain("cq-modal-body");
    expect(filters).toContain("cq-modal-footer");
    expect(filters).not.toContain("cq-create-sheet-overlay");
  });

  it("stacks above the dock nav and composer and hides the dock while open", () => {
    const z = Number(/\.cq-modal-layer \{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
    expect(z).toBeGreaterThan(10060);
    expect(css).toContain("html[data-cq-modal-open] .cq-dock-nav");
    expect(css).toContain("var(--cq-modal-vv-h");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(read("app/layout.tsx")).toContain('import "./modal-layer.css"');
  });

  it("keeps header and actions pinned with a scrolling body", () => {
    for (const source of [edit, tags]) {
      expect(source).toContain("<CqModalLayer");
      expect(source).toContain("cq-modal-header");
      expect(source).toContain("cq-modal-body");
      expect(source).not.toMatch(/fixed inset-0 z-\[120\]/);
    }
    expect(edit).toContain("cq-modal-footer");
    expect(edit).toMatch(/dismissible=\{!saving\}/);
  });

  it("isolates the background, guards touch scrolling, and manages focus", () => {
    expect(layer).toContain("isolateModalLayer(layerEl)");
    expect(layer).toContain("guardModalTouchMove(layerEl)");
    expect(layer).toContain("tabIndex: -1");
    expect(layer).toMatch(/opener\.focus\(\{ preventScroll: true \}\)/);
    expect(css).toContain(".cq-modal-panel:focus");
  });

  it("focuses tag search without scrolling the page", () => {
    expect(tags).toContain("focus({ preventScroll: true })");
  });
});
