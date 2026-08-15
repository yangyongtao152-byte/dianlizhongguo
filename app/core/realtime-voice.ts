"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VoicePhase = "idle" | "connecting" | "listening" | "speaking" | "error";
type VoiceEvent = Record<string, unknown> & { type?: string };
type VoiceBridge = {
  start(config: Record<string, unknown>): Promise<{ ok: boolean; sessionId?: string }>;
  audio(base64: string): void;
  cancel(): void;
  stop(): Promise<boolean>;
  onEvent(callback: (event: VoiceEvent) => void): () => void;
};

function bridge(): VoiceBridge | undefined {
  return (
    window as unknown as { nexusDesktop?: { voice?: VoiceBridge } }
  ).nexusDesktop?.voice;
}

function messageText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function publishMessage(role: "user" | "assistant" | "system", text: string) {
  const clean = text.trim();
  if (!clean) return;
  try {
    const key = "nexus-chat-history";
    const current = JSON.parse(localStorage.getItem(key) || "[]");
    const messages = Array.isArray(current) ? current : [];
    messages.push({
      id: crypto.randomUUID(),
      role,
      text: clean,
      time: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    localStorage.setItem(key, JSON.stringify(messages.slice(-500)));
    window.dispatchEvent(new Event("nexus-storage"));
  } catch {
    /* Chat history remains optional when local storage is unavailable. */
  }
}

function pcm16Base64(input: Float32Array, inputRate: number) {
  const outputRate = 16000;
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let sample = start; sample < end; sample += 1) total += input[sample];
    const value = Math.max(-1, Math.min(1, total / Math.max(1, end - start)));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export function useRealtimeVoice(
  log: (title: string, detail: string, type?: string) => void,
) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const active = useRef(false);
  const logRef = useRef(log);
  const stream = useRef<MediaStream | null>(null);
  const inputContext = useRef<AudioContext | null>(null);
  const inputSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const silentGain = useRef<GainNode | null>(null);
  const outputContext = useRef<AudioContext | null>(null);
  const outputSources = useRef(new Set<AudioBufferSourceNode>());
  const nextPlayback = useRef(0);
  const userText = useRef("");
  const assistantText = useRef("");

  useEffect(() => {
    logRef.current = log;
  }, [log]);

  const clearPlayback = useCallback(() => {
    for (const source of outputSources.current) {
      try {
        source.stop();
      } catch {
        /* The source may already have finished. */
      }
    }
    outputSources.current.clear();
    nextPlayback.current = outputContext.current?.currentTime || 0;
  }, []);

  const playAudio = useCallback((base64: string) => {
    if (!base64) return;
    const context = outputContext.current;
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = Math.floor(bytes.byteLength / 2);
    const samples = new Float32Array(count);
    for (let index = 0; index < count; index += 1)
      samples[index] = view.getInt16(index * 2, true) / 0x8000;
    const buffer = context.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    outputSources.current.add(source);
    source.onended = () => outputSources.current.delete(source);
    const start = Math.max(context.currentTime + 0.025, nextPlayback.current);
    source.start(start);
    nextPlayback.current = start + buffer.duration;
  }, []);

  const releaseLocalAudio = useCallback(async () => {
    active.current = false;
    processor.current?.disconnect();
    inputSource.current?.disconnect();
    silentGain.current?.disconnect();
    processor.current = null;
    inputSource.current = null;
    silentGain.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (inputContext.current) await inputContext.current.close().catch(() => {});
    inputContext.current = null;
    clearPlayback();
    if (outputContext.current) await outputContext.current.close().catch(() => {});
    outputContext.current = null;
  }, [clearPlayback]);

  useEffect(() => {
    const voice = bridge();
    if (!voice) return;
    return voice.onEvent((event) => {
      const type = String(event.type || "");
      if (type === "session.created") {
        setPhase("listening");
        setError("");
        logRef.current("实时语音会话已建立", "麦克风音频正在发送给豆包", "voice.online");
      } else if (
        type === "conversation.item.input_audio_transcription.started"
      ) {
        clearPlayback();
        voice.cancel();
        setPhase("listening");
        userText.current = "";
        setTranscript("");
      } else if (
        type === "conversation.item.input_audio_transcription.delta"
      ) {
        userText.current += messageText(event.delta);
        setTranscript(userText.current);
      } else if (
        type === "conversation.item.input_audio_transcription.completed"
      ) {
        const text = messageText(event.transcript) || messageText(event.text) || userText.current;
        userText.current = text;
        setTranscript(text);
        publishMessage("user", text);
      } else if (type === "response.output_text.delta") {
        assistantText.current += messageText(event.delta);
        setReply(assistantText.current);
      } else if (type === "response.output_text.done") {
        const text = messageText(event.text) || assistantText.current;
        assistantText.current = text;
        setReply(text);
        publishMessage("assistant", text);
      } else if (type === "response.output_audio.started") {
        setPhase("speaking");
      } else if (type === "response.output_audio.delta") {
        playAudio(messageText(event.delta));
      } else if (type === "response.output_audio.done" || type === "response.done") {
        setPhase("listening");
        assistantText.current = "";
      } else if (type === "response.canceled") {
        clearPlayback();
        setPhase("listening");
      } else if (type === "error" || type === "nexus.voice.closed") {
        const detail =
          messageText((event.error as { message?: unknown } | undefined)?.message) ||
          messageText(event.message) ||
          "实时语音连接异常";
        setError(detail);
        setPhase("error");
        void releaseLocalAudio();
        logRef.current("实时语音异常", detail, "voice.error");
      }
    });
  }, [clearPlayback, playAudio, releaseLocalAudio]);

  const stop = useCallback(async () => {
    const voice = bridge();
    clearPlayback();
    voice?.cancel();
    await releaseLocalAudio();
    await voice?.stop().catch(() => false);
    setPhase("idle");
    setTranscript("");
    setReply("");
    logRef.current("实时语音已停止", "麦克风、模型连接与扬声器播放均已关闭", "voice.stopped");
  }, [clearPlayback, releaseLocalAudio]);

  const start = useCallback(async () => {
    const voice = bridge();
    if (!voice) {
      setError("实时语音仅支持桌面安装版");
      setPhase("error");
      return;
    }
    setPhase("connecting");
    setError("");
    setTranscript("");
    setReply("");
    try {
      const config = JSON.parse(
        localStorage.getItem("nexus-provider-registry") || "{}",
      );
      if ((config.realtimeProvider || "doubao") !== "doubao")
        throw new Error("当前语音核心仅支持已配置的豆包 Realtime Provider");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.current = media;
      outputContext.current = new AudioContext({ sampleRate: 24000 });
      await outputContext.current.resume();
      const result = await voice.start(config);
      if (!result.ok) throw new Error("实时语音会话启动失败");
      const context = new AudioContext({ sampleRate: 16000 });
      inputContext.current = context;
      const source = context.createMediaStreamSource(media);
      const node = context.createScriptProcessor(512, 1, 1);
      const gain = context.createGain();
      gain.gain.value = 0;
      inputSource.current = source;
      processor.current = node;
      silentGain.current = gain;
      active.current = true;
      node.onaudioprocess = (event) => {
        if (!active.current) return;
        const input = event.inputBuffer.getChannelData(0);
        voice.audio(pcm16Base64(input, context.sampleRate));
      };
      source.connect(node);
      node.connect(gain);
      gain.connect(context.destination);
      await context.resume();
      setPhase("listening");
    } catch (cause) {
      await releaseLocalAudio();
      await voice.stop().catch(() => false);
      const detail = cause instanceof Error ? cause.message : "实时语音启动失败";
      setError(detail);
      setPhase("error");
      logRef.current("实时语音无法启动", detail, "voice.error");
    }
  }, [releaseLocalAudio]);

  useEffect(() => () => {
    void releaseLocalAudio();
    void bridge()?.stop();
  }, [releaseLocalAudio]);

  return {
    phase,
    active: phase === "connecting" || phase === "listening" || phase === "speaking",
    speaking: phase === "speaking",
    transcript,
    reply,
    error,
    toggle: phase === "idle" || phase === "error" ? start : stop,
  };
}
