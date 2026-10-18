import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const friendsSrc = readFileSync(join(process.cwd(), "components/FindFriends.tsx"), "utf8");
const searchSrc = readFileSync(join(process.cwd(), "components/people/PeopleSearchField.tsx"), "utf8");
const cssSrc = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("Find People layout redesign", () => {
  it("uses a compact heading and three tabs instead of stacked hero cards", () => {
    expect(friendsSrc).toContain("Find People");
    expect(friendsSrc).toContain("Connect with your campus community.");
    expect(friendsSrc).toContain("PeopleSegmentedNav");
    expect(friendsSrc).toContain("PeopleSearchField");
    expect(searchSrc).toContain("Search names or usernames");
    expect(friendsSrc).not.toContain("Campus Connections");
    expect(friendsSrc).not.toContain("📬");
    expect(friendsSrc).not.toContain("🦌");
    expect(friendsSrc).not.toContain("💬");
    expect(friendsSrc).not.toContain("👋");
    expect(friendsSrc).not.toContain("FriendCard");
  });

  it("keeps compact rows, message icons, and search-first discover", () => {
    expect(friendsSrc).toContain("MessageCircle");
    expect(friendsSrc).toContain("Message @");
    expect(friendsSrc).toContain("peopleContentMode");
    expect(friendsSrc).toContain("discoverConnectionPreview");
    expect(friendsSrc).toContain("See all");
    expect(cssSrc).toContain(".cq-people-row-text");
    expect(cssSrc).toContain("text-overflow: ellipsis");
    expect(cssSrc).toContain("min-height: 50px");
  });
});
