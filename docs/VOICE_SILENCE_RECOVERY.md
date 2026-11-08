# Empty-transcript voice recovery

The “Speech could not be transcribed” banner was reproducible with a valid silent WAV: ElevenLabs returned HTTP 200 and `text: ""`, but Panda's nonempty schema rejected it and converted that ordinary no-speech result into `STT_UNAVAILABLE`. The recognizer then stopped the hands-free call. The same configured key transcribed a previously generated fictional greeting successfully.

Panda now accepts the successful empty string. PCM and MediaRecorder recognizers classify blank/whitespace text as `no-speech`, emit no patient utterance, and finish their input turn normally. The companion automatically listens again in the same check-in. Native recognition also ignores blank transcripts. Silence does not complete an agenda item, confirm a proposal, write a clinical action, or create invented text. While Panda is still speaking, a no-speech result does not incorrectly switch its visible state to listening.

Missing/invalid transcript fields, rejected credentials and actual provider failures still return errors. No general transcription retry loop or model/credential change was introduced. Yuvraj's preserved source is unchanged.

Validation:

- Live reproduction: silent WAV returned HTTP 200 with no words, and synthetic speech returned a nonempty transcript using the same key. No user microphone recording was taken.
- Unit regressions cover blank/whitespace success, malformed response rejection and the MediaRecorder no-speech path.
- `npm run test:voice:browser` uses fake microphone input through the actual AudioWorklet/WAV/server route. Its first provider response is blank; Panda keeps listening. A later valid response advances the same check-in exactly once. No real microphone or provider credentials are used in this browser test.
- `npm run check`: 174 automated tests pass; Panda builds. Original-source verification remains part of the check.

Provider response shape and audio support reference: [ElevenLabs Create transcript](https://elevenlabs.io/docs/api-reference/speech-to-text/convert). The observed silent-response behavior above comes from the live reproduction, rather than an assumed guarantee about every provider response.
