import type { ErrorCode } from "@nexora/shared";

/** Correspondência entre códigos de erro da aplicação e estados HTTP. */
export const HTTP_STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  CONFIG: 500,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  INTERNAL: 500,
};

/** Código de erro da aplicação equivalente a um estado HTTP 4xx gerado pelo Fastify. */
export function codeForClientStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "VALIDATION";
  }
}
