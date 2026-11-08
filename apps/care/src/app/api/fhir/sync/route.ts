import { care } from "@/server/service";
import { fetchCarePlanSource } from "@/server/fhir";
import { generateCarePlanDraft } from "@/server/plan-generator";
import { DomainError } from "@platform/json-store";
import { FhirSyncSchema } from "@contracts";
import { respond } from "@platform/http";
export async function POST(req: Request) {
  return respond(async () => {
    const request = FhirSyncSchema.parse(await req.json());
    const source = await fetchCarePlanSource(request.carePlanId);
    const existing = await care.findPlanBySourceRef(source.sourceRef);
    if (existing) return existing;
    const generated = await generateCarePlanDraft(source);
    if (!generated.instructions.length) {
      throw new DomainError("AI_NO_SUPPORTED_INSTRUCTIONS", "The FHIR record did not contain a supported patient action or a useful clinician review item", 422);
    }
    return care.importPlan({
      requestId: request.requestId,
      sourceText: source.sourceText,
      sourceRef: source.sourceRef,
      sourcePatientId: source.patientId,
      summary: generated.summary,
      summaryEvidence: generated.summaryEvidence,
      clinicalContext: source.clinicalContext,
      dataWarnings: source.dataWarnings,
      instructions: generated.instructions,
    });
  });
}
