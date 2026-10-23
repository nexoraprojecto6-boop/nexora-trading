// Utilitários dos testes. Os testes de base de dados apagam o schema `public`,
// por isso só correm contra uma base cujo nome termina em `_test`.
export function testDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL?.trim();
  if (!raw) return undefined;
  const dbName = new URL(raw).pathname.replace(/^\//, "");
  if (!/_test$/.test(dbName)) {
    throw new Error("TEST_DATABASE_URL tem de apontar para uma base de dados cujo nome termina em _test (os testes apagam o schema public).");
  }
  return raw;
}
