// ============================================================
// NEXORA — Efeitos sonoros
//
// O som de "gain" (moeda / caixa registadora) é sintetizado com a
// Web Audio API — não depende de nenhum ficheiro .mp3/.wav externo,
// por isso não há problema de licenciamento nem peso extra no bundle.
//
// A preferência (ligado/desligado) fica em localStorage, para se
// manter entre sessões.
// ============================================================

const STORAGE_KEY = 'nexora_sound_enabled'

export function isSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? true : raw === 'true' // ligado por defeito
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch { /* ignora — sem localStorage, apenas não persiste */ }
}

// Reutiliza um único AudioContext (browsers limitam quantos podem
// existir, e criar um novo por som é desperdício).
let audioCtx: AudioContext | null = null
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  // Alguns browsers suspendem o contexto até haver interação do
  // utilizador — como o "gain" só acontece depois de o utilizador
  // já ter interagido com a app (clicou em iniciar bot, etc.), isto
  // normalmente já está "resumed", mas por garantia:
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

// Som de "moeda"/caixa registadora: 2 bipes curtos e brilhantes em
// sequência ascendente, com um "tilintar" final — evoca o clássico
// som de caixa eletrónica/moedas de jogos e slots.
export function playGainSound(): void {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime

  const playTone = (freq: number, start: number, duration: number, volume: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + start)
    gain.gain.setValueAtTime(0, now + start)
    gain.gain.linearRampToValueAtTime(volume, now + start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + start)
    osc.stop(now + start + duration)
  }

  // Dois bipes ascendentes (tipo "cha-ching") + tilintar agudo final
  playTone(880, 0, 0.12, 0.18)      // A5
  playTone(1318.5, 0.09, 0.14, 0.18) // E6
  playTone(1760, 0.2, 0.25, 0.12)    // A6 — brilho final
}
