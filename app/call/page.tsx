"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

type LangCode =
  | "en" | "is" | "pt" | "es" | "fr" | "de" | "it" | "sv"
  | "da" | "no" | "nl" | "pl" | "ar" | "hi" | "ja" | "ko" | "zh";

const API = process.env.NEXT_PUBLIC_API_URL || "";
const USER_ID = "default-user";

function wsUrlFor(path: string) {
  if (!API) return "";
  return API.replace(/^http/, "ws") + path; // https -> wss
}

// Inline worklets: PCM16 encoder @ 24k and a simple player
const encoderWorkletJs = `
class PCMEncoder extends AudioWorkletProcessor {
  constructor(){super();this.inputRate=sampleRate;this.targetRate=24000;this.ratio=this.inputRate/this.targetRate;this.acc=0;this.resampled=[];this.targetSamplesPerPacket=Math.floor(this.targetRate*0.05);}
  process(inputs){
    const input=inputs[0];
    if(!input||!input[0]||input[0].length===0) return true;
    const ch0=input[0];
    let mono=ch0;
    if(input.length>1){const L=ch0.length;mono=new Float32Array(L);for(let i=0;i<L;i++){let s=0;for(let c=0;c<input.length;c++) s+=input[c][i];mono[i]=s/input.length;}}
    const step=this.ratio;
    for(let i=0;i<mono.length;i++){
      this.acc+=1;
      while(this.acc>=step){
        const idx=(this.acc-step);
        const srcPos=i-(idx);
        const s0i=Math.max(0,Math.floor(srcPos));
        const s1i=Math.min(s0i+1,mono.length-1);
        const frac=srcPos-s0i;
        const s=mono[s0i]*(1-frac)+mono[s1i]*frac;
        this.resampled.push(s);
        this.acc-=step;
      }
    }
    while(this.resampled.length>=this.targetSamplesPerPacket){
      const pkt=this.resampled.splice(0,this.targetSamplesPerPacket);
      const i16=new Int16Array(pkt.length);
      for(let i=0;i<pkt.length;i++){let v=Math.max(-1,Math.min(1,pkt[i]));i16[i]=v<0?v*0x8000:v*0x7FFF;}
      const b=new Uint8Array(i16.buffer);let bin="";for(let i=0;i<b.length;i++) bin+=String.fromCharCode(b[i]);
      const base64=btoa(bin);
      this.port.postMessage({type:"pcm16",b64:base64});
    }
    return true;
  }
}
registerProcessor("pcm-encoder",PCMEncoder);
`;
const playerWorkletJs = `
class PCMPlayer extends AudioWorkletProcessor {
  constructor(){super();this.queue=[];this.readIdx=0;this.port.onmessage=(e)=>{if(e.data?.type==="push"){this.queue.push(e.data.f32);}};}
  process(inputs,outputs){
    const out=outputs[0]; if(!out||!out[0]) return true;
    const L=out[0]; const R=out[1]||L; L.fill(0); if(R) R.fill(0);
    if(this.queue.length===0) return true;
    const buf=this.queue[0];
    const frames=Math.min(L.length,buf.length-this.readIdx);
    for(let i=0;i<frames;i++){const s=buf[this.readIdx+i]; L[i]=s; if(R) R[i]=s;}
    this.readIdx+=frames;
    if(this.readIdx>=buf.length){this.queue.shift(); this.readIdx=0;}
    return true;
  }
}
registerProcessor("pcm-player",PCMPlayer);
`;

function b64pcm16ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bytes.length;i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const out = new Float32Array(i16.length);
  for (let i=0;i<i16.length;i++) out[i] = Math.max(-1, Math.min(1, i16[i] / 0x8000));
  return out;
}

export default function CallPage() {
  const phoneWsRef = useRef<WebSocket | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ensureAudioGraph = useCallback(async () => {
    if (acRef.current) return;
    const ac = new AudioContext({ sampleRate: 48000 });
    acRef.current = ac;
    const encUrl = URL.createObjectURL(new Blob([encoderWorkletJs], { type: "application/javascript" }));
    await ac.audioWorklet.addModule(encUrl);
    const playUrl = URL.createObjectURL(new Blob([playerWorkletJs], { type: "application/javascript" }));
    await ac.audioWorklet.addModule(playUrl);
    const player = new AudioWorkletNode(ac, "pcm-player", { numberOfOutputs: 1, outputChannelCount: [2] });
    player.connect(ac.destination);
    playerNodeRef.current = player;
  }, []);

  const connectPhone = useCallback(() => {
    setErr(null);
    const ws = new WebSocket(wsUrlFor("/ws/phone"));
    phoneWsRef.current = ws;

    ws.onopen = () => {
      const lang =
        (typeof window !== "undefined" && (localStorage.getItem("ellie_language") as LangCode | null)) || "en";
      ws.send(JSON.stringify({ type: "hello", userId: USER_ID, language: lang, sampleRate: 24000 }));
      setConnected(true);
    };

    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "audio.delta" && m.audio) {
        const f32 = b64pcm16ToF32(m.audio);
        playerNodeRef.current?.port.postMessage({ type: "push", f32 });
      }
      if (m.type === "error") setErr(m.message || "Call error");
    };

    ws.onclose = () => setConnected(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await ensureAudioGraph();
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        micSourceRef.current = acRef.current!.createMediaStreamSource(micStreamRef.current);
        connectPhone();

        // start streaming immediately (hands-free)
        const enc = new AudioWorkletNode(acRef.current!, "pcm-encoder", { numberOfInputs: 1, numberOfOutputs: 0 });
        enc.port.onmessage = (e) => {
          if (e.data?.type === "pcm16" && phoneWsRef.current?.readyState === 1 && !muted) {
            phoneWsRef.current.send(JSON.stringify({ type: "audio.append", audio: e.data.b64 }));
          }
        };
        micNodeRef.current = enc;
        micSourceRef.current.connect(enc);
      } catch (e) {
        setErr((e as Error)?.message || String(e));
      }
    })();
    return () => {
      try { phoneWsRef.current?.close(); } catch {}
      try { micSourceRef.current?.disconnect(); } catch {}
      try { micStreamRef.current?.getTracks().forEach(t=>t.stop()); } catch {}
    };
  }, [ensureAudioGraph, connectPhone, muted]);

  return (
    <div style={{ display:"grid", placeItems:"center", minHeight:"100vh", background:"#0b0b0f", color:"#fff" }}>
      <div style={{ width: 440, padding: 24, borderRadius: 16, border: "1px solid #222", background:"#111" }}>
        <h2 style={{ marginTop:0 }}>Ellie — Call Mode</h2>
        <p style={{ opacity:0.8, marginTop:0 }}>Always-on call. Toggle mute if needed.</p>
        <div style={{ display:"flex", gap:12, marginTop:16 }}>
          <button
            onClick={() => setMuted(m => !m)}
            disabled={!connected}
            style={{ flex:1, padding:"14px 16px", borderRadius:10, border:"1px solid #444", background: muted ? "#555" : "#f39c12", color:"#000", fontWeight:600 }}
          >
            {muted ? "🔇 Unmute" : "🎙️ Mute mic"}
          </button>
          <Link
            href="/"
            style={{ padding:"14px 16px", borderRadius:10, border:"1px solid #444", textDecoration:"none", color:"#fff" }}
          >
            ⛔ Hang up
          </Link>
        </div>
        {!connected && <div style={{ marginTop:12, opacity:0.8 }}>Connecting…</div>}
        {err && <div style={{ marginTop:12, color:"#ff8080" }}>Error: {err}</div>}
      </div>
    </div>
  );
}
