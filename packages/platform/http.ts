import { productionEnabled } from "./production/config";
import { requestAuth,requestAuthScope,authenticate,checkOrigin,authorizeOperation } from "./production/auth";
import { identityScope,type Identity } from "./production/context";
import { consumeLimit,finishAudit } from "./production/limits";
import { ZodError } from "zod";
import { DomainError } from "./json-store";
export async function respond<T>(fn: () => Promise<T> | T, req?:Request) {
  if(productionEnabled()){
    let auth:ReturnType<typeof requestAuth>|undefined,actor:Identity|undefined;
    let result:Response;const started=Date.now();
    try {
      if(!req)throw new DomainError("UNAUTHENTICATED","An authenticated request is required.",401);
      checkOrigin(req);auth=requestAuth(req);actor=await authenticate(req,auth);
      await consumeLimit(actor,new URL(req.url).pathname,req.method);
      authorizeOperation(actor.role,new URL(req.url).pathname,req.method);
      result=await requestAuthScope.run(auth,()=>identityScope.run(actor!,()=>execute(fn)));
    }catch(e){result=await execute(()=>{throw e;});}
    if(actor){await finishAudit(actor,result.status).catch(()=>console.error(JSON.stringify({event:"audit_result_failed",requestId:actor!.requestId})));result.headers.set("X-Request-Id",actor.requestId);}
    result.headers.set("Cache-Control","private, no-store, max-age=0");result.headers.set("X-Content-Type-Options","nosniff");
    console.info(JSON.stringify({event:"request",requestId:actor?.requestId,status:result.status,durationMs:Date.now()-started}));
    return auth?auth.apply(result):result;
  }
  return execute(fn);
}
async function execute<T>(fn:()=>Promise<T>|T){
  try {
    const data=await fn();if(data instanceof Response)return data;
    return Response.json(
      { ok: true, data },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Panda-Mode": productionEnabled()?"production":"synthetic-demo",
        },
      },
    );
  } catch (e) {
    if (e instanceof ZodError)
      return Response.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: e.issues.map((i) => i.message).join("; "),
          },
        },
        { status: 400 },
      );
    if (e instanceof SyntaxError)
      return Response.json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON" },
        },
        { status: 400 },
      );
    if (e instanceof DomainError)
      return Response.json(
        { ok: false, error: { code: e.code, message: e.message } },
        { status: e.status },
      );
    console.error(
      "Panda request failed:",
      productionEnabled()?"Unexpected service error":e instanceof Error ? e.message : "unknown",
    );
    return Response.json(
      {
        ok: false,
        error: {
          code: "UNAVAILABLE",
          message:
            "Service unavailable. Retry without changing the request ID.",
        },
      },
      { status: 503 },
    );
  }
}
