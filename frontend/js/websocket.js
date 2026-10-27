let ws = null;
let reconnectTimer = null;
let onMessageCallback = null;

function connectWS(onMessage) {
  onMessageCallback = onMessage;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.onopen = () => {
    console.log("[WS] Conectado");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // Mantém vivo
    try { ws.send("ping"); } catch {}
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (typeof onMessageCallback === "function") {
        onMessageCallback(data);
      }
    } catch (e) {
      // ignora mensagens que não são JSON
    }
  };

  ws.onclose = () => {
    console.log("[WS] Desconectado – reconectando em 3s...");
    reconnectTimer = setTimeout(() => connectWS(onMessageCallback), 3000);
  };

  ws.onerror = () => {
    try { ws.close(); } catch {}
  };
}

function disconnectWS() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}