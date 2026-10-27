import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface LoaderProps {
  isVisible: boolean
  text?: string
  progress?: number
}

function Loader({ isVisible, text = 'A carregar...', progress }: LoaderProps) {
  const [internalProgress, setInternalProgress] = useState(0)

  useEffect(() => {
    if (isVisible && progress === undefined) {
      const steps = [10, 25, 42, 58, 70, 80, 89, 94]
      let i = 0
      const interval = setInterval(() => {
        if (i < steps.length) { setInternalProgress(steps[i]); i++ } else clearInterval(interval)
      }, 260)
      return () => clearInterval(interval)
    }
  }, [isVisible, progress])

  useEffect(() => { if (progress !== undefined) setInternalProgress(progress) }, [progress])

  if (!isVisible) return null

  return (
    <div className="fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 18,
      background: 'rgba(7,11,20,0.92)', backdropFilter: 'blur(12px)',
    }}>
      <div className="logo-text" style={{ fontSize: 18 }}>NEXORA</div>
      <div style={{ position: 'relative', width: 58, height: 58 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid transparent', borderTopColor: 'var(--blue-hi)',
          borderRightColor: 'rgba(24,87,255,0.2)', animation: 'spin 0.9s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 9, borderRadius: '50%',
          border: '2px solid transparent', borderBottomColor: 'var(--red-hi)',
          borderLeftColor: 'rgba(233,32,63,0.2)', animation: 'spin 0.7s linear infinite reverse',
        }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue-hi)', boxShadow: '0 0 10px var(--blue-hi)' }} />
        </div>
      </div>
      <div style={{ width: 140, height: 2, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${internalProgress}%`, borderRadius: 4,
          background: 'linear-gradient(90deg, var(--red), var(--blue-hi))',
          boxShadow: '0 0 8px var(--blue-glow)', transition: 'width 0.4s',
        }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        {text}
      </div>
    </div>
  )
}

interface LoaderContextType {
  show: (text?: string) => void
  hide: () => void
  complete: (text?: string) => void
}

const LoaderContext = createContext<LoaderContextType | undefined>(undefined)

export function LoaderProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false)
  const [text, setText] = useState('A carregar...')
  const [progress, setProgress] = useState<number | undefined>(undefined)

  const show = (newText?: string) => { setText(newText || 'A carregar...'); setProgress(undefined); setIsVisible(true) }
  const hide = () => { setIsVisible(false); setProgress(undefined) }
  const complete = (completeText?: string) => {
    setText(completeText || 'Pronto!'); setProgress(100)
    setTimeout(() => hide(), 420)
  }

  return (
    <LoaderContext.Provider value={{ show, hide, complete }}>
      {children}
      <Loader isVisible={isVisible} text={text} progress={progress} />
    </LoaderContext.Provider>
  )
}

export function useLoader() {
  const ctx = useContext(LoaderContext)
  if (!ctx) throw new Error('useLoader must be used within a LoaderProvider')
  return ctx
}
