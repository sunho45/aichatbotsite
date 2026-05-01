const crypto = require("crypto");

// Chat WebSocket module.
// Performs WebSocket upgrade handling for /api/chat, parses incoming JSON
// messages, calls the chat service, and sends status/reply/error events.
const { createChatCompletion } = require("../services/chatService");
const {
  closeWebSocket,
  readWebSocketFrame,
  sendWebSocketJson,
  writeWebSocketFrame,
} = require("./frame");

function handleWebSocketUpgrade(req, socket, head) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/api/chat") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n")
  );

  const connection = {
    socket,
    buffer: head && head.length ? Buffer.from(head) : Buffer.alloc(0),
    fragments: [],
  };

  socket.on("data", (chunk) => handleWebSocketData(connection, chunk));
  socket.on("error", (error) => console.error(error));
}

function handleWebSocketData(connection, chunk) {
  connection.buffer = Buffer.concat([connection.buffer, chunk]);

  while (connection.buffer.length) {
    let parsed;
    try {
      parsed = readWebSocketFrame(connection.buffer);
    } catch (error) {
      console.error(error);
      sendWebSocketJson(connection.socket, {
        type: "error",
        error: "WebSocket payload is too large.",
        status: 413,
      });
      closeWebSocket(connection.socket);
      return;
    }

    if (!parsed) return;

    connection.buffer = connection.buffer.slice(parsed.frameLength);
    handleWebSocketFrame(connection, parsed);
  }
}

function handleWebSocketFrame(connection, frame) {
  if (frame.opcode === 0x8) {
    closeWebSocket(connection.socket);
    return;
  }

  if (frame.opcode === 0x9) {
    writeWebSocketFrame(connection.socket, 0xA, frame.payload);
    return;
  }

  if (frame.opcode === 0x1 && !frame.fin) {
    connection.fragments = [frame.payload];
    return;
  }

  if (frame.opcode === 0x0 && connection.fragments.length) {
    connection.fragments.push(frame.payload);
    if (!frame.fin) return;

    processWebSocketMessage(
      connection,
      Buffer.concat(connection.fragments).toString("utf8")
    );
    connection.fragments = [];
    return;
  }

  if (frame.opcode === 0x1) {
    processWebSocketMessage(connection, frame.payload.toString("utf8"));
  }
}

async function processWebSocketMessage(connection, rawMessage) {
  let payload;
  try {
    payload = JSON.parse(rawMessage);
  } catch {
    sendWebSocketJson(connection.socket, {
      type: "error",
      error: "Invalid JSON message.",
      status: 400,
    });
    return;
  }

  sendWebSocketJson(connection.socket, { type: "status", status: "thinking" });

  const result = await createChatCompletion(payload);
  if (!result.ok) {
    sendWebSocketJson(connection.socket, {
      type: "error",
      error: result.error,
      status: result.status,
    });
    return;
  }

  sendWebSocketJson(connection.socket, {
    type: "reply",
    ...result.data,
  });
}

module.exports = { handleWebSocketUpgrade };
