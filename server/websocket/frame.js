// WebSocket frame module.
// Encodes and decodes low-level WebSocket frames so chatSocket can focus on
// connection flow and message handling.
function readWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const fin = Boolean(firstByte & 0x80);
  const opcode = firstByte & 0x0f;
  const masked = Boolean(secondByte & 0x80);
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return null;
    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("WebSocket payload is too large.");
    }
    payloadLength = Number(length);
    offset += 8;
  }

  const maskLength = masked ? 4 : 0;
  const frameLength = offset + maskLength + payloadLength;
  if (buffer.length < frameLength) return null;

  let payload = buffer.slice(offset + maskLength, frameLength);
  if (masked) {
    const mask = buffer.slice(offset, offset + maskLength);
    payload = Buffer.from(payload);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }

  return { fin, opcode, payload, frameLength };
}

function writeWebSocketFrame(socket, opcode, payload) {
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function sendWebSocketJson(socket, payload) {
  if (socket.destroyed) return;
  writeWebSocketFrame(socket, 0x1, Buffer.from(JSON.stringify(payload), "utf8"));
}

function closeWebSocket(socket) {
  if (socket.destroyed) return;
  writeWebSocketFrame(socket, 0x8, Buffer.alloc(0));
  socket.end();
}

module.exports = {
  readWebSocketFrame,
  writeWebSocketFrame,
  sendWebSocketJson,
  closeWebSocket,
};
