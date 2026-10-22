import { AppError } from "./errors.js";

/** Garante, em tempo de compilação, que todos os casos de uma união foram tratados. */
export function assertNever(_value: never, message = "Caso não tratado."): never {
  throw new AppError("INTERNAL", message);
}
