/** One input device per active call. Recording still stops while Panda speaks. */
export class ConversationMicrophone {
  private stream:MediaStream|null=null;
  private pending:Promise<MediaStream>|null=null;
  private generation=0;
  constructor(private capture:()=>Promise<MediaStream>=()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})){}
  open():Promise<MediaStream>{
    if(this.stream&&this.stream.getTracks().every(track=>track.readyState!=="ended"))return Promise.resolve(this.stream);
    if(this.pending)return this.pending;
    const token=this.generation;
    const request=this.capture().then(stream=>{
      if(token!==this.generation){stream.getTracks().forEach(track=>track.stop());throw new DOMException("Call stopped","AbortError");}
      this.stream=stream;return stream;
    }).finally(()=>{if(this.pending===request)this.pending=null;});
    this.pending=request;return request;
  }
  close(){
    this.generation++;this.pending=null;
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
  }
}
