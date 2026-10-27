import { useState, useEffect } from 'react'
import { IoTimeOutline } from 'react-icons/io5'
import { useTrading } from '../context/TradingContext'

export function Footer() {
  const { isConnected } = useTrading()
  const [currentTime, setCurrentTime] = useState('')
  useEffect(() => {
    const update = () => {
      const now = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      setCurrentTime(
        `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())} ${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())} GMT`
      )
    }
    update()
    const i = setInterval(update, 1000)
    return () => clearInterval(i)
  }, [])
  return (
    <div className="card" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '10px 14px', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className={`dot ${isConnected ? 'live' : 'off'}`} />
        <span style={{ color: 'var(--white)', fontWeight: 600, fontSize: 13 }}>Deriv</span>
        <span style={{ fontSize: 12, color: isConnected ? 'var(--text-dim)' : 'var(--red-hi)' }}>
          {isConnected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>
      {/* Hora UTC — número em fonte mono, nunca quebra linha */}
      <div className="tabular" style={{
        display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        color: 'var(--text-dim)', fontSize: 11,
      }}>
        <IoTimeOutline size={13} />
        {currentTime}
      </div>
    </div>
  )
}
