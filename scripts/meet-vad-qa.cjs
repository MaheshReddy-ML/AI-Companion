// Exercises the bundled V5 model with silence, noise and locally synthesized speech.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage();
 await p.route('**/vad-qa',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>VAD model QA</title>'}));
 await p.route('**/qa-vad.wav',r=>r.fulfill({contentType:'audio/wav',body:fs.readFileSync('tmp/meet-qa/vad-speech.wav')}));
 await p.goto('http://127.0.0.1:8000/vad-qa');
 await p.addScriptTag({url:'/static/vendor/meet-vad/ort.wasm.min.js'});
 await p.evaluate(()=>{ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false});
 await p.addScriptTag({url:'/static/vendor/meet-vad/bundle.min.js'});
 const report=await p.evaluate(async()=>{
  const ac=new AudioContext({sampleRate:16000});const buffer=await ac.decodeAudioData(await(await fetch('/qa-vad.wav')).arrayBuffer());
  const speech=new Float32Array(buffer.length+32000);speech.set(buffer.getChannelData(0),8000);
  let seed=29;const noise=Float32Array.from({length:48000},()=>{seed=(seed*1664525+1013904223)>>>0;return(seed/4294967296-.5)*.12});
  const results=[];
  for(const[name,samples]of[['silence',new Float32Array(48000)],['noise',noise],['synthetic-speech',speech]]){
   let starts=0,ends=0,maxProbability=0;const started=performance.now();
   const detector=await vad.MicVAD.new({model:'v5',startOnLoad:false,baseAssetPath:'/static/vendor/meet-vad/',onnxWASMBasePath:'/static/vendor/meet-vad/',positiveSpeechThreshold:.65,negativeSpeechThreshold:.35,minSpeechMs:192,redemptionMs:640,preSpeechPadMs:320,onSpeechRealStart:()=>starts++,onSpeechEnd:()=>ends++,onFrameProcessed:p=>maxProbability=Math.max(maxProbability,p.isSpeech)});
   // The production worklet supplies these same 512-sample frames. This test
   // deliberately feeds known fixtures without opening a human microphone.
   detector.frameProcessor.resume();
   for(let i=0;i<samples.length;i+=512){const frame=new Float32Array(512);frame.set(samples.subarray(i,i+512));await detector.processFrame(frame)}
   await detector.model.release();results.push({name,starts,ends,maxProbability,elapsedMs:Math.round(performance.now()-started)});
  }
  await ac.close();return results;
 });
 assert.equal(report[0].starts,0);assert.equal(report[1].starts,0);assert(report[2].starts>0);assert(report[2].ends>0);
 fs.writeFileSync('tmp/meet-qa/vad-report.json',JSON.stringify(report,null,2));console.log(report);await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
