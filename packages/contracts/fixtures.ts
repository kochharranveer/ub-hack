import type { CareSnapshot } from "./care";
export function fixtureCare(): CareSnapshot {
  return {
    contractVersion: "2.0.0",
    patientId: "pat-demo-001",
    plan: {
      id: "plan-demo-001",
      patientId: "pat-demo-001",
      version: 1,
      status: "approved",
      sourceText:
        "FICTIONAL DEMO ONLY. Use the demo movement to test the app. Contact the demo care team if you need help.",
      instructions: [
        {
          id: "line-1",
          text: "Use the demo movement to test the app.",
          sourceRef: "demo.txt:1",
        },
        {
          id: "line-2",
          text: "Contact the demo care team if you need help.",
          sourceRef: "demo.txt:2",
        },
      ],
      approvedBy: "demo-clinician",
      demoOnly: true,
    },
    drafts: [],
    tasks: [
      {
        id: "task-demo-001",
        patientId: "pat-demo-001",
        planId: "plan-demo-001",
        planVersion: 1,
        title: "Review your demonstration plan",
        status: "pending",
        revision: 0,
        evidence: "unknown",
      },
    ],
    help: [],
    acknowledgements: [],
  };
}
