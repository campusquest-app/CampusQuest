import { ApiRequestError } from "@/lib/client/dashboardApi";

const NETWORK_CODES = new Set(["NETWORK_ERROR", "TIMEOUT", "UPLOAD_STALLED", "ABORTED"]);

/** Student-facing post failure copy. Mentions connectivity only for real network failures. */
export function formatQuadPostSubmitError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const code = (error.code ?? "").trim();
    if (NETWORK_CODES.has(code) || error.status === 0) {
      return "Could not reach CampusQuest. Check your connection and try again.";
    }
    const message = error.message.trim();
    if (code === "ANONYMOUS_NOTICE_REQUIRED") {
      return "Accept the anonymity notice before posting anonymously.";
    }
    if (code === "SCHOOL_VERIFICATION_REQUIRED") {
      return "Verify your campus email before posting anonymously.";
    }
    if (code === "ACCOUNT_BANNED" || code === "ACCOUNT_SUSPENDED") {
      return message || "Your account cannot post right now.";
    }
    if (code === "ANONYMOUS_POST_FORBIDDEN" || code === "STUDENT_FEED_PRIVATE") {
      return message || "Anonymous posts are only available on the Campus Feed.";
    }
    if (code === "PUBLISH_IN_PROGRESS" || code === "PUBLISH_ALREADY_CONSUMED") {
      return "This post is already publishing. Wait a moment before trying again.";
    }
    if (code === "RATE_LIMITED") {
      return "You’re posting too quickly. Wait a moment and try again.";
    }
    if (code === "VALIDATION_ERROR") {
      return message || "Check your post and try again.";
    }
    if (message && !/could not be reached|network|offline/i.test(message)) {
      return message;
    }
    if (error.status >= 500) {
      return "CampusQuest couldn’t save that post. Try again in a moment.";
    }
    if (error.status >= 400) {
      return message || "Couldn’t publish this post. Try again.";
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (/could not be reached|network|offline|failed to fetch/i.test(message)) {
      return "Could not reach CampusQuest. Check your connection and try again.";
    }
    if (message) return message;
  }

  return "Couldn’t publish this post. Try again.";
}

export function isQuadPostNetworkError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return NETWORK_CODES.has(error.code ?? "") || error.status === 0;
  }
  if (error instanceof Error) {
    return /could not be reached|network|offline|failed to fetch/i.test(error.message);
  }
  return false;
}
