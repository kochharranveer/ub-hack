/** Explicit navigation requests only: questions about exercise stay conversational. */
export function requestsExercise(text: string) {
  const value = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .trim()
    .replace(/^(?:(?:hey|hi|okay|ok|panda|please)[\s,.!]+)+/, "");
  if (
    /\b(?:don't|do not|can't|cannot|not|never|stop|cancel|avoid|later|tomorrow)\b/.test(
      value,
    )
  )
    return false;
  if (
    /^(?:what|why|how|when|where|should|is|are|does|do)\b|^(?:can|could|may)\s+i\b/.test(
      value,
    )
  )
    return false;
  if (
    /\b(?:pain|hurts?|discomfort|swollen|swelling|dizzy|breathless)\b/.test(
      value,
    )
  )
    return false;
  if (
    /\b(?:how to|what if|whether|should i|can i|plan|report|history|benefits|risks)\b/.test(
      value,
    )
  )
    return false;
  return (
    /\b(?:open|start|begin|launch|show|go to|take me to)\b.{0,35}\b(?:rehab|rehabilitation|exercise|exercises|workout)\b/.test(
      value,
    ) ||
    /\b(?:let's|let us|i want to|i'd like to|i am ready to|i'm ready to)\s+(?:do\s+(?:(?:my|some|the)\s+)?|start\s+)?(?:exercise|exercises|rehab|work out)\b/.test(
      value,
    )
  );
}
