/** Erro devolvido pela API da Deriv (campo `error` das respostas). */
export class DerivApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly msgType?: string,
  ) {
    super(message);
    this.name = 'DerivApiError';
  }
}

/** Falha de ligação, timeout ou ligação fechada. */
export class DerivConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DerivConnectionError';
  }
}
