import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // O verdadeiro responsável por mudar a página com segurança
  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    if (!email || !password) { setErrorMsg('Preencha email e senha.'); return }
    setIsSubmitting(true)
    try {
      const { error } = await signIn(email, password)
      if (error) {
        setErrorMsg(
          error.toLowerCase().includes('invalid login')
            ? 'E-mail ou senha incorretos.'
            : error,
        )
      } else {
        // Em vez de empurrar a página à força e causar o loop,
        // avisamos que deu certo e deixamos o useEffect lá de cima agir.
        setSuccessMsg('Entrando...')
      }
    } catch {
      setErrorMsg('Erro inesperado. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    if (!name || !email || !password || !confirmPw) { setErrorMsg('Preencha todos os campos.'); return }
    if (!email.toLowerCase().endsWith('@cakto.com.br')) { setErrorMsg('Apenas e-mails @cakto.com.br podem criar conta.'); return }
    if (password !== confirmPw) { setErrorMsg('Senhas não coincidem.'); return }
    if (password.length < 6) { setErrorMsg('Senha: mínimo 6 caracteres.'); return }
    setIsSubmitting(true)
    try {
      const { error } = await signUp(name, email, password)
      if (error) {
        setErrorMsg(error.includes('already registered') ? 'E-mail já cadastrado.' : error)
      } else {
        setSuccessMsg('Conta criada! Faça o login.')
        setTab('login')
        setPassword(''); setConfirmPw('')
      }
    } catch {
      setErrorMsg('Erro inesperado. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px',
    background: '#1D1D19', border: '1px solid rgba(226,207,183,0.10)', borderRadius: '10px',
    color: '#E2CFB7', fontSize: '14px', outline: 'none', fontFamily: 'inherit',
    transition: 'border-color .18s',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600,
    color: '#7A6E62', marginBottom: '7px', letterSpacing: '.05em', textTransform: 'uppercase',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D0D0B',
      backgroundImage: 'radial-gradient(circle, rgba(226,207,183,0.04) 1px, transparent 1px)',
      backgroundSize: '26px 26px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    }}>
      {/* Glow verde de fundo */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -60%)',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(47,87,51,.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        background: '#161613',
        borderRadius: '20px', padding: '44px 40px', width: '100%',
        maxWidth: '420px',
        border: '1px solid rgba(226,207,183,0.10)',
        boxShadow: '0 32px 80px rgba(0,0,0,.60)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Linha de acento no topo */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #2F5733, transparent)',
        }} />

        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'linear-gradient(145deg, #3D7044 0%, #2F5733 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 4px 24px rgba(47,87,51,.5)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E2CFB7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
            </svg>
          </div>
          <div style={{
            fontSize: '22px', fontWeight: 800, letterSpacing: '-.025em',
            background: 'linear-gradient(135deg, #E2CFB7 0%, #C4AF98 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Comercial Cakto
          </div>
          <div style={{ fontSize: '12.5px', color: '#7A6E62', marginTop: '5px', letterSpacing: '.04em' }}>
            Sistema Comercial Interno
          </div>
        </div>

        <div style={{
          display: 'flex', background: '#1D1D19',
          border: '1px solid rgba(226,207,183,0.09)',
          borderRadius: '10px', padding: '3px', marginBottom: '28px',
        }}>
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setErrorMsg(''); setSuccessMsg('') }}
              style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '7px', cursor: 'pointer',
                fontWeight: 600, fontSize: '13.5px', transition: 'all .18s', fontFamily: 'inherit',
                background: tab === t ? '#2F5733' : 'transparent',
                color: tab === t ? '#E2CFB7' : '#7A6E62',
                boxShadow: tab === t ? '0 2px 10px rgba(47,87,51,.35)' : 'none',
              }}>
              {t === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          ))}
        </div>

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister}
          style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {tab === 'register' && (
            <div>
              <label style={labelStyle}>Nome Completo</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Seu nome completo" style={inp}
                onFocus={e => (e.target.style.borderColor = '#4D8C55')}
                onBlur={e => (e.target.style.borderColor = 'rgba(226,207,183,0.10)')} />
            </div>
          )}

          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value.toLowerCase())}
              placeholder="seu@email.com" style={inp}
              onFocus={e => (e.target.style.borderColor = '#4D8C55')}
              onBlur={e => (e.target.style.borderColor = 'rgba(226,207,183,0.10)')} />
          </div>

          <div>
            <label style={labelStyle}>Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" style={inp}
              onFocus={e => (e.target.style.borderColor = '#4D8C55')}
              onBlur={e => (e.target.style.borderColor = 'rgba(226,207,183,0.10)')} />
          </div>

          {tab === 'register' && (
            <div>
              <label style={labelStyle}>Confirmar Senha</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••" style={inp}
                onFocus={e => (e.target.style.borderColor = '#4D8C55')}
                onBlur={e => (e.target.style.borderColor = 'rgba(226,207,183,0.10)')} />
            </div>
          )}

          {errorMsg && (
            <div style={{
              background: 'rgba(212,85,85,0.10)', border: '1px solid rgba(212,85,85,0.25)',
              borderRadius: '10px', padding: '10px 14px', color: '#D45555', fontSize: '13px',
            }}>
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div style={{
              background: 'rgba(47,87,51,0.15)', border: '1px solid rgba(77,140,85,0.30)',
              borderRadius: '10px', padding: '10px 14px', color: '#5BAE6A', fontSize: '13px',
            }}>
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%', padding: '13px', border: 'none', borderRadius: '10px',
              background: '#2F5733', color: '#E2CFB7',
              fontWeight: 700, fontSize: '14.5px', cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.75 : 1, fontFamily: 'inherit', marginTop: '4px',
              boxShadow: isSubmitting ? 'none' : '0 4px 20px rgba(47,87,51,.45)',
              transition: 'all .18s',
              letterSpacing: '-.01em',
            }}
          >
            {isSubmitting ? 'Aguarde…' : tab === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  )
}