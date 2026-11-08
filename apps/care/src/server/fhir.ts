import { DomainError } from "../../../../packages/platform/json-store";

const defaultBaseUrl = "https://hapi.fhir.org/baseR4";

export type FhirResource = {
  resourceType?: string;
  id?: string;
  meta?: { versionId?: string; lastUpdated?: string };
  fhirVersion?: string;
  rest?: Array<{
    resource?: Array<{ type?: string; interaction?: Array<{ code?: string }> }>;
  }>;
  entry?: Array<{ resource?: FhirResource }>;
  subject?: { reference?: string };
  code?: { text?: string; coding?: Array<{ display?: string; code?: string }> };
  description?: string | { text?: string; coding?: Array<{ display?: string }> };
  title?: string;
  status?: string;
  clinicalStatus?: { text?: string; coding?: Array<{ display?: string }> };
  verificationStatus?: { text?: string; coding?: Array<{ display?: string }> };
  intent?: string;
  period?: { start?: string; end?: string };
  category?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
  valueQuantity?: { value?: number; unit?: string; code?: string };
  valueString?: string;
  valueBoolean?: boolean;
  valueInteger?: number;
  valueCodeableConcept?: { text?: string; coding?: Array<{ display?: string }> };
  interpretation?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
  referenceRange?: Array<{ text?: string; low?: { value?: number; unit?: string }; high?: { value?: number; unit?: string } }>;
  effectiveDateTime?: string;
  effectivePeriod?: { start?: string; end?: string };
  recordedDate?: string;
  authoredOn?: string;
  medicationCodeableConcept?: { text?: string; coding?: Array<{ display?: string }> };
  dosageInstruction?: Array<{ text?: string }>;
  lifecycleStatus?: string;
  activity?: Array<{
    detail?: {
      description?: string;
      code?: { text?: string; coding?: Array<{ display?: string }> };
    };
  }>;
};
type FhirCarePlan = FhirResource;
export type FhirSourceSnippet = { text: string; sourceRef: string };
export type FhirPlanSource = {
  patientId: string;
  carePlanId: string | null;
  sourceRef: string;
  sourceText: string;
  snippets: FhirSourceSnippet[];
  clinicalContext: Array<{
    resourceType: string;
    label: string;
    value: string;
    sourceRef: string;
    observedAt: string | null;
  }>;
  dataWarnings: string[];
};
export type FhirCarePlanOption = {
  id: string;
  version: string | null;
  title: string;
  status: string;
  intent: string | null;
  period: { start?: string; end?: string } | null;
  lastUpdated: string | null;
  preview: string;
};

function config() {
  const baseUrl = (process.env.FHIR_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new DomainError("CONFIGURATION_ERROR", "FHIR_BASE_URL is not a valid URL", 503);
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new DomainError("CONFIGURATION_ERROR", "FHIR_BASE_URL must use HTTPS", 503);
  }
  return { baseUrl, patientId: process.env.FHIR_PATIENT_ID?.trim() || "" };
}

async function request(path: string) {
  const { baseUrl } = config();
  const headers: Record<string, string> = { Accept: "application/fhir+json" };
  if (process.env.FHIR_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.FHIR_ACCESS_TOKEN}`;
  const response = await fetch(`${baseUrl}/${path}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new DomainError("FHIR_UNAVAILABLE", `FHIR server returned ${response.status}`, 502);
  }
  return response.json() as Promise<FhirResource>;
}

export async function fhirStatus() {
  const { baseUrl, patientId } = config();
  const metadata = await request("metadata");
  if (metadata.resourceType !== "CapabilityStatement" || !metadata.fhirVersion) {
    throw new DomainError("FHIR_INVALID_RESPONSE", "FHIR server did not return a valid CapabilityStatement", 502);
  }
  const resources = (metadata.rest || []).flatMap((rest) => rest.resource || []).map((resource) => resource.type).filter((type): type is string => Boolean(type));
  return {
    connected: true,
    baseUrl,
    fhirVersion: metadata.fhirVersion,
    supportsCarePlan: resources.includes("CarePlan"),
    supportedResources: resources,
    patientConfigured: Boolean(patientId),
  };
}

async function fetchActiveCarePlans() {
  const { patientId } = config();
  if (!patientId) {
    throw new DomainError("CONFIGURATION_REQUIRED", "Set FHIR_PATIENT_ID to a synthetic patient ID", 400);
  }
  const capability = await fhirStatus();
  if (!capability.supportsCarePlan) {
    throw new DomainError("FHIR_UNSUPPORTED", "This FHIR server does not advertise CarePlan support", 502);
  }
  const bundle = await request(`CarePlan?patient=${encodeURIComponent(`Patient/${patientId}`)}&status=active&_count=20`);
  if (bundle.resourceType !== "Bundle") {
    throw new DomainError("FHIR_INVALID_RESPONSE", "FHIR server did not return a CarePlan search Bundle", 502);
  }
  const plans = (bundle.entry || [])
    .map((entry) => entry.resource)
    .filter((resource): resource is FhirCarePlan => resource?.resourceType === "CarePlan" && Boolean(resource.id))
    .filter((plan) => {
      const subject = plan.subject?.reference;
      return subject === `Patient/${patientId}` || subject?.endsWith(`/Patient/${patientId}`);
    });
  if (!plans.length) {
    throw new DomainError("FHIR_NO_CAREPLAN", "No active CarePlan was found for the configured synthetic patient", 404);
  }
  return { patientId, plans, supportedResources: capability.supportedResources };
}

function display(concept?: { text?: string; coding?: Array<{ display?: string }> }) {
  return concept?.text?.trim() || concept?.coding?.map((item) => item.display?.trim()).find(Boolean) || "";
}

function factFor(resource: FhirResource) {
  const type = resource.resourceType || "Resource";
  let label = "";
  let value = "";
  let observedAt: string | null = resource.meta?.lastUpdated || null;
  if (type === "Condition") {
    label = display(resource.code) || "Condition";
    const state = display(resource.clinicalStatus);
    const verification = display(resource.verificationStatus);
    value = [state ? `clinical status: ${state}` : "clinical status not provided", verification ? `verification: ${verification}` : "verification status not provided"].join("; ");
    observedAt = resource.recordedDate || observedAt;
  } else if (type === "Observation") {
    label = display(resource.code) || "Observation";
    const quantity = resource.valueQuantity;
    value = quantity ? `${quantity.value ?? ""}${quantity.unit ? ` ${quantity.unit}` : ""}`.trim()
      : resource.valueString || (resource.valueBoolean === undefined ? "" : String(resource.valueBoolean))
        || (resource.valueInteger === undefined ? "" : String(resource.valueInteger))
        || display(resource.valueCodeableConcept);
    const interpretation = resource.interpretation?.map(display).filter(Boolean).join(", ");
    const ranges = (resource.referenceRange || []).map((range) => range.text || [range.low && `low ${range.low.value} ${range.low.unit || ""}`, range.high && `high ${range.high.value} ${range.high.unit || ""}`].filter(Boolean).join(", ")).filter(Boolean);
    value = [value, interpretation && `interpretation: ${interpretation}`, ranges.length && `reference range: ${ranges.join(" / ")}`].filter(Boolean).join("; ");
    observedAt = resource.effectiveDateTime || resource.effectivePeriod?.start || observedAt;
  } else if (type === "MedicationRequest") {
    label = display(resource.medicationCodeableConcept) || "Medication request";
    value = [resource.status && `status: ${resource.status}`, ...(resource.dosageInstruction || []).map((item) => item.text?.trim()).filter(Boolean)].filter(Boolean).join("; ");
    observedAt = resource.authoredOn || observedAt;
  } else if (type === "Goal") {
    label = display(typeof resource.description === "string" ? { text: resource.description } : resource.description) || "Goal";
    value = resource.lifecycleStatus || "";
  }
  return { label: label.trim(), value: value.trim(), observedAt };
}

function belongsToPatient(reference: string | undefined, patientId: string) {
  return reference === `Patient/${patientId}` || reference?.endsWith(`/Patient/${patientId}`) || reference === `urn:uuid:${patientId}`;
}

export function buildClinicalContextFromResources(patientId: string, resources: FhirResource[]) {
  const allowedTypes = new Set(["Condition", "Observation", "MedicationRequest", "Goal"]);
  const clinicalContext: FhirPlanSource["clinicalContext"] = [];
  const snippets: FhirSourceSnippet[] = [];
  for (const resource of resources) {
    const type = resource.resourceType || "";
    if (!resource.id || !allowedTypes.has(type) || !belongsToPatient(resource.subject?.reference, patientId)) continue;
    const fact = factFor(resource);
    if (!fact.label || !fact.value) continue;
    const sourceRef = `FHIR ${type}/${resource.id}/_history/${resource.meta?.versionId || "current"}`;
    clinicalContext.push({ resourceType: type, ...fact, sourceRef });
    snippets.push({ text: `${fact.label}: ${fact.value}`, sourceRef });
    if (clinicalContext.length >= 100) break;
  }
  return { clinicalContext, snippets };
}

export function buildCarePlanSourceFromResources(
  patientId: string,
  plan: FhirCarePlan,
  resources: FhirResource[],
  dataWarnings: string[] = [],
): FhirPlanSource {
  if (!plan.id || plan.resourceType !== "CarePlan") {
    throw new DomainError("FHIR_INVALID_CAREPLAN", "The selected FHIR resource is not a CarePlan", 422);
  }
  if (plan.subject?.reference && !belongsToPatient(plan.subject.reference, patientId)) {
    throw new DomainError("FHIR_PATIENT_MISMATCH", "CarePlan subject does not match the selected patient", 403);
  }
  if (plan.status !== "active") {
    throw new DomainError("FHIR_CAREPLAN_NOT_ACTIVE", "Only active CarePlans can be curated", 422);
  }
  if (plan.period?.end && plan.period.end.slice(0, 10) < new Date().toISOString().slice(0, 10)) {
    throw new DomainError("FHIR_CAREPLAN_EXPIRED", "The selected CarePlan has ended and cannot be used to create a current draft", 422);
  }
  const sourceRef = `FHIR CarePlan/${plan.id}/_history/${plan.meta?.versionId || "current"}`;
  const context = buildClinicalContextFromResources(patientId, resources);
  const snippets = [...planSnippets(plan), ...context.snippets];
  if (!snippets.length) {
    throw new DomainError("FHIR_EMPTY_CAREPLAN", "The CarePlan has no readable title, description, or activity instructions", 422);
  }
  return {
    patientId,
    carePlanId: plan.id,
    sourceRef,
    snippets,
    clinicalContext: context.clinicalContext,
    dataWarnings,
    sourceText: snippets.map((snippet) => `${snippet.sourceRef}: ${snippet.text}`).join("\n").slice(0, 20000),
  };
}

async function fetchClinicalContext(patientId: string, supported: string[]) {
  const clinicalResources: FhirResource[] = [];
  const dataWarnings: string[] = [];
  const searches = [
    ["Condition", `Condition?patient=${encodeURIComponent(`Patient/${patientId}`)}&_count=30`],
    ["Observation", `Observation?patient=${encodeURIComponent(`Patient/${patientId}`)}&_sort=-date&_count=30`],
    ["MedicationRequest", `MedicationRequest?patient=${encodeURIComponent(`Patient/${patientId}`)}&status=active&_count=30`],
    ["Goal", `Goal?subject=${encodeURIComponent(`Patient/${patientId}`)}&_count=30`],
  ] as const;
  const results = await Promise.all(searches.map(async ([type, query]) => {
    if (!supported.includes(type)) {
      dataWarnings.push(`${type} is not supported by this FHIR server.`);
      return { type, resources: [] as FhirResource[] };
    }
    try {
      const bundle = await request(query);
      if (bundle.resourceType !== "Bundle") throw new Error("not a Bundle");
      const resources = (bundle.entry || []).map((entry) => entry.resource)
        .filter((resource): resource is FhirResource => resource?.resourceType === type && Boolean(resource.id))
        .filter((resource) => resource.subject?.reference === `Patient/${patientId}` || resource.subject?.reference?.endsWith(`/Patient/${patientId}`));
      return { type, resources };
    } catch {
      dataWarnings.push(`${type} data could not be read from this FHIR server.`);
      return { type, resources: [] as FhirResource[] };
    }
  }));
  for (const { resources: matchedResources } of results) {
    clinicalResources.push(...matchedResources);
  }
  return { resources: clinicalResources, dataWarnings: [...new Set(dataWarnings)] };
}

function planSnippets(plan: FhirCarePlan): FhirSourceSnippet[] {
  const sourceRef = `FHIR CarePlan/${plan.id}/_history/${plan.meta?.versionId || "current"}`;
  const snippets: FhirSourceSnippet[] = [];
  const add = (suffix: string, value?: string) => {
    const text = value?.trim();
    if (text && !snippets.some((snippet) => snippet.text === text)) {
      snippets.push({ text, sourceRef: `${sourceRef}#${suffix}` });
    }
  };
  add("title", plan.title);
  add("description", typeof plan.description === "string" ? plan.description : display(plan.description));
  (plan.activity || []).forEach((activity, index) => {
    add(`activity-${index + 1}-description`, activity.detail?.description);
    add(`activity-${index + 1}-code-text`, activity.detail?.code?.text);
    (activity.detail?.code?.coding || []).forEach((coding, codingIndex) =>
      add(`activity-${index + 1}-coding-${codingIndex + 1}`, coding.display),
    );
  });
  return snippets;
}

export async function listCarePlanOptions(): Promise<FhirCarePlanOption[]> {
  const { plans } = await fetchActiveCarePlans();
  return plans.map((plan) => {
    const snippets = planSnippets(plan);
    const category = (plan.category || [])
      .flatMap((item) => [item.text, ...(item.coding || []).map((coding) => coding.display)])
      .find(Boolean);
    return {
      id: plan.id!,
      version: plan.meta?.versionId || null,
      title: plan.title || category || (typeof plan.description === "string" ? plan.description : display(plan.description)) || `CarePlan ${plan.id}`,
      status: plan.status || "unknown",
      intent: plan.intent || null,
      period: plan.period || null,
      lastUpdated: plan.meta?.lastUpdated || null,
      preview: snippets.map((snippet) => snippet.text).slice(0, 2).join(" · "),
    };
  });
}

export async function fetchCarePlanSource(carePlanId?: string): Promise<FhirPlanSource> {
  const { patientId, plans, supportedResources } = await fetchActiveCarePlans();
  if (!carePlanId && plans.length > 1) {
    throw new DomainError("FHIR_SELECTION_REQUIRED", "Multiple active CarePlans were found. Choose a CarePlan ID from GET /care/api/fhir/plans.", 409);
  }
  const plan = carePlanId
    ? plans.find((candidate) => candidate.id === carePlanId)
    : plans[0];
  if (!plan) {
    throw new DomainError("FHIR_CAREPLAN_NOT_FOUND", "The selected CarePlan is not an active plan for the configured patient", 404);
  }
  const context = await fetchClinicalContext(patientId, supportedResources);
  return buildCarePlanSourceFromResources(patientId, plan, context.resources, context.dataWarnings);
}
