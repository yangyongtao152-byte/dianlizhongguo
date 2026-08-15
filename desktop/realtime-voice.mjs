import crypto from "node:crypto";
import https from "node:https";

function clientFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const mask = crypto.randomBytes(4);
  let header;
  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | data.length;
  } else if (data.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  header[0] = 0x80 | opcode;
  const masked = Buffer.allocUnsafe(data.length);
  for (let index = 0; index < data.length; index += 1)
    masked[index] = data[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function eventError(event) {
  const error = event?.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object")
    return String(error.message || error.code || JSON.stringify(error));
  return String(event?.message || "实时语音服务返回错误");
}

export class RealtimeVoiceSession {
  constructor({ apiKey, config, onEvent, onClosed }) {
    this.apiKey = apiKey;
    this.config = config;
    this.onEvent = onEvent;
    this.onClosed = onClosed;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.fragmentOpcode = 0;
    this.fragments = [];
    this.eventSequence = 0;
    this.sessionId = crypto.randomUUID();
    this.closed = false;
    this.readyResolve = null;
    this.readyReject = null;
  }

  eventId() {
    this.eventSequence += 1;
    return `event_${this.eventSequence}`;
  }

  async connect() {
    const endpoint = String(
      this.config.realtimeBaseUrl ||
        "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue",
    );
    const target = new URL(endpoint);
    if (target.protocol !== "wss:")
      throw new Error("实时语音地址必须以 wss:// 开头");
    const ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    await new Promise((resolve, reject) => {
      const request = https.request({
        protocol: "https:",
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: "GET",
        headers: {
          "X-Api-Key": this.apiKey,
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
          "Sec-WebSocket-Version": "13",
        },
      });
      const timer = setTimeout(() => {
        request.destroy(new Error("实时语音 WebSocket 连接超时"));
      }, 10000);
      request.once("upgrade", (response, socket, head) => {
        clearTimeout(timer);
        const expected = crypto
          .createHash("sha1")
          .update(
            `${request.getHeader("Sec-WebSocket-Key")}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
          )
          .digest("base64");
        if (response.headers["sec-websocket-accept"] !== expected) {
          socket.destroy();
          reject(new Error("实时语音 WebSocket 握手校验失败"));
          return;
        }
        this.socket = socket;
        socket.setNoDelay(true);
        socket.on("data", (chunk) => this.consume(chunk));
        socket.on("error", (error) => this.fail(error));
        socket.on("close", () => this.handleClosed());
        if (head?.length) this.consume(head);
        try {
          this.send({
            type: "session.create",
            event_id: this.eventId(),
            session: {
              id: this.sessionId,
              model: String(this.config.realtimeModel || "1.2.6.1"),
              instructions: String(
                this.config.realtimeInstructions ||
                  "你是 NEXUS 语音中枢。用自然、简洁的中文回答用户，并在需要时说明正在执行的任务。",
              ),
              audio: {
                input: { format: { type: "pcm", rate: 16000 } },
                output: {
                  format: { type: "pcm_s16le", rate: 24000 },
                  voice: String(
                    this.config.realtimeVoice ||
                      "zh_male_xiaotian_jupiter_bigtts",
                  ),
                },
              },
              tools: [],
            },
          });
        } catch (error) {
          socket.destroy();
          reject(error);
          return;
        }
        this.onEvent({
          type: "nexus.voice.connected",
          logid: String(response.headers["x-tt-logid"] || ""),
        });
        resolve();
      });
      request.once("response", (response) => {
        clearTimeout(timer);
        response.resume();
        reject(new Error(`实时语音鉴权失败 HTTP ${response.statusCode || 0}`));
      });
      request.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      request.end();
    });
    const timer = setTimeout(
      () => this.readyReject?.(new Error("session.create 等待响应超时")),
      10000,
    );
    try {
      return await ready;
    } finally {
      clearTimeout(timer);
      this.readyResolve = null;
      this.readyReject = null;
    }
  }

  send(event) {
    if (!this.socket || this.socket.destroyed)
      throw new Error("实时语音 WebSocket 尚未连接");
    this.socket.write(clientFrame(JSON.stringify(event)));
  }

  appendAudio(audio) {
    if (!audio || audio.length > 180000) return;
    this.send({ type: "input_audio_buffer.append", audio });
  }

  cancel() {
    if (!this.socket || this.socket.destroyed) return;
    this.send({ type: "response.cancel", event_id: this.eventId() });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.send({ type: "session.close", event_id: this.eventId() });
      this.socket?.write(clientFrame(Buffer.alloc(0), 0x8));
    } catch {
      /* The socket may already be closed by the service. */
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    this.socket?.destroy();
    this.handleClosed();
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const final = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const large = this.buffer.readBigUInt64BE(2);
        if (large > BigInt(32 * 1024 * 1024)) {
          this.fail(new Error("实时语音消息超过安全上限"));
          return;
        }
        length = Number(large);
        offset = 10;
      }
      const maskOffset = masked ? 4 : 0;
      if (this.buffer.length < offset + maskOffset + length) return;
      let payload = this.buffer.subarray(
        offset + maskOffset,
        offset + maskOffset + length,
      );
      if (masked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        const decoded = Buffer.allocUnsafe(length);
        for (let index = 0; index < length; index += 1)
          decoded[index] = payload[index] ^ mask[index % 4];
        payload = decoded;
      }
      this.buffer = this.buffer.subarray(offset + maskOffset + length);
      this.frame(opcode, final, payload);
    }
  }

  frame(opcode, final, payload) {
    if (opcode === 0x9) {
      this.socket?.write(clientFrame(payload, 0xa));
      return;
    }
    if (opcode === 0x8) {
      this.socket?.destroy();
      return;
    }
    if (opcode === 0x1 || opcode === 0x2) {
      this.fragmentOpcode = opcode;
      this.fragments = [payload];
    } else if (opcode === 0x0 && this.fragments.length) {
      this.fragments.push(payload);
    } else return;
    if (!final) return;
    const data = Buffer.concat(this.fragments);
    const messageOpcode = this.fragmentOpcode;
    this.fragments = [];
    this.fragmentOpcode = 0;
    if (messageOpcode !== 0x1) return;
    try {
      const event = JSON.parse(data.toString("utf8"));
      this.onEvent(event);
      if (event.type === "session.created")
        this.readyResolve?.({
          ok: true,
          sessionId: String(event.session?.id || this.sessionId),
        });
      else if (event.type === "error") {
        const error = new Error(eventError(event));
        this.readyReject?.(error);
      }
    } catch (error) {
      this.onEvent({
        type: "error",
        error: { message: `实时语音事件解析失败：${error.message}` },
      });
    }
  }

  fail(error) {
    if (!this.closed)
      this.onEvent({ type: "error", error: { message: error.message } });
    this.readyReject?.(error);
  }

  handleClosed() {
    if (!this.closed)
      this.onEvent({ type: "nexus.voice.closed", message: "实时语音连接已关闭" });
    this.closed = true;
    this.readyReject?.(new Error("实时语音连接已关闭"));
    this.onClosed?.();
  }
}
