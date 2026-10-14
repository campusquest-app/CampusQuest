import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./singleFlight";

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight (Add Tags Done)", () => {
  it("sends one request when Done is double-tapped before the save resolves", async () => {
    const save = deferred();
    const post = vi.fn(() => save.promise);
    const busy: boolean[] = [];
    const flight = createSingleFlight((b) => busy.push(b));

    const first = flight.run(post);
    flight.run(post);
    flight.run(post);
    expect(post).toHaveBeenCalledTimes(1);
    expect(flight.isBusy()).toBe(true);
    expect(busy).toEqual([true]);

    save.resolve();
    await first;
    expect(flight.isBusy()).toBe(false);
    expect(busy).toEqual([true, false]);
  });

  it("allows a retry after a failed save", async () => {
    const failed = deferred();
    const post = vi.fn().mockReturnValueOnce(failed.promise).mockResolvedValueOnce(undefined);
    const flight = createSingleFlight();

    const attempt = flight.run(post);
    failed.reject(new Error("network"));
    await expect(attempt).resolves.toBeUndefined();
    expect(flight.isBusy()).toBe(false);

    await flight.run(post);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("never marks synchronous Done handlers busy (composer / photo tagging)", () => {
    const onBusy = vi.fn();
    const flight = createSingleFlight(onBusy);
    const close = vi.fn();
    flight.run(close);
    flight.run(close);
    expect(close).toHaveBeenCalledTimes(2);
    expect(onBusy).not.toHaveBeenCalled();
  });
});

describe("Add Tags saving state wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const sheet = read("components/quad/TagPickerSheet.tsx");
  const card = read("components/FieldNoteCard.tsx");

  it("routes Done through the single flight and locks the sheet while saving", () => {
    expect(sheet).toContain("createSingleFlight(setSaving)");
    expect(sheet).toContain("doneFlight.run(onDone)");
    expect(sheet).toMatch(/dismissible=\{!saving\}/);
    expect(sheet).toMatch(/aria-busy=\{saving\}/);
    expect(sheet).toContain("Saving…");
    expect(sheet.match(/disabled=\{saving\}/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("feed Add Tags returns the save promise and only closes after it succeeds", () => {
    const start = card.indexOf("<TagPickerSheet");
    const block = card.slice(start, card.indexOf("/>", card.indexOf("onDone=", start)));
    expect(block).toContain("onDone={async () =>");
    expect(block).not.toContain("void (async");
    const post = block.indexOf("await postAuthed(");
    const close = block.indexOf("setAddTagsOpen(false)", post);
    const caught = block.indexOf("catch", post);
    expect(post).toBeGreaterThan(0);
    expect(close).toBeGreaterThan(post);
    expect(close).toBeLessThan(caught);
  });
});
