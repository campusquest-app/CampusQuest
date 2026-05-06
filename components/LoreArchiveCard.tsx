"use client";

const LORE_LINES = [
  "Most players think CampusQuest started as a system.",
  "They are wrong.",
  "It started with a player.",
  "Before quests. Before XP. Before leaderboards, there was someone who was not winning.",
  "His name was Nile Lotus.",
  "When he first entered Rhydale, he believed what everyone else believed: that if you worked hard, things would fall into place.",
  "It did not take long for that belief to break.",
  "Alliances failed. Trust faded. Opportunities never came.",
  "And slowly, he stopped expecting things to go his way.",
  "That is when he entered what is now known as The Drift.",
  "A state where players show up... but do not progress.",
  "Days turn into weeks. Weeks into months.",
  "You are not failing, but you are not winning either.",
  "For Nile, everything came to a point when he checked his resources:",
  "15 coins.",
  "No plan. No path. No future.",
  "That is when the Shadow Mechanic returned.",
  "\"You already know how this ends.\"",
  "But for the first time, he refused.",
  "Two nights later, before the Rhydale Build Trials, he asked one question:",
  "\"What would actually help?\"",
  "The answer came from something simple.",
  "Games.",
  "In games, effort matters. Progress is visible.",
  "So he asked:",
  "\"What if life worked like that?\"",
  "That thought changed everything.",
  "With two allies, a strategist and a builder, he created a system within the system.",
  "A system that tracks actions. Rewards consistency. Makes progress visible.",
  "CampusQuest.",
  "It was not perfect.",
  "But it worked.",
  "And Nile became something different.",
  "Not the strongest. Not the most skilled.",
  "But the one in control.",
  "Player One.",
  "And now...",
  "that role is open.",
  "You are in the game.",
];

export function LoreArchiveCard() {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#b88950]/60 bg-gradient-to-b from-[#f8e6bf] via-[#f0d8a9] to-[#e5c28b] p-4 text-[#3d2410] shadow-[0_16px_34px_-14px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,250,232,0.95)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_15%,rgba(255,244,210,0.9),transparent_45%),radial-gradient(circle_at_82%_84%,rgba(135,74,22,0.16),transparent_42%),repeating-linear-gradient(8deg,rgba(110,69,33,0.06)_0px,rgba(110,69,33,0.06)_1px,transparent_1px,transparent_8px)]" />
      <div className="pointer-events-none absolute left-4 right-4 top-0 h-px bg-gradient-to-r from-transparent via-[#fff2d5] to-transparent" />
      <div className="pointer-events-none absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[#8b5a30]/35 to-transparent" />

      <header className="relative z-[1] border-b border-[#8b5a30]/25 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d3f1f]/80">CampusQuest Lore Archive</p>
        <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-[#4a2810] sm:text-2xl">
          Lore Entry #001 - The First Player
        </h3>
        <p className="mt-2 text-xs italic text-[#5f3418]/85">Recovered from the Rhydale records. Read by candlelight.</p>
      </header>

      <div className="relative z-[1] mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
        {LORE_LINES.map((line, index) => (
          <p key={`${line}-${index}`} className="text-[13px] leading-relaxed text-[#3d2410]/95 sm:text-[15px] sm:leading-7">
            {line}
          </p>
        ))}
      </div>
    </article>
  );
}
