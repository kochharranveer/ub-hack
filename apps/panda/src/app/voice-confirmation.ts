/** A separate, unambiguous reply to an already spoken proposal; never infer from a medication report. */
export function spokenConfirmation(text: string): "confirm" | "cancel" | undefined {
  const answer=text.toLowerCase().replace(/[.,!?]/g,"").replace(/\s+/g," ").trim();
  if (["yes","yes please","confirm","confirm action","yes confirm","yes confirm it","go ahead","please do","yes go ahead"].includes(answer)) return "confirm";
  if (["no","no thanks","no thank you","cancel","cancel it","dismiss","dismiss it","do not confirm","don't confirm"].includes(answer)) return "cancel";
  return undefined;
}
