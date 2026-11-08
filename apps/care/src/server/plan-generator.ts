import { z } from "zod";
import { DomainError } from "../../../../packages/platform/json-store";
import type { FhirPlanSource } from "./fhir";

export type DraftProvider = "gemini" | "ollama";
export type DraftGeneratorOptions = { provider?: DraftProvider; model?: string };

const EvidenceSchema = z.object({
  sourceRef: z.string().min(1),
  quote: z.string().trim().min(1).max(1000),
}).strict();

const ResultSchema = z.object({
  summary: z.object({
    text: z.string().trim().min(1).max(3000),
    evidence: z.array(EvidenceSchema).min(1).max(10),
  }).strict(),
  instructions: z.array(z.object({
    text: z.string().trim().min(1).max(500),
    audience: z.enum(["patient", "clinician"]),
    rationale: z.string().trim().min(1).max(2000),
    evidence: z.array(EvidenceSchema).min(1).max(10),
  }).strict()).max(30),
}).strict();

export async function generateCarePlanDraft(source: FhirPlanSource, options: DraftGeneratorOptions = {}) {
  const provider = options.provider || "gemini";
  const apiKey = process.env.CARE_GEMINI_API_KEY;
  const model = options.model || process.env.CARE_GEMINI_MODEL;
  if (provider === "gemini" && (!apiKey || !model)) {
    throw new DomainError("AI_NOT_CONFIGURED", "Set CARE_GEMINI_API_KEY and CARE_GEMINI_MODEL to generate a care-plan draft", 503);
  }
  if (provider === "gemini" && !/^[a-zA-Z0-9._-]+$/.test(model || "")) {
    throw new DomainError("AI_NOT_CONFIGURED", "CARE_GEMINI_MODEL must be a model ID, without a URL", 503);
  }
  if (provider === "ollama" && model && !/^[a-zA-Z0-9._:-]+$/.test(model)) {
    throw new DomainError("AI_NOT_CONFIGURED", "Local Ollama model name is invalid", 503);
  }

  const evidenceSchema = {
    type: "OBJECT",
    properties: { sourceRef: { type: "STRING" }, quote: { type: "STRING" } },
    required: ["sourceRef", "quote"],
  };
  const schema = {
    type: "OBJECT",
    properties: {
      summary: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, evidence: { type: "ARRAY", items: evidenceSchema } },
        required: ["text", "evidence"],
      },
      instructions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING" },
            audience: { type: "STRING", enum: ["patient", "clinician"] },
            rationale: { type: "STRING" },
            evidence: { type: "ARRAY", items: evidenceSchema },
          },
          required: ["text", "audience", "rationale", "evidence"],
        },
      },
    },
    required: ["summary", "instructions"],
  };
  const prompt = [
    "You are assisting a licensed clinician who will review this draft. You are not the clinician and must not make a diagnosis or treatment decision.",
    "Use all supplied FHIR facts together. Write a concise summary of what the record actually says, including when evidence is missing or inconsistent. Do not state that absent data is normal. Cite exact supporting quotes for the summary too.",
    source.carePlanId
      ? "Create patient-facing actions only when the supplied active CarePlan contains a clear, practical action. Keep its intent and limits; do not turn a broad goal into a new clinical instruction."
      : "No active CarePlan was supplied. Do not create patient-facing actions. You may summarize the record and add clinician-only review items when the supplied clinical facts explicitly warrant human review.",
    "You may add clinician-only review items when a clinically relevant Condition, Observation, or MedicationRequest has an explicit unresolved or flagged fact, or when a vague CarePlan goal needs human clarification. Do not turn unrelated personal goals into clinical review tasks. Phrase review items as a question or request to review the cited fact, not as a treatment recommendation.",
    "Do not diagnose, prescribe, change medications, recommend tests, invent schedules, or use external medical knowledge. Medication facts are context only and must never become a patient instruction.",
    "For each item, state why it is included and cite one or more exact quotes from the supplied facts. Every quote must be copied verbatim and paired with its exact sourceRef.",
    "If the record is too sparse for a useful action, return no instructions and explain the limitation in summary.",
    `FHIR facts: ${JSON.stringify(source.snippets)}`,
    `Data retrieval warnings: ${JSON.stringify(source.dataWarnings)}`,
  ].join("\n");

  const ollamaSchema = JSON.parse(JSON.stringify(schema), (_key, value) =>
    typeof value === "string" && ["OBJECT", "ARRAY", "STRING"].includes(value) ? value.toLowerCase() : value,
  );
  let response: Response;
  let responseText: string | undefined;
  try {
    if (provider === "ollama") {
      response = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || "qwen3:8b",
          prompt: `${prompt}\nReturn only JSON matching the required schema.`,
          format: ollamaSchema,
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(120000),
      });
    } else {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey!, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema },
        }),
        signal: AbortSignal.timeout(30000),
      });
    }
  } catch {
    throw new DomainError("AI_UNAVAILABLE", "Care-plan AI request failed or timed out", 503);
  }
  if (!response.ok) {
    let providerMessage = "";
    try {
      const errorPayload = await response.json() as { error?: { message?: string } };
      providerMessage = errorPayload.error?.message?.replace(/[\r\n]+/g, " ").slice(0, 240) || "";
    } catch {
      // Keep the status code when the provider doesn't return JSON.
    }
    throw new DomainError("AI_UNAVAILABLE", `Care-plan AI provider returned ${response.status}${providerMessage ? `: ${providerMessage}` : ""}`, 503);
  }
  const payload = await response.json() as {
    response?: string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  responseText = provider === "ollama"
    ? payload.response
    : payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!responseText) throw new DomainError("AI_EMPTY_RESPONSE", "Care-plan AI returned no draft", 502);
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new DomainError("AI_INVALID_RESPONSE", "Care-plan AI returned invalid structured data", 502);
  }
  let result: z.infer<typeof ResultSchema>;
  try {
    result = ResultSchema.parse(parsed);
  } catch (error) {
    const issues = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join(".") || "result"}:${issue.code}`).slice(0, 8).join(", ")
      : "unknown schema mismatch";
    throw new DomainError("AI_INVALID_RESPONSE", `Care-plan AI returned data that did not match the draft schema (${issues})`, 502);
  }

  const snippets = new Map(source.snippets.map((snippet) => [snippet.sourceRef, snippet.text]));
  const carePlanPrefix = source.carePlanId ? `FHIR CarePlan/${source.carePlanId}/` : null;
  for (const evidence of result.summary.evidence) {
    const fact = snippets.get(evidence.sourceRef);
    if (!fact || !fact.includes(evidence.quote)) {
      throw new DomainError("AI_UNSUPPORTED_CLAIM", "Care-plan AI returned a summary without exact source evidence", 502);
    }
  }
  for (const instruction of result.instructions) {
    for (const evidence of instruction.evidence) {
      const fact = snippets.get(evidence.sourceRef);
      if (!fact || !fact.includes(evidence.quote)) {
        throw new DomainError("AI_UNSUPPORTED_CLAIM", "Care-plan AI returned an item without an exact source quote", 502);
      }
    }
    if (instruction.audience === "patient" && (!carePlanPrefix || !instruction.evidence.some((item) => item.sourceRef.startsWith(carePlanPrefix)))) {
      throw new DomainError("AI_UNSUPPORTED_CLAIM", "Patient actions must be supported by the active CarePlan", 502);
    }
  }

  return {
    summary: result.summary.text,
    summaryEvidence: result.summary.evidence,
    instructions: result.instructions.map((instruction) => ({
      id: "pending",
      text: instruction.text,
      sourceRef: instruction.evidence[0].sourceRef,
      audience: instruction.audience,
      rationale: instruction.rationale,
      evidence: instruction.evidence,
    })),
  };
}
