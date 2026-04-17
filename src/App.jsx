import { useMemo, useState } from 'react'
import './App.css'

const panels = [
  {
    id: 'scan',
    title: 'SYSTEM SCAN',
    value: '87%',
    detail: '환경 인식 및 모션 신호 분석 중',
  },
  {
    id: 'intent',
    title: 'INTENT',
    value: 'PINCH',
    detail: '집기 동작 감지 시 패널 선택',
  },
  {
    id: 'focus',
    title: 'FOCUS',
    value: 'CENTER',
    detail: '손 중심 좌표 기준 UI 정렬',
  },
]

const controls = [
  { id: 'launch', label: 'Launch', hint: '패널 열기' },
  { id: 'lock', label: 'Lock', hint: '현재 대상 고정' },
  { id: 'pulse', label: 'Pulse', hint: '이펙트 재생' },
  { id: 'mute', label: 'Mute', hint: '알림 끄기' },
]

const gestures = [
  { key: 'open', label: 'Open Palm', description: '패널 열기 / 대기 상태' },
  { key: 'pinch', label: 'Pinch', description: '선택 / 버튼 활성화' },
  { key: 'point', label: 'Point', description: '포인터 이동 / 하이라이트' },
  { key: 'swipe', label: 'Swipe', description: '패널 전환 / 페이지 이동' },
]

function App() {
  const [activeGesture, setActiveGesture] = useState('open')
  const [activeControl, setActiveControl] = useState('launch')
  const [tracking, setTracking] = useState(true)

  const activeGestureInfo = useMemo(
    () => gestures.find((gesture) => gesture.key === activeGesture) || gestures[0],
    [activeGesture],
  )

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">0418 Jarvis Hand Panel</span>
          <h1>JARVIS 스타일 손 제스처 컨트롤 패널</h1>
          <p>
            웹캠 기반 손 트래킹 UI를 상정한 프로토타입이야. Open Palm, Pinch, Point, Swipe 같은 제스처로
            패널을 여닫고 선택하는 흐름을 빠르게 실험할 수 있어.
          </p>
        </div>

        <div className="status-card">
          <span className="status-label">Tracking</span>
          <strong>{tracking ? 'ONLINE' : 'PAUSED'}</strong>
          <p>{activeGestureInfo.label} 제스처 기준으로 인터랙션이 동작해.</p>
          <button type="button" className="ghost-button" onClick={() => setTracking((value) => !value)}>
            {tracking ? '트래킹 멈추기' : '트래킹 시작하기'}
          </button>
        </div>
      </section>

      <section className="app-grid">
        <section className="panel camera-panel">
          <div className="panel-head">
            <h2>Camera Feed Mock</h2>
            <span>LIVE</span>
          </div>

          <div className="camera-stage">
            <div className="scan-ring" />
            <div className={`hand-point ${activeGesture}`} />
            <div className="hud-overlay">
              <span>Gesture: {activeGestureInfo.label}</span>
              <span>Confidence: 0.94</span>
              <span>Hands: 1</span>
            </div>
          </div>

          <div className="gesture-grid">
            {gestures.map((gesture) => (
              <button
                key={gesture.key}
                type="button"
                className={gesture.key === activeGesture ? 'gesture-button active' : 'gesture-button'}
                onClick={() => setActiveGesture(gesture.key)}
              >
                <strong>{gesture.label}</strong>
                <span>{gesture.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="panel-head">
            <h2>Control Dashboard</h2>
            <span>SYNCED</span>
          </div>

          <div className="metric-grid">
            {panels.map((panel) => (
              <article key={panel.id} className="metric-card">
                <span>{panel.title}</span>
                <strong>{panel.value}</strong>
                <p>{panel.detail}</p>
              </article>
            ))}
          </div>

          <div className="control-grid">
            {controls.map((control) => (
              <button
                key={control.id}
                type="button"
                className={control.id === activeControl ? 'control-button active' : 'control-button'}
                onClick={() => setActiveControl(control.id)}
              >
                <strong>{control.label}</strong>
                <span>{control.hint}</span>
              </button>
            ))}
          </div>

          <div className="insight-card">
            <h3>추천 구현 흐름</h3>
            <ul>
              <li>1단계: 웹캠 스트림 + 손 랜드마크 감지</li>
              <li>2단계: pinch / open palm / swipe 후처리</li>
              <li>3단계: 3D 또는 HUD UI와 연결</li>
            </ul>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
