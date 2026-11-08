import test from "node:test";
import assert from "node:assert/strict";
import { spokenConfirmation } from "../apps/panda/src/app/voice-confirmation";

test("a separate spoken proposal response accepts clear confirmation or dismissal",()=>{
  for(const text of ["Yes.","YES, confirm!","Go ahead","Confirm action"])
    assert.equal(spokenConfirmation(text),"confirm");
  for(const text of ["No thanks","Don't confirm","Cancel it."])
    assert.equal(spokenConfirmation(text),"cancel");
});
test("medication reports and ambiguous or negated speech never implicitly confirm a proposal",()=>{
  for(const text of ["I took it","yes I took my medicines","maybe","yes but wait","don't go ahead","not sure","confirm if my doctor says so","yes, no"])
    assert.equal(spokenConfirmation(text),undefined,text);
});
