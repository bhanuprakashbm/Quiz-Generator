import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// ─── Constants ───────────────────────────────────────────────────────────────
const QUIZ_DURATION = 600; // 10 minutes in seconds

// ─── Utility ─────────────────────────────────────────────────────────────────
function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function getScoreLabel(score, total) {
  const pct = (score / total) * 100;
  if (pct >= 90) return { label: 'Outstanding!', color: 'great' };
  if (pct >= 70) return { label: 'Great Job!', color: 'good' };
  if (pct >= 50) return { label: 'Keep Trying!', color: 'ok' };
  return { label: 'Needs Work', color: 'low' };
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  // Theme
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  // Page state: 'home' | 'quiz' | 'results' | 'history'
  const [page, setPage] = useState('home');

  // Form
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Quiz data
  const [quiz, setQuiz] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [showExplanations, setShowExplanations] = useState({});

  // Timer
  const [timeLeft, setTimeLeft] = useState(QUIZ_DURATION);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);

  // History
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('quizHistory') || '[]'); }
    catch { return []; }
  });

  // ── Dark mode effect ──
  useEffect(() => {
    document.body.className = darkMode ? 'dark' : '';
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // ── Timer effect ──
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      handleSubmitQuiz(true);
    }
    return () => clearInterval(timerRef.current);
  }, [timerActive, timeLeft]);

  // ── Generate Quiz ──
  const generateQuiz = async () => {
    if (!topic.trim()) { setError('Please enter a topic name.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), difficulty }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      const data = await res.json();
      setQuiz(data);
      setSelectedAnswers({});
      setCurrentQ(0);
      setShowExplanations({});
      setTimeLeft(QUIZ_DURATION);
      setTimerActive(true);
      setPage('quiz');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit Quiz ──
  const handleSubmitQuiz = useCallback((autoSubmit = false) => {
    setTimerActive(false);
    clearInterval(timerRef.current);
    if (!autoSubmit && Object.keys(selectedAnswers).length < quiz.questions.length) {
      setError('Please answer all questions before submitting.');
      return;
    }
    setError('');
    // Save to history
    const score = quiz.questions.reduce((acc, q, i) => selectedAnswers[i] === q.answer ? acc + 1 : acc, 0);
    const entry = {
      id: Date.now(),
      topic: quiz.topic,
      difficulty: quiz.difficulty,
      score,
      total: quiz.questions.length,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
    };
    const newHistory = [entry, ...history].slice(0, 20);
    setHistory(newHistory);
    localStorage.setItem('quizHistory', JSON.stringify(newHistory));
    setPage('results');
  }, [quiz, selectedAnswers, history]);

  // ── PDF Download ──
  const downloadPDF = () => {
    const score = quiz.questions.reduce((acc, q, i) => selectedAnswers[i] === q.answer ? acc + 1 : acc, 0);
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${quiz.topic} Quiz</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #222; max-width: 800px; margin: auto; }
        h1 { color: #667eea; } h2 { color: #444; border-bottom: 2px solid #667eea; padding-bottom: 6px; }
        .score { font-size: 24px; font-weight: bold; color: #2e7d32; margin: 16px 0; }
        .q { margin: 20px 0; } .q p { font-weight: bold; margin-bottom: 8px; }
        .opt { padding: 4px 8px; margin: 3px 0; border-radius: 4px; }
        .correct { background: #e8f5e9; color: #1b5e20; }
        .wrong { background: #ffebee; color: #b71c1c; }
        .exp { background: #fff8e1; border-left: 4px solid #ffc107; padding: 8px 12px; margin-top: 8px; font-size: 14px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>AI Quiz Generator</h1>
      <h2>${quiz.topic} — ${quiz.difficulty}</h2>
      <div class="score">Score: ${score} / ${quiz.questions.length}</div>
      <p>Date: ${new Date().toLocaleString()}</p>
      ${quiz.questions.map((q, i) => {
        const sel = selectedAnswers[i];
        const correct = q.answer;
        return `<div class="q">
          <p>Q${i + 1}. ${q.question}</p>
          ${q.options.map((opt, oi) => {
            const lbl = ['A','B','C','D'][oi];
            const cls = lbl === correct ? 'correct' : (lbl === sel && sel !== correct ? 'wrong' : '');
            return `<div class="opt ${cls}">${lbl}. ${opt}${lbl === correct ? ' ✓' : (lbl === sel && sel !== correct ? ' ✗' : '')}</div>`;
          }).join('')}
          <div class="exp"><strong>Answer: ${correct}</strong> — ${q.explanation}</div>
        </div>`;
      }).join('')}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const score = quiz ? quiz.questions.reduce((acc, q, i) => selectedAnswers[i] === q.answer ? acc + 1 : acc, 0) : 0;
  const scoreInfo = quiz ? getScoreLabel(score, quiz.questions.length) : null;
  const answered = Object.keys(selectedAnswers).length;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`site${darkMode ? ' dark' : ''}`}>

      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <div className="nav-inner">
          <div className="nav-logo" onClick={() => { setPage('home'); setQuiz(null); setTimerActive(false); }}>
            <span className="nav-logo-icon">&#x1F9E0;</span>
            <span className="nav-logo-text">QuizAI</span>
          </div>
          <div className="nav-links">
            <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => { setPage('home'); setQuiz(null); setTimerActive(false); }}>Home</button>
            <button className={page === 'history' ? 'nav-link active' : 'nav-link'} onClick={() => setPage('history')}>
              History {history.length > 0 && <span className="nav-badge">{history.length}</span>}
            </button>
            <button className="dark-toggle" onClick={() => setDarkMode(d => !d)} title="Toggle Dark Mode">
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </nav>

      {/* ══════════════ HOME PAGE ══════════════ */}
      {page === 'home' && (
        <>
          {/* Hero */}
          <section className="hero">
            <div className="hero-inner">
              <div className="hero-tag">AI-Powered Learning</div>
              <h1 className="hero-title">Generate Quizzes on<br /><span className="hero-highlight">Any Topic Instantly</span></h1>
              <p className="hero-sub">Enter any topic, choose your difficulty, and get 10 professional MCQs with answers and explanations — powered by Claude AI.</p>

              <div className="hero-form">
                <div className="hero-inputs">
                  <input
                    type="text"
                    className="hero-input"
                    placeholder="Enter any topic (e.g. Machine Learning, World War II...)"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && generateQuiz()}
                    disabled={loading}
                  />
                  <div className="hero-diff">
                    {['Easy', 'Medium', 'Hard'].map(lv => (
                      <button key={lv} className={'diff-pill' + (difficulty === lv ? ' active ' + lv.toLowerCase() : '')} onClick={() => setDifficulty(lv)} disabled={loading}>{lv}</button>
                    ))}
                  </div>
                </div>
                {error && <div className="error-msg">{error}</div>}
                <button className="hero-btn" onClick={generateQuiz} disabled={loading}>
                  {loading ? <><span className="spinner"></span> Generating...</> : 'Generate Quiz'}
                </button>
                {loading && <p className="loading-hint">Claude AI is crafting 10 questions on <strong>{topic}</strong>...</p>}
              </div>
            </div>
            <div className="hero-decoration">
              <div className="deco-circle c1"></div>
              <div className="deco-circle c2"></div>
              <div className="deco-circle c3"></div>
            </div>
          </section>

          {/* Stats */}
          <section className="stats-bar">
            <div className="stat-item"><span className="stat-num">10</span><span className="stat-label">MCQs per Quiz</span></div>
            <div className="stat-divider"></div>
            <div className="stat-item"><span className="stat-num">3</span><span className="stat-label">Difficulty Levels</span></div>
            <div className="stat-divider"></div>
            <div className="stat-item"><span className="stat-num">&#x221E;</span><span className="stat-label">Topics Supported</span></div>
            <div className="stat-divider"></div>
            <div className="stat-item"><span className="stat-num">{history.length}</span><span className="stat-label">Quizzes Taken</span></div>
          </section>

          {/* Features */}
          <section className="features">
            <div className="features-inner">
              <h2 className="section-title">Everything You Need</h2>
              <p className="section-sub">A complete quiz experience from generation to results</p>
              <div className="features-grid">
                {[
                  { icon: '🤖', title: 'AI-Powered', desc: 'Claude AI generates unique, accurate questions every time on any subject.' },
                  { icon: '⏱️', title: '10-Min Timer', desc: 'Beat the clock! A countdown timer adds pressure and tracks your speed.' },
                  { icon: '📊', title: 'Detailed Results', desc: 'See your score, correct answers, and explanations for every question.' },
                  { icon: '📄', title: 'PDF Download', desc: 'Download your quiz and results as a PDF for offline review.' },
                  { icon: '📜', title: 'Quiz History', desc: 'All your past quizzes are saved locally so you can track progress.' },
                  { icon: '🌙', title: 'Dark Mode', desc: 'Easy on the eyes — switch between light and dark mode anytime.' },
                ].map((f, i) => (
                  <div className="feature-card" key={i}>
                    <div className="feature-icon">{f.icon}</div>
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* How it works */}
          <section className="how-it-works">
            <div className="hiw-inner">
              <h2 className="section-title">How It Works</h2>
              <div className="steps">
                <div className="step"><div className="step-num">1</div><h4>Enter Topic</h4><p>Type any topic you want to be quizzed on.</p></div>
                <div className="step-arrow">&#8594;</div>
                <div className="step"><div className="step-num">2</div><h4>Choose Difficulty</h4><p>Pick Easy, Medium, or Hard level.</p></div>
                <div className="step-arrow">&#8594;</div>
                <div className="step"><div className="step-num">3</div><h4>Take Quiz</h4><p>Answer 10 MCQs within 10 minutes.</p></div>
                <div className="step-arrow">&#8594;</div>
                <div className="step"><div className="step-num">4</div><h4>Get Results</h4><p>View score, answers, and explanations.</p></div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ══════════════ QUIZ PAGE ══════════════ */}
      {page === 'quiz' && quiz && (
        <div className="quiz-page">
          {/* Quiz Topbar */}
          <div className="quiz-topbar">
            <div className="quiz-meta">
              <span className="qt-topic">{quiz.topic}</span>
              <span className={'qt-badge ' + quiz.difficulty.toLowerCase()}>{quiz.difficulty}</span>
            </div>
            <div className="quiz-controls">
              <div className={'quiz-timer' + (timeLeft < 60 ? ' danger' : '')}>
                &#9201; {formatTime(timeLeft)}
              </div>
              <span className="qt-progress">{answered}/{quiz.questions.length} answered</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: `${(answered / quiz.questions.length) * 100}%` }}></div>
          </div>

          <div className="quiz-layout">
            {/* Question Navigator */}
            <aside className="q-navigator">
              <div className="qnav-title">Questions</div>
              <div className="qnav-grid">
                {quiz.questions.map((_, i) => (
                  <button
                    key={i}
                    className={'qnav-btn' + (currentQ === i ? ' active' : '') + (selectedAnswers[i] ? ' answered' : '')}
                    onClick={() => setCurrentQ(i)}
                  >{i + 1}</button>
                ))}
              </div>
              <div className="qnav-legend">
                <span className="legend-dot answered"></span> Answered
                <span className="legend-dot active" style={{marginLeft:'12px'}}></span> Current
              </div>
              {error && <div className="error-msg" style={{marginTop:'12px'}}>{error}</div>}
              <button className="submit-quiz-btn" onClick={() => handleSubmitQuiz(false)}>Submit Quiz</button>
            </aside>

            {/* Question Area */}
            <main className="q-area">
              {quiz.questions.map((q, qIndex) => (
                <div key={qIndex} id={`q-${qIndex}`} className={'question-block' + (currentQ === qIndex ? ' visible' : ' hidden')}>
                  <div className="qb-header">
                    <span className="qb-num">Question {qIndex + 1} of {quiz.questions.length}</span>
                  </div>
                  <p className="qb-text">{q.question}</p>
                  <div className="qb-options">
                    {q.options.map((opt, oi) => {
                      const lbl = ['A','B','C','D'][oi];
                      const sel = selectedAnswers[qIndex] === lbl;
                      return (
                        <button
                          key={oi}
                          className={'qb-opt' + (sel ? ' selected' : '')}
                          onClick={() => setSelectedAnswers(prev => ({ ...prev, [qIndex]: lbl }))}
                        >
                          <span className="qb-lbl">{lbl}</span>
                          <span className="qb-opt-text">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="qb-nav-btns">
                    {qIndex > 0 && <button className="qb-prev" onClick={() => setCurrentQ(qIndex - 1)}>&#8592; Prev</button>}
                    {qIndex < quiz.questions.length - 1 && <button className="qb-next" onClick={() => setCurrentQ(qIndex + 1)}>Next &#8594;</button>}
                  </div>
                </div>
              ))}
            </main>
          </div>
        </div>
      )}

      {/* ══════════════ RESULTS PAGE ══════════════ */}
      {page === 'results' && quiz && (
        <div className="results-page">
          <div className="results-inner">
            {/* Score Hero */}
            <div className={'results-hero ' + scoreInfo.color}>
              <div className="score-circle">
                <svg viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="#e0e0e0" strokeWidth="10"/>
                  <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="10"
                    strokeDasharray={`${(score / quiz.questions.length) * 339} 339`}
                    strokeLinecap="round" transform="rotate(-90 60 60)"/>
                </svg>
                <div className="score-text">
                  <span className="score-num">{score}</span>
                  <span className="score-den">/{quiz.questions.length}</span>
                </div>
              </div>
              <div className="results-info">
                <h2 className="results-label">{scoreInfo.label}</h2>
                <p className="results-topic">{quiz.topic} — {quiz.difficulty}</p>
                <p className="results-pct">{Math.round((score / quiz.questions.length) * 100)}% Correct</p>
                <div className="results-actions">
                  <button className="ra-btn primary" onClick={() => { setPage('home'); setQuiz(null); setTopic(''); }}>New Quiz</button>
                  <button className="ra-btn secondary" onClick={downloadPDF}>Download PDF</button>
                  <button className="ra-btn outline" onClick={() => setPage('history')}>View History</button>
                </div>
              </div>
            </div>

            {/* Answer Review */}
            <h3 className="review-title">Answer Review</h3>
            <div className="review-list">
              {quiz.questions.map((q, i) => {
                const sel = selectedAnswers[i];
                const correct = q.answer;
                const isRight = sel === correct;
                const showExp = showExplanations[i];
                return (
                  <div key={i} className={'review-card ' + (isRight ? 'right' : 'wrong')}>
                    <div className="review-header">
                      <span className="review-qnum">Q{i + 1}</span>
                      <span className={'review-status ' + (isRight ? 'right' : 'wrong')}>{isRight ? '✓ Correct' : '✗ Incorrect'}</span>
                    </div>
                    <p className="review-q">{q.question}</p>
                    <div className="review-opts">
                      {q.options.map((opt, oi) => {
                        const lbl = ['A','B','C','D'][oi];
                        let cls = 'review-opt';
                        if (lbl === correct) cls += ' correct-opt';
                        else if (lbl === sel && !isRight) cls += ' wrong-opt';
                        return <div key={oi} className={cls}><span className="ro-lbl">{lbl}</span>{opt}{lbl === correct && ' ✓'}{lbl === sel && !isRight && ' ✗'}</div>;
                      })}
                    </div>
                    <button className="exp-btn" onClick={() => setShowExplanations(p => ({ ...p, [i]: !p[i] }))}>
                      {showExp ? 'Hide Explanation' : 'Show Explanation'}
                    </button>
                    {showExp && <div className="exp-box"><strong>Answer: {correct}</strong> — {q.explanation}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{textAlign:'center', marginTop:'32px'}}>
              <button className="ra-btn primary" onClick={() => { setPage('home'); setQuiz(null); setTopic(''); }}>Generate New Quiz</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ HISTORY PAGE ══════════════ */}
      {page === 'history' && (
        <div className="history-page">
          <div className="history-inner">
            <div className="history-header">
              <h2>Quiz History</h2>
              <p>Your last {history.length} quizzes</p>
            </div>
            {history.length === 0 ? (
              <div className="history-empty">
                <div className="empty-icon">📭</div>
                <p>No quizzes taken yet. Go generate your first quiz!</p>
                <button className="ra-btn primary" onClick={() => setPage('home')}>Start Quiz</button>
              </div>
            ) : (
              <>
                <div className="history-grid">
                  {history.map((h, i) => {
                    const pct = Math.round((h.score / h.total) * 100);
                    const color = pct >= 90 ? 'great' : pct >= 70 ? 'good' : pct >= 50 ? 'ok' : 'low';
                    return (
                      <div key={h.id} className={'history-card ' + color}>
                        <div className="hc-top">
                          <span className={'hc-diff ' + h.difficulty.toLowerCase()}>{h.difficulty}</span>
                          <span className="hc-date">{h.date}</span>
                        </div>
                        <h4 className="hc-topic">{h.topic}</h4>
                        <div className="hc-score">{h.score}/{h.total} <span className="hc-pct">({pct}%)</span></div>
                        <div className="hc-bar"><div className="hc-bar-fill" style={{width: pct + '%'}}></div></div>
                      </div>
                    );
                  })}
                </div>
                <div style={{textAlign:'center', marginTop:'28px'}}>
                  <button className="ra-btn outline" onClick={() => { setHistory([]); localStorage.removeItem('quizHistory'); }}>Clear History</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="nav-logo-icon">&#x1F9E0;</span>
            <span className="nav-logo-text">QuizAI</span>
          </div>
          <p className="footer-desc">AI-powered quiz generation for students, educators, and curious minds.</p>
          <div className="footer-links">
            <button className="footer-link" onClick={() => setPage('home')}>Home</button>
            <button className="footer-link" onClick={() => setPage('history')}>History</button>
            <button className="footer-link" onClick={() => setDarkMode(d => !d)}>Toggle Dark Mode</button>
          </div>
          <p className="footer-copy">Built with React &amp; Claude AI (Anthropic) &mdash; AIML Project</p>
        </div>
      </footer>
    </div>
  );
}
