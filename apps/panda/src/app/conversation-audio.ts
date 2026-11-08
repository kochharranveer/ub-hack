/** Unlock once on the patient's tap, then play successive replies without per-turn play buttons. */
export class ConversationAudio {
  private context: AudioContext | null=null;
  private source: AudioBufferSourceNode | null=null;
  private generation=0;
  constructor(private readonly create:()=>AudioContext=()=>new AudioContext()) {}
  captureContext() {return this.context ??= this.create();}
  unlock() {
    this.captureContext();
    return this.context!.state==="running" ? Promise.resolve() : this.context!.resume();
  }
  stop() {
    this.generation++;
    if(this.source){
      this.source.onended=null;
      try{this.source.stop();}catch{/* Already ended. */}
      this.source.disconnect();this.source=null;
    }
  }
  close() {
    this.stop();
    const context=this.context;this.context=null;
    if(context&&context.state!=="closed")void context.close().catch(()=>{});
  }
  async play(bytes:ArrayBuffer,ended:()=>void) {
    this.stop();
    const token=this.generation;
    await this.unlock();
    const context=this.context;
    if(!context||token!==this.generation)return;
    const buffer=await context.decodeAudioData(bytes);
    if(token!==this.generation||this.context!==context)return;
    const source=context.createBufferSource();source.buffer=buffer;
    source.connect(context.destination);this.source=source;
    source.onended=()=>{if(token===this.generation)ended();};
    source.start();
  }
}
