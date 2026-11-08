import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  cvService as upstreamService,
  type CvStoreData as UpstreamState,
  type CvStore,
} from "../../references/yuvraj/camera-to-text-371198e/source/apps/rehab/src/server/cv/service";
import { DomainError as UpstreamError } from "../../references/yuvraj/camera-to-text-371198e/source/packages/platform/json-store";
import {
  CvRepAnalysisInputSchema,
  CvCalibrationAssistInputSchema,
} from "./contracts";
import { domainStore } from "../platform/domain-store";
import { DomainError, dataFile } from "../platform/json-store";
import { connected, getCare } from "../platform/peers";
import { requireRole } from "../platform/production/context";
import type { CareSnapshot } from "../contracts/care";
import type {
  CvSession,
  CvReport,
  CvCareReference,
} from "../contracts/rehab-cv";

type Metadata = {
  careReference?: CvCareReference;
  analysisMethod?: "gemini_landmark_analysis";
  analysisAcceptedAt?: string;
  analysisControlRevision?: number;
  analysisLastOffsetMs?: number;
  analysisIncomplete?: boolean;
};
export type CvStoreData = Omit<UpstreamState, "sessions"> & {
  sessions: (UpstreamState["sessions"][number] & Metadata)[];
};
export type { CvStore };
export type CalibrationRecord = {
  calibrationId: string;
  result: import("./contracts").CvCalibrationAssistResponse;
  exerciseId: string;
  side: "left" | "right";
  acceptedAt: string;
  careReference?: CvCareReference;
};
type Guard = {
  sessionId: string;
  owner: string;
  revision: number;
  lastOffset: number;
};
export function cvService(
  file = dataFile("rehab-cv"),
  options: {
    now?: () => Date;
    fetcher?: typeof fetch;
    store?: CvStore;
    care?: () => Promise<CareSnapshot | undefined>;
  } = {},
) {
  const backing =
    options.store ||
    domainStore<CvStoreData>("cv", file, () => ({
      sessions: [],
      receipts: {},
    }));
  const binding = new AsyncLocalStorage<CvCareReference | undefined>(),
    analysisGuard = new AsyncLocalStorage<Guard>();
  const now = options.now || (() => new Date());
  const store: CvStore = {
    snapshot: () => backing.snapshot(),
    update: (fn) =>
      backing.update(async (raw) => {
        const state = raw as CvStoreData;
        for (const s of state.sessions) {
          s.analysis ??= null;
          s.analysisBatchSequence ??= 0;
        }
        const ids = new Set(state.sessions.map((s) => s.id));
        const guard = analysisGuard.getStore();
        if (guard) {
          const s = state.sessions.find(
            (s) => s.id === guard.sessionId && s.owner === guard.owner,
          );
          if (
            !s ||
            s.status !== "running" ||
            s.sessionControlRevision !== guard.revision
          )
            throw new DomainError(
              "STALE_ANALYSIS",
              "The exercise changed while analysis was running. Previous counts were kept.",
              409,
            );
        }
        const result = await fn(state);
        for (const s of state.sessions)
          if (!ids.has(s.id)) {
            const ref = binding.getStore();
            if (ref) s.careReference = ref;
            if (s.evidence === "camera_estimated")
              s.analysisMethod = "gemini_landmark_analysis";
          }
        if (guard) {
          const s = state.sessions.find((s) => s.id === guard.sessionId)!;
          s.analysisAcceptedAt = now().toISOString();
          s.analysisControlRevision = guard.revision;
          s.analysisLastOffsetMs = guard.lastOffset;
        }
        return result;
      }),
  };
  const upstream = upstreamService(file, { ...options, store });
  async function safely<T>(
    operation: () => Promise<T>,
    provider?: "calibration" | "analysis",
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof UpstreamError) {
        if (error.code === "GEMINI_CALIBRATION_FAILED")
          throw new DomainError(
            error.code,
            "Gemini calibration is unavailable. Retry or use the manual references.",
            503,
          );
        throw new DomainError(error.code, error.message, error.status);
      }
      if (provider)
        throw new DomainError(
          "GEMINI_UNAVAILABLE",
          `Gemini ${provider} is unavailable. Your previous measurements were kept.`,
          503,
        );
      throw error;
    }
  }
  async function stored(owner: string, id: string) {
    await safely(() => upstream.get(owner, id));
    return (await backing.snapshot()).sessions.find(
      (s) => s.id === id && s.owner === owner,
    ) as CvStoreData["sessions"][number];
  }
  function decorate(
    s: Awaited<ReturnType<typeof stored>>,
    value: CvSession,
  ): CvSession {
    return {
      ...value,
      ...(s.careReference ? { careReference: s.careReference } : {}),
      ...(s.analysisMethod ? { analysisMethod: s.analysisMethod } : {}),
      report: value.report ? decorateReport(s, value.report) : null,
    };
  }
  function decorateReport(
    s: Awaited<ReturnType<typeof stored>>,
    value: CvReport,
  ): CvReport {
    return {
      ...value,
      ...(s.careReference ? { careReference: s.careReference } : {}),
      ...(s.analysisMethod ? { analysisMethod: s.analysisMethod } : {}),
      ...(s.analysisMethod &&
      (s.analysisIncomplete || value.timingQuality === "partial")
        ? {
            trackingQuality: s.analysisBatchSequence
              ? ("partial" as const)
              : ("unavailable" as const),
          }
        : {}),
    };
  }
  return {
    async start(owner: string, raw: unknown) {
      requireRole("patient");
      const care = options.care
        ? await options.care()
        : connected()
          ? await getCare()
          : undefined;
      if (
        care &&
        (care.patientId !== owner || care.plan?.status !== "approved")
      )
        throw new DomainError(
          "FORBIDDEN",
          "A current approved patient context is required.",
          403,
        );
      const ref = care?.plan
        ? {
            patientId: care.patientId,
            planId: care.plan.id,
            planVersion: care.plan.version,
          }
        : undefined;
      const result = await binding.run(ref, () =>
        safely(() => upstream.start(owner, raw)),
      );
      return decorate(await stored(owner, result.id), result);
    },
    async get(owner: string, id: string) {
      const s = await stored(owner, id);
      return decorate(s, await safely(() => upstream.get(owner, id)));
    },
    async reports(owner: string) {
      const results = await safely(() => upstream.reports(owner));
      const state = (await backing.snapshot()) as CvStoreData;
      return results.map((report) =>
        decorateReport(
          state.sessions.find(
            (s) => s.id === report.sessionId && s.owner === owner,
          )!,
          report,
        ),
      );
    },
    async feedback(owner: string, id: string, eventId: string) {
      const s = await stored(owner, id);
      const cue = s.feedback.find((f) => f.eventId === eventId);
      if (!cue) throw new DomainError("NOT_FOUND", "Feedback not found", 404);
      return structuredClone(cue);
    },
    async events(owner: string, id: string, raw: unknown) {
      requireRole("patient");
      const result = await safely(() => upstream.events(owner, id, raw));
      return {
        ...result,
        session: decorate(await stored(owner, id), result.session),
      };
    },
    changes: (owner: string, id: string, after = 0) =>
      safely(() => upstream.changes(owner, id, after)),
    async finish(owner: string, id: string, raw: unknown) {
      requireRole("patient");
      const report = await safely(() => upstream.finish(owner, id, raw));
      return decorateReport(await stored(owner, id), report);
    },
    async generate(owner: string, id: string, eventId: string, raw: unknown) {
      requireRole("patient");
      return safely(() => upstream.generate(owner, id, eventId, raw));
    },
    async calibrate(owner: string, raw: unknown) {
      requireRole("patient");
      const input = CvCalibrationAssistInputSchema.parse(raw);
      const key = `${owner}:calibration:${input.requestId}`;
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const old = (await backing.snapshot()).receipts[key];
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new DomainError(
            "CONFLICT",
            "Calibration request changed.",
            409,
          );
        return (old.result as CalibrationRecord).result;
      }
      const care = options.care
        ? await options.care()
        : connected()
          ? await getCare()
          : undefined;
      if (
        care &&
        (care.patientId !== owner || care.plan?.status !== "approved")
      )
        throw new DomainError(
          "FORBIDDEN",
          "A current approved patient context is required.",
          403,
        );
      const result = await safely(
        () => upstream.calibrate(owner, input),
        "calibration",
      );
      const record: CalibrationRecord = {
        calibrationId: input.requestId,
        result,
        exerciseId: input.exerciseId,
        side: input.side,
        acceptedAt: now().toISOString(),
        ...(care?.plan
          ? {
              careReference: {
                patientId: care.patientId,
                planId: care.plan.id,
                planVersion: care.plan.version,
              },
            }
          : {}),
      };
      await backing.update((state) => {
        state.receipts[key] = { fingerprint, result: record };
      });
      return result;
    },
    async calibration(owner: string, id: string) {
      const receipt = (await backing.snapshot()).receipts[
        `${owner}:calibration:${id}`
      ];
      if (!receipt)
        throw new DomainError(
          "NOT_FOUND",
          "Calibration is not available.",
          404,
        );
      return receipt.result as CalibrationRecord;
    },
    async analyze(owner: string, id: string, raw: unknown) {
      requireRole("patient");
      const input = CvRepAnalysisInputSchema.parse(raw);
      const s = await stored(owner, id);
      if (input.batchSequence > (s.analysisBatchSequence ?? 0)) {
        const times = input.frames.map((f) => f.offsetMs);
        if (
          times.some((time, i) => i > 0 && time <= times[i - 1]) ||
          times[0] <= (s.analysisLastOffsetMs ?? -1)
        )
          throw new DomainError(
            "TIME_ORDER",
            "Use fresh, ordered landmark frames.",
            400,
          );
      }
      let result;
      try {
        result = await analysisGuard.run(
          {
            sessionId: id,
            owner,
            revision: s.sessionControlRevision,
            lastOffset: input.frames.at(-1)!.offsetMs,
          },
          () => safely(() => upstream.analyze(owner, id, input), "analysis"),
        );
      } catch (error) {
        await backing.update((state) => {
          const current = state.sessions.find(
            (s) => s.id === id && s.owner === owner,
          );
          if (current)
            (current as CvStoreData["sessions"][number]).analysisIncomplete =
              true;
        });
        throw error;
      }
      return {
        ...result,
        session: decorate(await stored(owner, id), result.session),
      };
    },
    async analysis(owner: string, id: string) {
      const s = await stored(owner, id);
      if (!s.analysis)
        throw new DomainError(
          "NOT_FOUND",
          "No movement analysis is available yet.",
          404,
        );
      return {
        batchSequence: s.analysisBatchSequence,
        analysis: structuredClone(s.analysis),
        session: decorate(s, await safely(() => upstream.get(owner, id))),
        sessionControlRevision:
          s.analysisControlRevision ?? s.sessionControlRevision,
        acceptedAt: s.analysisAcceptedAt ?? s.serverReceivedAtUtc,
      };
    },
  };
}
