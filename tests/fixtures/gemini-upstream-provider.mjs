// Explicit test preload only. Never loaded by normal application commands.
if(process.env.PANDA_YUVRAJ_TEST_PROVIDER!=='synthetic')throw Error('Synthetic provider preload requires its test flag.');
const original=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 if(!String(input).startsWith('https://generativelanguage.googleapis.com/'))return original(input,options);
 const request=JSON.parse(options.body),schema=request.generationConfig.responseSchema;
 let answer;
 if(schema.properties.detectedPosition)answer={detectedPosition:'rest',accepted:true,angleDeg:90,confidence:.9,stable:true,cue:'Hold your comfortable resting position.',workingMemory:'Rest held.'};
 else if(schema.properties.attemptedCycles)answer={attemptedCycles:1,movementCycles:1,completedReps:1,shortHolds:0,phase:'armed',currentHoldMs:0,confidence:.9,cue:'One movement met the demonstration targets.',workingMemory:'One movement completed.',rangeDegrees:70};
 else answer={phraseId:'gentle'};
 return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}]}),{headers:{'Content-Type':'application/json'}});
};
