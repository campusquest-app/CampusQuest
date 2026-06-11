import { describe, expect, it } from "vitest";
import { parseUrinvolvedEventsRss } from "@/lib/server/urinvolved/parseRssEvents";

const SAMPLE_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Test Event</title>
      <guid>https://urinvolved.uri.edu/event/999001</guid>
      <link>https://urinvolved.uri.edu/event/999001</link>
      <description><![CDATA[<div class="h-event vevent">
        <div class="p-description description"><p>Hello campus</p></div>
        <p>From <time datetime="2026-07-15T18:00:00.0000000-04:00">Wednesday, July 15, 2026 6:00 PM</time>
        at <span class="p-location location">Memorial Union</span>.</p>
      </div>]]></description>
      <category>Social</category>
      <start xmlns="events">Wed, 15 Jul 2026 22:00:00 GMT</start>
      <end xmlns="events">Thu, 16 Jul 2026 01:00:00 GMT</end>
      <location xmlns="events">Memorial Union</location>
      <host xmlns="events">Health Services</host>
      <enclosure url="https://example.com/event.png" length="1" type="image/jpeg" />
    </item>
  </channel>
</rss>`;

describe("parseUrinvolvedEventsRss", () => {
  it("parses event id, times, location, and hosts", () => {
    const events = parseUrinvolvedEventsRss(SAMPLE_RSS);
    expect(events).toHaveLength(1);
    expect(events[0]?.externalId).toBe("999001");
    expect(events[0]?.title).toBe("Test Event");
    expect(events[0]?.locationName).toBe("Memorial Union");
    expect(events[0]?.organizationName).toBe("Health Services");
    expect(events[0]?.startsAt).toBeTruthy();
    expect(events[0]?.imageUrl).toContain("example.com/event.png");
  });
});
