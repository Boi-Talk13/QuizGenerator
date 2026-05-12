import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'https://unexmx3f08.execute-api.ap-south-2.amazonaws.com/prod'

interface MCQ {
  question: string
  options: string[]
  correct: number
  explanation: string
  hint: string
}

interface Score {
  topic: string
  score: number
  total: number
  percentage: number
  timestamp: string
  difficulty?: string
}

interface User {
  name: string
  email: string
}

type Modal = 'none' | 'login' | 'signup' | 'profile'
type Phase = 'home' | 'loading' | 'quiz' | 'results'

const LETTERS = ['A', 'B', 'C', 'D']
const LS_USER_KEY = 'qg_current_user'

function loadCurrentUser(): User | null {
  try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || 'null') }
  catch { return null }
}
function saveCurrentUser(user: User | null) {
  if (user) localStorage.setItem(LS_USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(LS_USER_KEY)
}

export default function App() {
  const [modal, setModal] = useState<Modal>('none')
  const [user, setUser] = useState<User | null>(loadCurrentUser)

  // Auth
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirm, setSignupConfirm] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [showLoginPass, setShowLoginPass] = useState(false)
  const [showSignupPass, setShowSignupPass] = useState(false)
  const [showSignupConfirm, setShowSignupConfirm] = useState(false)

  // Quiz
  const [phase, setPhase] = useState<Phase>('home')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [usedQuestions, setUsedQuestions] = useState<string[]>([])
  const [questions, setQuestions] = useState<MCQ[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [error, setError] = useState('')
  const [, setHistory] = useState<Score[]>([])
  const [showHint, setShowHint] = useState(false)

  // Profile
  const [profileScores, setProfileScores] = useState<Score[]>([])
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => { saveCurrentUser(user) }, [user])

  const closeModal = () => {
    setModal('none'); setAuthError(''); setAuthSuccess(''); setAuthLoading(false)
    setLoginEmail(''); setLoginPassword('')
    setSignupName(''); setSignupEmail(''); setSignupPassword(''); setSignupConfirm('')
  }

  const handleSignup = async () => {
    setAuthError(''); setAuthSuccess('')
    if (!signupName || !signupEmail || !signupPassword || !signupConfirm)
      return setAuthError('Please fill in all fields.')

    if (signupName.trim().length < 2)
      return setAuthError('Name must be at least 2 characters.')

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(signupEmail))
      return setAuthError('Please enter a valid email address (e.g. you@email.com).')

    if (signupPassword.length < 6)
      return setAuthError('Password must be at least 6 characters.')
    if (!/[A-Za-z]/.test(signupPassword))
      return setAuthError('Password must contain at least one letter.')
    if (!/[0-9]/.test(signupPassword))
      return setAuthError('Password must contain at least one number.')
    if (signupPassword !== signupConfirm)
      return setAuthError('Passwords do not match.')

    setAuthLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, password: signupPassword, name: signupName }),
      })
      const data = await res.json()
      if (!res.ok) return setAuthError(data.error || 'Signup failed.')
      setAuthSuccess('Account created! Logging you in...')
      setTimeout(() => {
        const newUser = { name: signupName, email: signupEmail }
        setUser(newUser); saveCurrentUser(newUser); closeModal()
      }, 1200)
    } catch { setAuthError('Network error. Please try again.') }
    finally { setAuthLoading(false) }
  }

  const handleLogin = async () => {
    setAuthError('')
    if (!loginEmail || !loginPassword) return setAuthError('Please fill in all fields.')
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(loginEmail))
      return setAuthError('Please enter a valid email address.')
    setAuthLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = await res.json()
      if (!res.ok) return setAuthError(data.error || 'Login failed.')
      const loggedIn = { name: data.user.name, email: data.user.email }
      setUser(loggedIn); saveCurrentUser(loggedIn); closeModal()
    } catch { setAuthError('Network error. Please try again.') }
    finally { setAuthLoading(false) }
  }

  const handleLogout = () => {
    saveCurrentUser(null); setUser(null); setPhase('home'); setTopic('')
  }

  const openProfile = async () => {
    if (!user) return
    setModal('profile'); setProfileLoading(true)
    try {
      const res = await fetch(`${API_URL}/score?userId=${user.email}`)
      const data = await res.json()
      setProfileScores(data.scores || [])
    } catch { setProfileScores([]) }
    finally { setProfileLoading(false) }
  }

  const generateQuiz = async () => {
    if (!topic.trim()) return
    setError(''); setPhase('loading')
    try {
      const res = await fetch(`${API_URL}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), difficulty, usedQuestions }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      setQuestions(data.questions)
      setAnswers(new Array(data.questions.length).fill(null))
      setCurrentQ(0)
      setShowHint(false)
      setUsedQuestions(prev => [...prev, ...data.questions.map((q: MCQ) => q.question)])
      setPhase('quiz')
    } catch (e) { setError(String(e)); setPhase('home') }
  }

  const selectOption = (idx: number) => {
    const newAnswers = [...answers]
    newAnswers[currentQ] = idx
    setAnswers(newAnswers)
  }

  const goToQuestion = (idx: number) => {
    setCurrentQ(idx); setShowHint(false)
  }

  const submitQuiz = async () => {
    const finalAnswers = answers.map(a => a ?? -1)
    const score = finalAnswers.filter((a, i) => a === questions[i].correct).length
    try {
      await fetch(`${API_URL}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.email || 'guest', topic, score, total: questions.length, difficulty }),
      })
      const res = await fetch(`${API_URL}/score?userId=${user?.email || 'guest'}`)
      const data = await res.json()
      setHistory(data.scores || [])
    } catch (_) {}
    setPhase('results')
  }

  const allAnswered = answers.every(a => a !== null)
  const finalScore = answers.filter((a, i) => a === questions[i]?.correct).length
  const q = questions[currentQ]

  const avgScore = profileScores.length
    ? Math.round(profileScores.reduce((s, h) => s + h.percentage, 0) / profileScores.length) : 0
  const bestScore = profileScores.length
    ? Math.max(...profileScores.map(h => h.percentage)) : 0

  const DiffBadge = ({ d }: { d?: string }) => {
    if (d === 'easy') return <span className="diff-badge diff-badge-easy">🟢 Easy</span>
    if (d === 'hard') return <span className="diff-badge diff-badge-hard">🔴 Hard</span>
    return <span className="diff-badge diff-badge-medium">🟡 Medium</span>
  }

  return (
    <>
      {modal !== 'none' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className={modal === 'profile' ? 'modal-card modal-card--wide' : 'modal-card'} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>✕</button>

            {/* PROFILE */}
            {modal === 'profile' && user && (
              <>
                <div className="profile-header">
                  <div className="profile-avatar">{user.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <div className="profile-name">{user.name}</div>
                    <div className="profile-email">{user.email}</div>
                  </div>
                </div>
                {profileLoading ? (
                  <div className="loading" style={{ padding: '2rem' }}><div className="spinner" /><span>Loading...</span></div>
                ) : (
                  <>
                    <div className="profile-stats">
                      <div className="stat-box"><div className="stat-num">{profileScores.length}</div><div className="stat-label">QUIZZES TAKEN</div></div>
                      <div className="stat-box"><div className="stat-num">{avgScore}%</div><div className="stat-label">AVG SCORE</div></div>
                      <div className="stat-box"><div className="stat-num">{bestScore}%</div><div className="stat-label">BEST SCORE</div></div>
                    </div>
                    <div className="profile-history">
                      <div className="profile-history-title">QUIZ HISTORY</div>
                      {profileScores.length === 0 ? (
                        <div className="profile-empty">No quizzes yet. Go take one! 🚀</div>
                      ) : (
                        <div className="profile-table">
                          <div className="profile-table-head">
                            <span>Topic</span><span>Level</span><span>Score</span><span>%</span><span>Date</span>
                          </div>
                          {profileScores.map((h, i) => (
                            <div key={i} className="profile-table-row">
                              <span className="pt-topic">{h.topic}</span>
                              <span className="pt-level"><DiffBadge d={h.difficulty} /></span>
                              <span className="pt-score">{h.score}/{h.total}</span>
                              <span className={`pt-pct ${h.percentage >= 80 ? 'pct-good' : h.percentage >= 50 ? 'pct-mid' : 'pct-low'}`}>{h.percentage}%</span>
                              <span className="pt-date">{new Date(h.timestamp).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* LOGIN */}
            {modal === 'login' && (
              <>
                <div className="auth-logo"><h1>QuizGenerator</h1><p>Turn any topic into a quiz instantly.</p></div>
                <div className="auth-title">Welcome Back</div>
                <div className="auth-subtitle">Log in to save your scores</div>
                <div className="auth-form">
                  {authError && <div className="auth-error">❌ {authError}</div>}
                  <div className="form-group">
                    <label>Email</label>
                    <input className="form-input" type="email" placeholder="you@email.com"
                      value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <div className="pass-wrap">
                      <input className="form-input" type={showLoginPass ? 'text' : 'password'}
                        placeholder="Your password" value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                      <button type="button" className="eye-btn" onClick={() => setShowLoginPass(p => !p)}>
                        {showLoginPass ? 'Show' : 'Hide'}
                      </button>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-full" onClick={handleLogin} disabled={authLoading}>
                    {authLoading ? 'Logging in...' : 'Log In →'}
                  </button>
                </div>
                <div className="auth-switch">No account? <button onClick={() => { setAuthError(''); setModal('signup') }}>Sign up</button></div>
              </>
            )}

            {/* SIGNUP */}
            {modal === 'signup' && (
              <>
                <div className="auth-logo"><h1>QuizGenerator</h1><p>Turn any topic into a quiz instantly.</p></div>
                <div className="auth-title">Create Account</div>
                <div className="auth-subtitle">Sign up to track your progress</div>
                <div className="auth-form">
                  {authError && <div className="auth-error">❌ {authError}</div>}
                  {authSuccess && <div className="auth-success">✅ {authSuccess}</div>}
                  <div className="form-group">
                    <label>Full Name</label>
                    <input className="form-input" placeholder="John Doe" value={signupName} onChange={e => setSignupName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input className="form-input" type="email" placeholder="you@email.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <div className="pass-wrap">
                      <input className="form-input" type={showSignupPass ? 'text' : 'password'}
                        placeholder="Min 6 chars, 1 letter + 1 number" value={signupPassword}
                        onChange={e => setSignupPassword(e.target.value)} />
                      <button type="button" className="eye-btn" onClick={() => setShowSignupPass(p => !p)}>
                        {showSignupPass ? 'Show' : 'Hide'}
                      </button>
                    </div>
                    <div className="pass-rules">
                      <span className={signupPassword.length >= 6 ? 'rule-ok' : 'rule-no'}>✓ Min 6 characters</span>
                      <span className={/[A-Za-z]/.test(signupPassword) ? 'rule-ok' : 'rule-no'}>✓ At least 1 letter</span>
                      <span className={/[0-9]/.test(signupPassword) ? 'rule-ok' : 'rule-no'}>✓ At least 1 number</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <div className="pass-wrap">
                      <input className="form-input" type={showSignupConfirm ? 'text' : 'password'}
                        placeholder="Repeat password" value={signupConfirm}
                        onChange={e => setSignupConfirm(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSignup()} />
                      <button type="button" className="eye-btn" onClick={() => setShowSignupConfirm(p => !p)}>
                        {showSignupConfirm ? 'Show' : 'Hide'}
                      </button>
                    </div>
                    {signupConfirm && (
                      <span className={signupPassword === signupConfirm ? 'rule-ok' : 'rule-no'}>
                        {signupPassword === signupConfirm ? '✓ Passwords match' : '✗ Passwords do not match'}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-primary btn-full" onClick={handleSignup} disabled={authLoading}>
                    {authLoading ? 'Creating account...' : 'Create Account →'}
                  </button>
                </div>
                <div className="auth-switch">Already have an account? <button onClick={() => { setAuthError(''); setModal('login') }}>Log in</button></div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="app">
        <div className="navbar">
          <div className="navbar-brand">QuizGenerator</div>
          <div className="navbar-right">
            {user ? (
              <>
                <button className="navbar-user navbar-user--btn" onClick={openProfile}>
                  <span className="navbar-avatar">{user.name.charAt(0).toUpperCase()}</span>👋 Hey {user.name}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Log out</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal('login')}>Log in</button>
                <button className="btn btn-primary btn-sm" onClick={() => setModal('signup')}>Sign up</button>
              </>
            )}
          </div>
        </div>

        <header className="header">
          <h1>QuizGenerator</h1>
          <p>Turn any topic into a quiz instantly.</p>
        </header>

        {/* HOME */}
        {phase === 'home' && (
          <div className="card topic-section">
            <label>Enter Topic</label>
            <div className="input-row">
              <input className="topic-input" placeholder="e.g. Photosynthesis, World War II, React Hooks..."
                value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && generateQuiz()} />
              <button className="btn btn-primary" onClick={generateQuiz} disabled={!topic.trim()}>Generate →</button>
            </div>
            <div className="difficulty-row">
              <span className="difficulty-label">DIFFICULTY</span>
              <div className="diff-select-wrap">
                <select className="diff-select" value={difficulty} onChange={e => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}>
                  <option value="easy"> Easy</option>
                  <option value="medium"> Medium</option>
                  <option value="hard"> Hard</option>
                </select>
                <span className="diff-select-arrow">▾</span>
              </div>
            </div>
            {usedQuestions.length > 0 && (
              <div className="used-notice">
                ♻️ {usedQuestions.length} questions used — new ones will be generated automatically
                <button className="clear-used" onClick={() => setUsedQuestions([])}>Reset</button>
              </div>
            )}
            {error && <div className="error">❌ {error}</div>}
          </div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="card">
            <div className="loading"><div className="spinner" /><span>GENERATING QUIZ ON "{topic.toUpperCase()}"...</span></div>
          </div>
        )}

        {/* QUIZ */}
        {phase === 'quiz' && q && (
          <>
            {/* Question number grid — OUTSIDE the card */}
            <div className="qnum-outer">
              <div className="qnum-outer-top">
                <span className="qnum-outer-label">QUESTIONS</span>
                <div className="qnum-legend">
                  <span className="qnum-dot qnum-dot-answered"></span> Answered
                  <span className="qnum-dot qnum-dot-pending" style={{ marginLeft: '0.75rem' }}></span> Pending
                </div>
              </div>
              <div className="qnum-grid">
                {questions.map((_, i) => (
                  <button
                    key={i}
                    className={`qnum-btn ${answers[i] !== null ? 'qnum-answered' : 'qnum-unanswered'} ${i === currentQ ? 'qnum-active' : ''}`}
                    onClick={() => goToQuestion(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Main quiz card */}
            <div className="card">
              <div className="quiz-header">
                <span className="quiz-topic">📚 {topic}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <DiffBadge d={difficulty} />
                  <span className="quiz-progress">{currentQ + 1} / {questions.length}</span>
                </div>
              </div>

              <div className="question-num">QUESTION {currentQ + 1}</div>
              <div className="question-text">{q.question}</div>

              {answers[currentQ] === null && (
                <div className="hint-row">
                  {!showHint ? (
                    <button className="hint-btn" onClick={() => setShowHint(true)}>🤔 Need a hint?</button>
                  ) : (
                    <div className="hint-box"> <strong>Hint:</strong> {q.hint}</div>
                  )}
                </div>
              )}

              <div className="options">
                {q.options.map((opt, i) => {
                  let cls = 'option'
                  if (answers[currentQ] === i) cls += ' selected'
                  return (
                    <button key={i} className={cls} onClick={() => selectOption(i)}>
                      <span className="option-letter">{LETTERS[i]}</span>{opt}
                    </button>
                  )
                })}
              </div>

              <div className="quiz-nav-row">
                <button className="btn btn-ghost" onClick={() => goToQuestion(currentQ - 1)} disabled={currentQ === 0}>← Prev</button>
                {currentQ < questions.length - 1 ? (
                  <button className="btn btn-primary" onClick={() => goToQuestion(currentQ + 1)}>Next →</button>
                ) : (
                  <button className="btn btn-submit" onClick={submitQuiz} disabled={!allAnswered}
                    title={!allAnswered ? 'Answer all questions first' : ''}>
                    {allAnswered ? 'Submit Quiz ✓' : `Answer all (${answers.filter(a => a !== null).length}/${questions.length})`}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* RESULTS */}
        {phase === 'results' && (
          <div className="card results">
            <h2>Quiz Complete!</h2>
            <div className="score-circle">
              <span className="score-num">{finalScore}/{questions.length}</span>
              <span className="score-label">SCORE</span>
            </div>
            <p className="score-msg">
              {finalScore === questions.length ? '🏆 Perfect score!' :
               finalScore >= 8 ? '🎯 Excellent work!' :
               finalScore >= 6 ? '👍 Good effort!' :
               finalScore >= 4 ? '📖 Keep studying!' : '💪 Don\'t give up!'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setPhase('home'); setTopic('') }}>Try Another Topic</button>
              {user && <button className="btn btn-ghost" onClick={openProfile}>View Dashboard →</button>}
            </div>
            <div className="review-section">
              <div className="review-title">📋 FULL REVIEW</div>
              {questions.map((ques, qi) => {
                const userAns = answers[qi] ?? -1
                const isCorrect = userAns === ques.correct
                return (
                  <div key={qi} className={`review-item ${isCorrect ? 'review-correct' : 'review-wrong'}`}>
                    <div className="review-q-header">
                      <span className="review-q-num">Q{qi + 1}</span>
                      <span className={`review-badge ${isCorrect ? 'badge-correct' : 'badge-wrong'}`}>
                        {isCorrect ? '✓ Correct' : '✗ Wrong'}
                      </span>
                    </div>
                    <div className="review-question">{ques.question}</div>
                    <div className="review-options">
                      {ques.options.map((opt, oi) => {
                        let cls = 'review-option'
                        if (oi === ques.correct) cls += ' review-opt-correct'
                        else if (oi === userAns && !isCorrect) cls += ' review-opt-wrong'
                        return (
                          <div key={oi} className={cls}>
                            <span className="review-opt-letter">{LETTERS[oi]}</span>
                            {opt}
                            {oi === ques.correct && <span className="review-opt-tag">✓ Correct</span>}
                            {oi === userAns && !isCorrect && <span className="review-opt-tag">Your answer</span>}
                          </div>
                        )
                      })}
                    </div>
                    <div className="review-explanation">💡 {ques.explanation}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}