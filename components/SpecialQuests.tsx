"use client";

import { useState, useRef } from "react";
import { getSpecialQuests } from "@/lib/specialQuests";
import { completeSpecialQuest } from "@/lib/store";
import type { Character } from "@/lib/types";

export function SpecialQuests({
  character,
  compact = false,
  onClaim,
}: {
  character: Character;
  compact?: boolean;
  onClaim?: () => void;
}) {
  const quests = getSpecialQuests();
  const completedIds = new Set(character.completedSpecialQuests ?? []);
  const proofs = character.specialQuestProofs ?? {};
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [proofInput, setProofInput] = useState("");
  const [proofError, setProofError] = useState<string | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

  function handleProofFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProofError("Please choose an image file (e.g. JPEG, PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofInput((reader.result as string) ?? "");
      setProofError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleSubmitClaim(questId: string) {
    setProofError(null);
    const proof = proofInput.trim();
    if (!proof) {
      setProofError("Add proof (photo link or note) from the event to claim.");
      return;
    }
    const updated = completeSpecialQuest(character.id, questId, proof);
    if (updated) {
      setClaimingQuestId(null);
      setProofInput("");
      onClaim?.();
    } else {
      setProofError("Could not claim. Check that proof is provided.");
    }
  }

  const content = (
    <>
      <div className="flex items-center gap-3 mb-1">
        <span
          className="flex items-center justify-center w-11 h-11 rounded-xl text-2xl flex-shrink-0"
          style={{
            background: "linear-gradient(145deg, rgba(197, 165, 40, 0.35) 0%, rgba(197, 165, 40, 0.12) 100%)",
            border: "1px solid rgba(197, 165, 40, 0.5)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 0 16px rgba(197, 165, 40, 0.2)",
          }}
          aria-hidden
        >
          ⭐
        </span>
        <div className="min-w-0">
          <h3 className="font-display font-bold text-white text-lg tracking-tight">Special Quests</h3>
          <p className="text-[10px] uppercase tracking-[0.2em] text-uri-gold font-medium mt-0.5">One-time · bonus XP</p>
        </div>
      </div>
      <p className="text-xs text-white/60 mb-4 pl-14">Post proof at the event to claim. Higher rewards than routine activities.</p>
      <div className="space-y-3">
        {quests.map((q) => {
          const done = completedIds.has(q.id);
          const isClaiming = claimingQuestId === q.id;
          return (
            <div
              key={q.id}
              className={`flex flex-col gap-2 p-4 rounded-xl border transition-all duration-200 ${
                done
                  ? "bg-gradient-to-br from-uri-gold/20 to-uri-gold/5 border-uri-gold/50 shadow-[0_0_20px_rgba(197,165,40,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "bg-white/5 border-uri-gold/25 hover:border-uri-gold/40 hover:bg-white/10 hover:shadow-[0_0_16px_rgba(197,165,40,0.08)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl flex-shrink-0"
                  style={
                    done
                      ? {
                          background: "linear-gradient(145deg, rgba(197, 165, 40, 0.4) 0%, rgba(197, 165, 40, 0.15) 100%)",
                          border: "1px solid rgba(197, 165, 40, 0.5)",
                          boxShadow: "0 0 12px rgba(197, 165, 40, 0.2)",
                        }
                      : {
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                        }
                  }
                >
                  {q.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm">{q.title}</div>
                  <div className="text-xs text-white/70 mt-0.5 leading-relaxed">{q.description}</div>
                  <span
                    className="inline-block mt-2 text-xs font-bold text-uri-gold px-2.5 py-1 rounded-lg border"
                    style={{
                      background: "linear-gradient(145deg, rgba(197, 165, 40, 0.25) 0%, rgba(197, 165, 40, 0.1) 100%)",
                      borderColor: "rgba(197, 165, 40, 0.5)",
                      boxShadow: "0 0 10px rgba(197, 165, 40, 0.15)",
                    }}
                  >
                    +{q.xpReward} XP
                  </span>
                  {done && proofs[q.id] && (
                    <p className="text-xs text-white/50 mt-1.5 truncate" title={proofs[q.id]}>
                      Proof: {proofs[q.id]}
                    </p>
                  )}
                </div>
                {done ? (
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded-full text-uri-gold text-lg flex-shrink-0"
                    style={{
                      background: "rgba(197, 165, 40, 0.2)",
                      border: "1px solid rgba(197, 165, 40, 0.5)",
                      boxShadow: "0 0 12px rgba(197, 165, 40, 0.2)",
                    }}
                  >
                    ✓
                  </span>
                ) : isClaiming ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setClaimingQuestId(q.id);
                      setProofInput("");
                      setProofError(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-uri-navy flex-shrink-0 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: "linear-gradient(145deg, #e8c547 0%, #c5a028 100%)",
                      border: "1px solid rgba(197, 165, 40, 0.6)",
                      boxShadow: "0 2px 8px rgba(197, 165, 40, 0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
                    }}
                  >
                    Claim
                  </button>
                )}
              </div>
              {isClaiming && (
                <div className="mt-2 pt-3 border-t border-white/10 space-y-3">
                  <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider">
                    Proof from the event (required)
                  </label>
                  <input
                    type="text"
                    value={proofInput.startsWith("data:") ? "" : proofInput}
                    onChange={(e) => setProofInput(e.target.value)}
                    placeholder="Paste image URL or briefly describe your proof"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-uri-gold/20 text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-uri-gold/50 focus:border-uri-gold/40 transition-shadow"
                  />
                  <input
                    ref={proofFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProofFileChange}
                    className="hidden"
                    aria-label="Add photo from device or open camera to scan QR code"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => proofFileRef.current?.click()}
                      className="text-xs font-medium text-uri-gold px-3 py-2 rounded-xl border border-uri-gold/40 hover:bg-uri-gold/15 transition-colors flex items-center gap-1.5"
                    >
                      📷 Add photo from device
                    </button>
                    <button
                      type="button"
                      onClick={() => proofFileRef.current?.click()}
                      className="text-xs font-medium text-white/80 px-3 py-2 rounded-xl border border-white/25 hover:bg-white/10 transition-colors flex items-center gap-1.5"
                    >
                      📱 Open camera to scan QR code
                    </button>
                    {proofInput.startsWith("data:") && (
                      <>
                        <span className="text-xs text-uri-gold/90 font-medium">Image attached</span>
                        <div className="w-full mt-1 rounded-xl overflow-hidden border border-uri-gold/20 max-w-[140px] shadow-inner">
                          <img src={proofInput} alt="Proof" className="w-full h-24 object-cover" />
                        </div>
                      </>
                    )}
                  </div>
                  {proofError && <p className="text-xs text-amber-400 bg-amber-400/10 px-2.5 py-1.5 rounded-lg border border-amber-400/30">{proofError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setClaimingQuestId(null);
                        setProofInput("");
                        setProofError(null);
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-white/70 hover:bg-white/10 border border-white/15"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubmitClaim(q.id)}
                      className="flex-1 px-4 py-2 rounded-xl text-xs font-bold text-uri-navy transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                      style={{
                        background: "linear-gradient(145deg, #e8c547 0%, #c5a028 100%)",
                        border: "1px solid rgba(197, 165, 40, 0.6)",
                        boxShadow: "0 2px 10px rgba(197, 165, 40, 0.35), inset 0 1px 0 rgba(255,255,255,0.3)",
                      }}
                    >
                      Submit proof & claim +{q.xpReward} XP
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  if (compact) {
    return <div className="p-4 sm:p-5">{content}</div>;
  }
  return <section className="card p-4 sm:p-5">{content}</section>;
}
