import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client/dashboardApi", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/client/dashboardApi")>();
  return { ...actual, postAuthed: vi.fn() };
});

vi.mock("@/lib/client/quadPostImageUpload", () => ({
  isQuadPostProofDataUrl: (url: string) => url.startsWith("data:"),
  uploadQuadPostProofDataUrl: vi.fn(),
}));

vi.mock("@/lib/quadFieldNote", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/quadFieldNote")>();
  return { ...actual, quadPostRowToFieldNote: (row: { id: string }) => ({ id: row.id }) };
});

import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import { uploadQuadPostProofDataUrl } from "@/lib/client/quadPostImageUpload";
import { createQuadPostRequest } from "@/lib/client/quadPostsClient";

const postMock = vi.mocked(postAuthed);

/** What the composer sends after every carousel item finished uploading to Storage. */
const mixedCarouselPost = {
  body: "Sunset at the quad",
  proofUrl: "https://proj.supabase.co/storage/v1/object/public/quad-post-images/u/posts/1-a.jpg",
  mediaType: "image" as const,
  mediaItems: [
    { mediaId: "11111111-1111-4111-8111-111111111111", sortOrder: 0 },
    { mediaId: "22222222-2222-4222-8222-222222222222", sortOrder: 1 },
  ],
  coverMediaId: "11111111-1111-4111-8111-111111111111",
  publishIdempotencyKey: "pub-key-1",
  visibility: "public" as const,
  tags: [],
};

beforeEach(() => {
  postMock.mockReset();
});

describe("post creation after direct uploads", () => {
  it("sends only media references and metadata — never media bytes", async () => {
    postMock.mockResolvedValue({ post: { id: "post-1" }, realmMoment: null });
    await createQuadPostRequest(mixedCarouselPost as never, "viewer");

    const [path, body] = postMock.mock.calls[0]!;
    expect(path).toBe("/api/quad/posts");
    const json = JSON.stringify(body);
    expect(json.length).toBeLessThan(2_000);
    expect(json).not.toMatch(/data:(image|video)\//);
    expect(body).toMatchObject({ mediaItems: mixedCarouselPost.mediaItems, publishIdempotencyKey: "pub-key-1" });
    expect(uploadQuadPostProofDataUrl).not.toHaveBeenCalled();
  });

  it("surfaces a post-creation failure so the composer keeps its uploaded media for another try", async () => {
    postMock.mockRejectedValueOnce(new ApiRequestError("Could not create post.", 500, "QUAD_POST_FAILED"));
    await expect(createQuadPostRequest(mixedCarouselPost as never, "viewer")).rejects.toBeInstanceOf(ApiRequestError);

    // The retry reuses the same uploaded media ids and publish key — nothing is re-uploaded.
    postMock.mockResolvedValueOnce({ post: { id: "post-1" }, realmMoment: null });
    await createQuadPostRequest(mixedCarouselPost as never, "viewer");
    const [first, second] = postMock.mock.calls.map(([, body]) => body as typeof mixedCarouselPost);
    expect(second!.mediaItems).toEqual(first!.mediaItems);
    expect(second!.publishIdempotencyKey).toBe(first!.publishIdempotencyKey);
  });
});
