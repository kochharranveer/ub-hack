export type SpeechInput = {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:{results:{[key:number]:{[key:number]:{transcript:string}}}})=>void)|null;
  onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
  start:()=>void;abort:()=>void;
};
/** Bounded microphone turn for browsers without Web Speech. Audio is discarded on cancel. */
export function recordedRecognition(transcribe:(audio:Blob,signal:AbortSignal)=>Promise<string>,processing:()=>void):SpeechInput {
  let active=false,stream:MediaStream|null=null,recorder:MediaRecorder|null=null,context:AudioContext|null=null;
  let timer:ReturnType<typeof setInterval>|null=null,controller:AbortController|null=null;
  const cleanup=()=>{
    if(timer)clearInterval(timer);timer=null;
    stream?.getTracks().forEach(track=>track.stop());stream=null;
    if(context)void context.close().catch(()=>{});context=null;
  };
  const port:SpeechInput={
    lang:"en-US",continuous:false,interimResults:false,onresult:null,onerror:null,onend:null,
    abort() {
      active=false;controller?.abort();controller=null;
      if(recorder){recorder.onstop=null;recorder.ondataavailable=null;if(recorder.state!=="inactive")recorder.stop();}
      recorder=null;cleanup();
    },
    start() {
      if(active)throw Error("Recording is already active.");
      active=true;
      void (async()=>{
        try {
          const captured=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
          if(!active){captured.getTracks().forEach(track=>track.stop());return;}
          stream=captured;
          const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(value=>MediaRecorder.isTypeSupported(value));
          recorder=new MediaRecorder(captured,mime?{mimeType:mime}:undefined);
          const chunks:Blob[]=[];
          recorder.ondataavailable=event=>{if(active&&event.data.size)chunks.push(event.data);};
          recorder.onstop=()=>{
            const audio=new Blob(chunks,{type:recorder?.mimeType||mime||"audio/webm"});
            cleanup();
            if(!active)return;
            controller=new AbortController();processing();
            void transcribe(audio,controller.signal).then(text=>{
              if(!active)return;
              port.onresult?.({results:{0:{0:{transcript:text}}}});
              if(active){active=false;port.onend?.();}
            }).catch(error=>{
              if(active){active=false;port.onerror?.({error:error instanceof Error?error.message:"network"});port.onend?.();}
            });
          };
          recorder.start(200);
          context=new AudioContext();await context.resume();
          const analyser=context.createAnalyser();analyser.fftSize=1024;
          context.createMediaStreamSource(captured).connect(analyser);
          const samples=new Uint8Array(analyser.fftSize);
          const started=performance.now();let heard=false,lastSound=started;
          timer=setInterval(()=>{
            if(!active||!recorder)return;
            analyser.getByteTimeDomainData(samples);
            let sum=0;for(const sample of samples){const value=(sample-128)/128;sum+=value*value;}
            const now=performance.now();
            if(Math.sqrt(sum/samples.length)>0.018){heard=true;lastSound=now;}
            if(!heard&&now-started>8000){port.abort();port.onerror?.({error:"no-speech"});port.onend?.();return;}
            if((heard&&now-lastSound>1400)||now-started>30000){if(recorder.state==="recording")recorder.stop();}
          },100);
        }catch(error){
          cleanup();
          if(active){active=false;port.onerror?.({error:(error as Error).name==="NotAllowedError"?"not-allowed":"audio-capture"});port.onend?.();}
        }
      })();
    },
  };
  return port;
}
