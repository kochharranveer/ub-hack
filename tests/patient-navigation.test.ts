import test from "node:test";
import assert from "node:assert/strict";
import { exerciseReturnPath } from "../packages/ui/patient-navigation";

test("exercise returns to the launching Care Hub or home, never to an arbitrary URL", () => {
  assert.equal(exerciseReturnPath("?from=care"), "/care");
  assert.equal(exerciseReturnPath("?from=care&session=ignored"), "/care");
  for (const query of [
    "",
    "?from=home",
    "?from=/care",
    "?from=https://example.com",
    "?from=//example.com",
  ])
    assert.equal(exerciseReturnPath(query), "/");
});
