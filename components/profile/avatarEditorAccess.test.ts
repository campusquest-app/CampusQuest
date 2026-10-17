import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const header = read("components/profile/ProfileSocialHeader.tsx");
const page = read("components/profile/ProfileSocialPage.tsx");
const mine = read("components/MyProfileScreen.tsx");
const other = read("components/UserProfileScreen.tsx");
const dialog = read("components/profile/AvatarLabDialog.tsx");
const card = read("components/CharacterCard.tsx");
const nav = read("components/AppBottomNav.tsx");
const dashboard = read("components/Dashboard.tsx");

describe("profile avatar editor access", () => {
  it("opens Avatar Lab from the owner's profile avatar", () => {
    expect(header).toContain('onEditAvatar ? "Edit avatar"');
    expect(header).toContain("onClick={onEditAvatar ?? onSwitchIdentity}");
    expect(header).toContain("avatarInteractive ? (");
    expect(header).toContain("<Pencil");
    expect(header).toContain("{onEditAvatar ? (");
    expect(page).toContain("onEditAvatar={isOwner ? onEditAvatar : undefined}");
    expect(mine).toContain("setShowAvatarLab(true)");
    expect(mine).toContain("<AvatarLabDialog");
    expect(dialog).toContain('aria-label="Avatar Lab"');
  });

  it("does not expose avatar editing on another user's profile", () => {
    expect(other).toContain("isOwner={false}");
    expect(other).not.toContain("onEditAvatar");
    expect(other).not.toContain("AvatarLabDialog");
    expect(page).toContain("onEditAvatar={isOwner ? onEditAvatar : undefined}");
    expect(header).toContain("avatarInteractive ? (");
    expect(header).toContain("<div className={avatarClass}>{avatarBody}</div>");
  });

  it("opens the same Avatar Lab from Edit Profile", () => {
    expect(page).toContain("onEditProfile={onEditIdentity}");
    expect(mine).toContain(">Edit Avatar<");
    expect(mine).toContain("onClick={() => setShowAvatarLab(true)}");
    expect(mine.match(/<AvatarLabDialog/g)?.length).toBe(1);
    expect(card).toContain('import { AvatarLabDialog } from "./profile/AvatarLabDialog"');
    expect(card).not.toContain("AvatarBuilder");
    expect(dialog).toContain("<AvatarBuilder");
  });

  it("saves through the existing character path and refreshes profile plus nav", () => {
    expect(dialog).toContain("saveAvatarDraft(draft)");
    expect(dialog).toContain("onSaved?.()");
    expect(mine).toContain("onSaved={() => onRefresh?.()}");
    expect(dashboard).toContain("onRefresh={refresh}");
    expect(dashboard).toContain("setCharacter(getCharacter())");
    expect(nav).toContain("subscribeCharacterAvatar");
    expect(read("lib/profile/avatarLabSession.ts")).toContain("updateCharacter({ avatar: draft })");
    expect(read("lib/client/gameStateSync.ts")).toContain("profile.avatarCustomJson = av");
  });

  it("cancel closes the editor without saving the draft", () => {
    const cancelButton = dialog.slice(dialog.indexOf("Cancel"), dialog.indexOf("Cancel") + 40);
    expect(cancelButton.startsWith("Cancel")).toBe(true);
    const cancelControl = dialog.slice(dialog.lastIndexOf("onClick={onClose}", dialog.indexOf("Cancel")), dialog.indexOf("Cancel"));
    expect(cancelControl).toContain("onClick={onClose}");
    expect(cancelControl).not.toContain("saveAvatarDraft");
    expect(dialog).toContain("onClick={handleSave}");
  });

  it("keeps the editor below the status bar and the save row above the dock", () => {
    expect(dialog).toContain("max-h-[calc(100dvh-env(safe-area-inset-top,0px))]");
    expect(dialog).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]");
    expect(dialog).toContain("overflow-y-auto");
    expect(dialog).toContain("z-[10050]");
    expect(dialog).toContain('root.setAttribute("data-cq-avatar-lab-open", "true")');
    expect(read("app/globals.css")).toContain("html[data-cq-avatar-lab-open] .cq-dock-nav");
  });
});
