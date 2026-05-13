"use client";

import { useState, useCallback, useRef } from "react";
import { normalizeRamMarkTag, prependRemoteQuadPost } from "@/lib/feedStore";
import { createQuadPostRequest } from "@/lib/client/quadPostsClient";
import type { Character } from "@/lib/types";
import type { QuadPostVisibility } from "@/lib/types";
import { FIELD_NOTE_MAX_CHARS, RAMMARK_MAX_LENGTH, RAMMARK_MAX_PER_POST } from "@/lib/types";
import type { RamMark } from "@/lib/types";

export function FieldNoteComposer({
  character,
  onPosted,
  defaultVisibility = "public",
}: {
  character: Character;
  onPosted: () => void;
  /** Default selected feed when opening composer (e.g. current tab). */
  defaultVisibility?: QuadPostVisibility;
}) {
  const [body, setBody] = useState("");
  const [ramMarkInput, setRamMarkInput] = useState("");
  const [ramMarks, setRamMarks] = useState<RamMark[]>([]);
  const [proofUrl, setProofUrl] = useState("");
  const [visibility, setVisibility] = useState<QuadPostVisibility>(defaultVisibility);
  const [error, setError] = useState<string | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

  const bodyCount = body.length;
  const canAddRamMark = ramMarks.length < RAMMARK_MAX_PER_POST && ramMarkInput.trim().length > 0 &&
    normalizeRamMarkTag(ramMarkInput).length <= RAMMARK_MAX_LENGTH;

  const addRamMark = useCallback(() => {
    const tag = normalizeRamMarkTag(ramMarkInput).slice(0, RAMMARK_MAX_LENGTH);
    if (!tag || ramMarks.length >= RAMMARK_MAX_PER_POST) return;
    if (ramMarks.some((r) => r.tag === tag)) {
      setRamMarkInput("");
      return;
    }
    setRamMarks((prev) => [...prev, { id: `rm-${Date.now()}-${tag}`, tag }]);
    setRamMarkInput("");
  }, [ramMarkInput, ramMarks]);

  const removeRamMark = useCallback((tag: string) => {
    setRamMarks((prev) => prev.filter((r) => r.tag !== tag));
  }, []);

  function handleProofFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (e.g. JPEG, PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofUrl(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Write something for your Field Note.");
      return;
    }
    if (trimmed.length > FIELD_NOTE_MAX_CHARS) {
      setError(`Keep it under ${FIELD_NOTE_MAX_CHARS} characters.`);
      return;
    }
    setError(null);
    try {
      const note = await createQuadPostRequest({
        body: trimmed,
        proofUrl: proofUrl.trim() || undefined,
        visibility,
        ramMarks,
        authorStreakDays: character.streakDays ?? 0,
      });
      prependRemoteQuadPost(note);
      setBody("");
      setRamMarks([]);
      setProofUrl("");
      onPosted();
    } catch {
      setError("Could not post right now. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <span className="block text-xs text-white/60 mb-1.5">Post to</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setVisibility("public")}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
              visibility === "public"
                ? "bg-uri-keaney/25 text-uri-keaney border-uri-keaney/50"
                : "bg-white/5 text-white/70 border-white/15 hover:bg-white/10"
            }`}
          >
            🌐 Public Quad
          </button>
          <button
            type="button"
            onClick={() => setVisibility("friends")}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
              visibility === "friends"
                ? "bg-uri-keaney/25 text-uri-keaney border-uri-keaney/50"
                : "bg-white/5 text-white/70 border-white/15 hover:bg-white/10"
            }`}
          >
            👥 Friends only
          </button>
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, FIELD_NOTE_MAX_CHARS))}
        placeholder="What’s happening on campus? (Field Note)"
        rows={3}
        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.08] border border-white/15 text-white placeholder-white/45 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 focus:border-uri-keaney/40 resize-none transition-colors"
      />
      <div className="flex items-center justify-between text-xs">
        <span className={bodyCount > FIELD_NOTE_MAX_CHARS ? "text-red-400" : "text-white/50"}>
          {bodyCount} / {FIELD_NOTE_MAX_CHARS}
        </span>
      </div>

      <div>
        <label className="block text-xs text-white/60 mb-1">Proof photo (optional)</label>
        <input
          type="url"
          value={proofUrl.startsWith("data:") ? "" : proofUrl}
          onChange={(e) => setProofUrl(e.target.value)}
          placeholder="Paste image URL or add from device"
          className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/50"
        />
        <input
          ref={proofFileRef}
          type="file"
          accept="image/*"
          onChange={handleProofFileChange}
          className="hidden"
          aria-label="Add photo from device or open camera to scan QR code"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => proofFileRef.current?.click()}
            className="text-xs font-medium text-uri-keaney hover:text-uri-keaney/80 px-3 py-2 rounded-lg border border-uri-keaney/40 hover:bg-uri-keaney/10 transition-colors"
          >
            📷 Add photo from device
          </button>
          <button
            type="button"
            onClick={() => proofFileRef.current?.click()}
            className="text-xs font-medium text-white/80 hover:text-white px-3 py-2 rounded-lg border border-white/25 hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            📱 Open camera to scan QR code
          </button>
        </div>
        {proofUrl.startsWith("data:") && (
          <div className="mt-2 rounded-xl overflow-hidden border border-white/15 max-w-[180px]">
            <img src={proofUrl} alt="Proof" className="w-full h-20 object-cover" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/60">RAMarks (optional):</span>
        {ramMarks.map((r) => (
          <span
            key={r.id}
            className="ram-mark flex items-center gap-1"
          >
            #{r.tag}
            <button
              type="button"
              onClick={() => removeRamMark(r.tag)}
              className="ml-0.5 text-uri-navy/70 hover:text-uri-navy"
              aria-label={`Remove ${r.tag}`}
            >
              ×
            </button>
          </span>
        ))}
        {ramMarks.length < RAMMARK_MAX_PER_POST && (
          <>
            <input
              type="text"
              value={ramMarkInput}
              onChange={(e) => setRamMarkInput(e.target.value.slice(0, RAMMARK_MAX_LENGTH))}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRamMark())}
              placeholder={`#tag (max ${RAMMARK_MAX_LENGTH})`}
              className="w-28 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-uri-keaney"
            />
            <button
              type="button"
              onClick={addRamMark}
              disabled={!canAddRamMark}
              className="text-xs px-2 py-1 rounded-lg bg-uri-keaney/30 text-uri-keaney disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!body.trim()}
        className="w-full py-3 rounded-xl font-semibold bg-uri-keaney text-white hover:bg-uri-keaney/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-uri-keaney/40 shadow-[0_0_12px_rgba(104,171,232,0.15)]"
      >
        {visibility === "public" ? "Post to Public Quad" : "Post to Friends only"}
      </button>
    </form>
  );
}
