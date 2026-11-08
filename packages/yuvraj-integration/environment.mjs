/** Server-process defaults for the unmodified upstream provider. Explicit settings win. */
export function yuvrajEnvironment(env){
 const enabled=env.PANDA_INTEGRATION==='connected'&&env.PANDA_AI_MODE==='gemini';
 return {
  ...(!env.REHAB_GEMINI_MODE&&enabled?{REHAB_GEMINI_MODE:'controlled'}:{}),
  ...(!env.REHAB_GEMINI_MODEL&&env.PANDA_GEMINI_MODEL?{REHAB_GEMINI_MODEL:env.PANDA_GEMINI_MODEL}:{}),
  ...(!env.PANDA_GEMINI_API_KEY&&env.REHAB_GEMINI_API_KEY?{PANDA_GEMINI_API_KEY:env.REHAB_GEMINI_API_KEY}:{}),
 };
}
