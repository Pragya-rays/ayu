/**
 * Opens the phone's share sheet, or copies the text if that is missing or fails.
 * Closing the sheet on purpose does nothing, so a person is never left thinking it worked.
 */
export async function shareOrCopy(text: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
