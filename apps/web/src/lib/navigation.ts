// ============================================================
// NEXORA — Navegação de página inteira
//
// Num só sítio, para os testes poderem observar para onde se navega
// (ex.: o login vai para o servidor e depois para a Deriv).
// ============================================================
export const nav = {
  go(url: string): void {
    window.location.href = url
  },
}
