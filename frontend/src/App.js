import React, { useState, useEffect, useCallback } from 'react';
import { api } from './utils/api';
import './App.css';

const AMBIENCES = [
  { id: 'forest', label: 'Forest', icon: '🌲', color: '#2d6a4f' },
  { id: 'ocean', label: 'Ocean', icon: '🌊', color: '#1a6b8a' },
  { id: 'mountain', label: 'Mountain', icon: '🏔️', color: '#6b4f2d' },
  { id: 'meadow', label: 'Meadow', icon: '🌾', color: '#8a7a1a' },
  { id: 'rain', label: 'Rain', icon: '🌧️', color: '#3d5a80' },
  { id: 'cave', label: 'Cave', icon: '🪨', color: '#4a3b2d' },
];

const EMOTION_COLORS = {
  calm: '#2d9e6b', peaceful: '#2d9e6b', relaxed: '#2d9e6b',
  happy: '#e6a817', joyful: '#e6a817', energized: '#e6917a',
  anxious: '#c0614a', sad: '#6b8cb8', melancholic: '#6b8cb8',
  focused: '#7a6bc0', neutral: '#8a8a8a',
};

const USER_ID = 'demo_user_001';

export default function App() {
  const [entries, setEntries] = useState([]);
  const [insights, setInsights] = useState(null);
  const [activeTab, setActiveTab] = useState('write');

  // Form state
  const [ambience, setAmbience] = useState('forest');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  // Analysis state
  const [analyzing, setAnalyzing] = useState(null); // entryId being analyzed
  const [quickAnalysis, setQuickAnalysis] = useState(null);
  const [quickAnalyzing, setQuickAnalyzing] = useState(false);

  const loadEntries = useCallback(async () => {
    try {
      const data = await api.getEntries(USER_ID);
      setEntries(data.entries);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadInsights = useCallback(async () => {
    try {
      const data = await api.getInsights(USER_ID);
      setInsights(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadEntries();
    loadInsights();
  }, [loadEntries, loadInsights]);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setSubmitMsg('');
    try {
      await api.createEntry(USER_ID, ambience, text.trim());
      setText('');
      setSubmitMsg('✓ Entry saved');
      await loadEntries();
      await loadInsights();
      setTimeout(() => setSubmitMsg(''), 3000);
    } catch (e) {
      setSubmitMsg('✗ ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnalyzeEntry = async (entryId) => {
    setAnalyzing(entryId);
    try {
      const updated = await api.analyzeEntry(entryId);
      setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
      await loadInsights();
    } catch (e) {
      alert('Analysis failed: ' + e.message);
    } finally {
      setAnalyzing(null);
    }
  };

  const handleQuickAnalyze = async () => {
    if (!text.trim() || quickAnalyzing) return;
    setQuickAnalyzing(true);
    setQuickAnalysis(null);
    try {
      const result = await api.analyzeText(text.trim());
      setQuickAnalysis(result);
    } catch (e) {
      alert('Analysis failed: ' + e.message);
    } finally {
      setQuickAnalyzing(false);
    }
  };

  const emotionColor = (emotion) =>
    EMOTION_COLORS[emotion?.toLowerCase()] || '#8a8a8a';

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🌿</span>
            <span className="logo-text">ArvyaX Journal</span>
          </div>
          <nav className="tabs">
            {['write', 'entries', 'insights'].map(t => (
              <button
                key={t}
                className={`tab ${activeTab === t ? 'active' : ''}`}
                onClick={() => setActiveTab(t)}
              >
                {t === 'write' ? '✍️ Write' : t === 'entries' ? '📖 Entries' : '✨ Insights'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {/* ── WRITE TAB ── */}
        {activeTab === 'write' && (
          <div className="panel fade-in">
            <h2 className="panel-title">New Journal Entry</h2>

            <div className="section-label">Choose your nature session</div>
            <div className="ambience-grid">
              {AMBIENCES.map(a => (
                <button
                  key={a.id}
                  className={`ambience-btn ${ambience === a.id ? 'selected' : ''}`}
                  style={ambience === a.id ? { borderColor: a.color, background: a.color + '22' } : {}}
                  onClick={() => setAmbience(a.id)}
                >
                  <span className="ambience-icon">{a.icon}</span>
                  <span className="ambience-label">{a.label}</span>
                </button>
              ))}
            </div>

            <div className="section-label" style={{ marginTop: 24 }}>How are you feeling?</div>
            <textarea
              className="journal-textarea"
              placeholder="Describe your experience during the session... What did you feel? What thoughts came to you?"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={7}
            />
            <div className="char-count">{text.length} characters</div>

            {quickAnalysis && (
              <div className="quick-analysis fade-in">
                <div className="qa-header">
                  <span
                    className="qa-emotion-badge"
                    style={{ background: emotionColor(quickAnalysis.emotion) }}
                  >
                    {quickAnalysis.emotion}
                  </span>
                  <span className="qa-cached">{quickAnalysis.cached ? '⚡ cached' : '🤖 analyzed'}</span>
                </div>
                <p className="qa-summary">{quickAnalysis.summary}</p>
                <div className="keyword-list">
                  {quickAnalysis.keywords.map(k => (
                    <span key={k} className="keyword">{k}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="action-row">
              <button
                className="btn btn-secondary"
                onClick={handleQuickAnalyze}
                disabled={!text.trim() || quickAnalyzing}
              >
                {quickAnalyzing ? <span className="spinner" /> : '🔬'} Analyze Mood
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!text.trim() || submitting}
              >
                {submitting ? <span className="spinner" /> : '💾'} Save Entry
              </button>
            </div>
            {submitMsg && <div className="submit-msg">{submitMsg}</div>}
          </div>
        )}

        {/* ── ENTRIES TAB ── */}
        {activeTab === 'entries' && (
          <div className="panel fade-in">
            <h2 className="panel-title">Journal Entries
              <span className="entry-count">{entries.length} total</span>
            </h2>

            {entries.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📓</span>
                <p>No entries yet. Write your first one!</p>
              </div>
            ) : (
              <div className="entry-list">
                {entries.map(entry => (
                  <div key={entry.id} className="entry-card">
                    <div className="entry-header">
                      <div className="entry-meta">
                        <span className="entry-ambience">
                          {AMBIENCES.find(a => a.id === entry.ambience)?.icon} {entry.ambience}
                        </span>
                        <span className="entry-date">
                          {new Date(entry.createdAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {entry.emotion && (
                        <span
                          className="emotion-badge"
                          style={{ background: emotionColor(entry.emotion) }}
                        >
                          {entry.emotion}
                        </span>
                      )}
                    </div>

                    <p className="entry-text">{entry.text}</p>

                    {entry.summary && (
                      <p className="entry-summary">💡 {entry.summary}</p>
                    )}

                    {entry.keywords && entry.keywords.length > 0 && (
                      <div className="keyword-list">
                        {entry.keywords.map(k => (
                          <span key={k} className="keyword">{k}</span>
                        ))}
                      </div>
                    )}

                    {!entry.emotion && (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleAnalyzeEntry(entry.id)}
                        disabled={analyzing === entry.id}
                      >
                        {analyzing === entry.id ? <><span className="spinner" /> Analyzing...</> : '🔬 Analyze'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── INSIGHTS TAB ── */}
        {activeTab === 'insights' && (
          <div className="panel fade-in">
            <h2 className="panel-title">Your Wellbeing Insights</h2>

            {!insights || insights.totalEntries === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">✨</span>
                <p>Write and analyze entries to see your insights here.</p>
              </div>
            ) : (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{insights.totalEntries}</div>
                    <div className="stat-label">Total Entries</div>
                  </div>
                  <div className="stat-card">
                    <div
                      className="stat-value"
                      style={{ color: insights.topEmotion ? emotionColor(insights.topEmotion) : '#ccc' }}
                    >
                      {insights.topEmotion || '—'}
                    </div>
                    <div className="stat-label">Top Emotion</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">
                      {insights.mostUsedAmbience
                        ? AMBIENCES.find(a => a.id === insights.mostUsedAmbience)?.icon + ' ' + insights.mostUsedAmbience
                        : '—'}
                    </div>
                    <div className="stat-label">Fav. Ambience</div>
                  </div>
                </div>

                {insights.recentKeywords.length > 0 && (
                  <div className="insights-section">
                    <div className="section-label">Recent Keywords</div>
                    <div className="keyword-list large">
                      {insights.recentKeywords.map(k => (
                        <span key={k} className="keyword">{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(insights.emotionBreakdown).length > 0 && (
                  <div className="insights-section">
                    <div className="section-label">Emotion Breakdown</div>
                    <div className="breakdown-chart">
                      {Object.entries(insights.emotionBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([emotion, count]) => {
                          const max = Math.max(...Object.values(insights.emotionBreakdown));
                          return (
                            <div key={emotion} className="bar-row">
                              <span className="bar-label">{emotion}</span>
                              <div className="bar-track">
                                <div
                                  className="bar-fill"
                                  style={{
                                    width: `${(count / max) * 100}%`,
                                    background: emotionColor(emotion),
                                  }}
                                />
                              </div>
                              <span className="bar-count">{count}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {Object.keys(insights.ambienceBreakdown).length > 0 && (
                  <div className="insights-section">
                    <div className="section-label">Sessions by Ambience</div>
                    <div className="ambience-breakdown">
                      {Object.entries(insights.ambienceBreakdown).map(([amb, count]) => {
                        const a = AMBIENCES.find(x => x.id === amb);
                        return (
                          <div key={amb} className="amb-chip">
                            <span>{a?.icon}</span>
                            <span>{amb}</span>
                            <span className="amb-count">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
