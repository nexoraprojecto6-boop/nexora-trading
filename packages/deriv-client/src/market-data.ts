import { AppError, err, type Result } from "@nexora/shared";
import { parseTick, getErrorInfo, type Tick } from "./protocol.js";
import type { DerivSocket, Subscription } from "./socket.js";

/**
 * Subscreve o stream de ticks de um ou mais símbolos no WebSocket público.
 * Os símbolos devem vir de `active_symbols`; aqui só se valida que não estão vazios.
 */
export async function subscribeTicks(
  socket: DerivSocket,
  symbols: string | readonly string[],
  onTick: (tick: Tick) => void,
  onError?: (error: AppError) => void,
): Promise<Result<Subscription>> {
  const list = typeof symbols === "string" ? [symbols] : [...symbols];
  if (list.length === 0 || list.some((symbol) => symbol.trim() === "" || /\s/.test(symbol))) {
    return err(new AppError("VALIDATION", "Símbolos inválidos: indica pelo menos um símbolo sem espaços."));
  }
  const payload = { ticks: list.length === 1 ? list[0] : list };

  return socket.subscribe(payload, (message) => {
    const errorInfo = getErrorInfo(message);
    if (errorInfo !== undefined) {
      onError?.(new AppError("UPSTREAM", errorInfo.message, { details: { derivCode: errorInfo.code ?? null } }));
      return;
    }
    if (message.msg_type !== "tick") return;
    const tick = parseTick(message);
    if (tick.ok) onTick(tick.value);
    else onError?.(tick.error);
  });
}

/** Mede se a Deriv responde: devolve true se o `ping` obteve resposta sem erro. */
export async function ping(socket: DerivSocket): Promise<Result<true>> {
  const result = await socket.request({ ping: 1 });
  return result.ok ? { ok: true, value: true } : result;
}
