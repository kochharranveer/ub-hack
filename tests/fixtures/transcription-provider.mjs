// Deliberately opt-in server preload; normal app commands never load this fixture.
if(process.env.PANDA_TRANSCRIPTION_TEST_PROVIDER!=='synthetic')throw Error('The voice fixture requires its explicit test flag.');
const original=globalThis.fetch;let turns=0;
globalThis.fetch=async(input,options)=>{
 const url=String(input);
 if(url.startsWith('https://api.elevenlabs.io/v1/speech-to-text'))return Response.json({text:++turns===1?'   ':'My elbow feels okay today.'});
 if(url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/'))return new Response(new Uint8Array(24000*2*.15),{headers:{'Content-Type':'audio/pcm'}});
 return original(input,options);
};
