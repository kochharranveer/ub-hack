/* Input stays on-device until an utterance is complete. Outputs remain silent. */
class PandaInput extends AudioWorkletProcessor {
  constructor(){super();this.size=Math.max(128,Math.round(sampleRate/50));this.chunk=new Float32Array(this.size);this.used=0;}
  process(inputs){const input=inputs[0]?.[0];if(!input)return true;let offset=0;while(offset<input.length){const count=Math.min(this.size-this.used,input.length-offset);this.chunk.set(input.subarray(offset,offset+count),this.used);offset+=count;this.used+=count;if(this.used===this.size){this.port.postMessage(this.chunk,[this.chunk.buffer]);this.chunk=new Float32Array(this.size);this.used=0;}}return true;}
}
registerProcessor('panda-input',PandaInput);
