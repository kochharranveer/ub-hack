/** Public patient pages. Rehab keeps its API namespace, not a second patient UI. */
export const PATIENT_ROUTES = {
  today: "/",
  care: "/care",
  exercise: "/exercise",
  exerciseFromCare: "/exercise?from=care",
} as const;

export function exerciseReturnPath(search: string) {
  return new URLSearchParams(search).get("from") === "care"
    ? PATIENT_ROUTES.care
    : PATIENT_ROUTES.today;
}
