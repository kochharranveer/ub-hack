/** A separate, unambiguous reply to an already spoken proposal; never infer from a medication report. */
export function spokenConfirmation(text: string,allowShortAnswer=true): "confirm" | "cancel" | undefined {
  const answer=text.toLowerCase().replace(/[.,!?]/g,"").replace(/\s+/g," ").trim();
  if (!allowShortAnswer && !/\b(confirm|cancel|dismiss|save|record|mark)\b/.test(answer)) return undefined;
  if (["yes","yes please","confirm","confirm it","confirm action","save it","yes save it","yes record it","mark it as taken","yes mark it as taken","yes confirm","yes confirm it","go ahead","please do","yes go ahead"].includes(answer)) return "confirm";
  if (["no","no thanks","no thank you","cancel","cancel it","dismiss","dismiss it","do not confirm","don't confirm"].includes(answer)) return "cancel";
  return undefined;
}
