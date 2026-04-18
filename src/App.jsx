import { useEffect, useMemo, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import './App.css'

const basePanels = [
  { id: 'scan', title: 'SYSTEM SCAN', value: 'LIVE', detail: '랜드마크와 손 상태를 분석 중' },
  { id: 'intent', title: 'INTENT', value: 'GESTURE', detail: 'pinch / point / open palm 후처리' },
  { id: 'focus', title: 'FOCUS', value: 'HUD', detail: '손 위치로 UI 중심 이동 가능' },
]

const controls = [
  { id: 'launch', label: 'Launch', hint: '패널 열기' },
  { id: 'lock', label: 'Lock', hint: '현재 대상 고정' },
  { id: 'pulse', label: 'Pulse', hint: '이펙트 재생' },
  { id: 'mute', label: 'Mute', hint: '알림 끄기' },
]

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const requestRef = useRef(null)
  const handLandmarkerRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const controlRefs = useRef({})
  const pinchLatchRef = useRef(false)
  const pulseTimeoutRef = useRef(null)

  const [tracking, setTracking] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [status, setStatus] = useState('카메라 권한을 허용하면 손 트래킹을 시작할 수 있어.')
  const [error, setError] = useState('')
  const [gesture, setGesture] = useState('No hand')
  const [confidence, setConfidence] = useState(0)
  const [handCount, setHandCount] = useState(0)
  const [activeControl, setActiveControl] = useState('launch')
  const [hoveredControl, setHoveredControl] = useState('')
  const [pointer, setPointer] = useState({ x: 50, y: 50 })
  const [isLocked, setIsLocked] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isPanelLaunched, setIsPanelLaunched] = useState(true)
  const [pulseActive, setPulseActive] = useState(false)
  const [commandLog, setCommandLog] = useState(['SYSTEM READY'])

  const metrics = useMemo(() => {
    const panels = [...basePanels]
    panels[0] = { ...panels[0], value: tracking ? 'LIVE' : 'PAUSED' }
    panels[1] = { ...panels[1], value: gesture.toUpperCase() }
    panels[2] = { ...panels[2], value: `${Math.round(pointer.x)} / ${Math.round(pointer.y)}` }
    return panels
  }, [gesture, pointer.x, pointer.y, tracking])

  useEffect(() => {
    let stream

    const setup = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm',
        )

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        })

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        })

        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setCameraReady(true)
        setTracking(true)
        setStatus('손을 화면에 올려봐. 컨트롤 위에서 pinch 하면 HUD가 반응해.')
      } catch (err) {
        setError(err.message || '카메라 또는 모델 초기화에 실패했어.')
        setStatus('초기화 실패')
      }
    }

    setup()

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current)
      stream?.getTracks().forEach((track) => track.stop())
      handLandmarkerRef.current?.close?.()
    }
  }, [])

  useEffect(() => {
    if (!tracking || !cameraReady) return

    const renderLoop = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const handLandmarker = handLandmarkerRef.current

      if (!video || !canvas || !ctx || !handLandmarker) {
        requestRef.current = requestAnimationFrame(renderLoop)
        return
      }

      const { videoWidth, videoHeight } = video
      if (!videoWidth || !videoHeight) {
        requestRef.current = requestAnimationFrame(renderLoop)
        return
      }

      canvas.width = videoWidth
      canvas.height = videoHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
      ctx.restore()

      let results = null
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime
        results = handLandmarker.detectForVideo(video, performance.now())
      }

      if (results?.landmarks?.length) {
        const landmarks = results.landmarks[0]
        drawLandmarks(ctx, landmarks, canvas.width, canvas.height)
        const derived = deriveGesture(landmarks)
        const nextPointer = { x: (1 - landmarks[8].x) * 100, y: landmarks[8].y * 100 }

        setGesture(derived.gesture)
        setConfidence(derived.confidence)
        setHandCount(results.landmarks.length)
        setPointer(nextPointer)

        const hovered = findHoveredControl(nextPointer, controlRefs.current)
        setHoveredControl(hovered)

        if (derived.gesture === 'Pinch' && hovered && !pinchLatchRef.current) {
          runControlAction(hovered)
          pinchLatchRef.current = true
        }

        if (derived.gesture !== 'Pinch') {
          pinchLatchRef.current = false
        }
      } else {
        setGesture('No hand')
        setConfidence(0)
        setHandCount(0)
        setHoveredControl('')
        pinchLatchRef.current = false
      }

      requestRef.current = requestAnimationFrame(renderLoop)
    }

    requestRef.current = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(requestRef.current)
  }, [tracking, cameraReady, isLocked, isMuted, isPanelLaunched])

  const runControlAction = (controlId) => {
    setActiveControl(controlId)

    if (controlId === 'launch') {
      setIsPanelLaunched(true)
      setStatus('HUD 패널을 전면 활성화했어.')
      pushCommandLog('LAUNCH PANEL')
      return
    }

    if (controlId === 'lock') {
      setIsLocked((value) => {
        const next = !value
        setStatus(next ? '포인터 위치를 잠갔어.' : '포인터 잠금을 해제했어.')
        pushCommandLog(next ? 'LOCK TARGET' : 'UNLOCK TARGET')
        return next
      })
      return
    }

    if (controlId === 'pulse') {
      setPulseActive(true)
      setStatus('Pulse 이펙트를 재생했어.')
      pushCommandLog('PULSE TRIGGERED')
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current)
      pulseTimeoutRef.current = setTimeout(() => setPulseActive(false), 700)
      return
    }

    if (controlId === 'mute') {
      setIsMuted((value) => {
        const next = !value
        setStatus(next ? '알림을 음소거했어.' : '알림을 다시 켰어.')
        pushCommandLog(next ? 'MUTE ALERTS' : 'UNMUTE ALERTS')
        return next
      })
    }
  }

  const pushCommandLog = (entry) => {
    setCommandLog((current) => [entry, ...current].slice(0, 4))
  }

  return (
    <main className={pulseActive ? 'page-shell pulse-active' : 'page-shell'}>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">0418 Jarvis Hand Panel</span>
          <h1>JARVIS 스타일 손 제스처 컨트롤 패널</h1>
          <p>
            이제 버튼별 실제 액션이 붙었어. pinch로 선택하면 HUD 상태, 이펙트, 로그가 같이 반응해서 훨씬 데모답게
            움직여.
          </p>
        </div>

        <div className="status-card">
          <span className="status-label">Tracking</span>
          <strong>{tracking ? 'ONLINE' : 'PAUSED'}</strong>
          <p>{status}</p>
          <div className="status-mini-grid">
            <span>Gesture: {gesture}</span>
            <span>Hover: {hoveredControl ? labelForControl(hoveredControl) : 'None'}</span>
            <span>Mode: {isLocked ? 'Locked' : 'Free'}</span>
          </div>
          {error && <small>{error}</small>}
          <button type="button" className="ghost-button" onClick={() => setTracking((value) => !value)}>
            {tracking ? '트래킹 멈추기' : '트래킹 다시 시작'}
          </button>
        </div>
      </section>

      <section className="app-grid">
        <section className="panel camera-panel">
          <div className="panel-head">
            <h2>Live Camera Feed</h2>
            <span>{cameraReady ? 'LIVE' : 'BOOTING'}</span>
          </div>

          <div className={isPanelLaunched ? 'camera-stage live launched' : 'camera-stage live'}>
            <video ref={videoRef} className="camera-video" playsInline muted />
            <canvas ref={canvasRef} className="camera-canvas" />
            <div className={isLocked ? 'reticle locked' : 'reticle'} style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }} />
            <div className="hud-overlay">
              <span>Gesture: {gesture}</span>
              <span>Pointer: {Math.round(pointer.x)}, {Math.round(pointer.y)}</span>
              <span>Audio: {isMuted ? 'Muted' : 'On'}</span>
            </div>
            <div className="stage-badge-row">
              <span className={isPanelLaunched ? 'stage-badge active' : 'stage-badge'}>Launch</span>
              <span className={isLocked ? 'stage-badge active' : 'stage-badge'}>Lock</span>
              <span className={pulseActive ? 'stage-badge active' : 'stage-badge'}>Pulse</span>
              <span className={isMuted ? 'stage-badge active' : 'stage-badge'}>Mute</span>
            </div>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="panel-head">
            <h2>Control Dashboard</h2>
            <span>SYNCED</span>
          </div>

          <div className="metric-grid">
            {metrics.map((panel) => (
              <article key={panel.id} className="metric-card">
                <span>{panel.title}</span>
                <strong>{panel.value}</strong>
                <p>{panel.detail}</p>
              </article>
            ))}
          </div>

          <div className="control-grid">
            {controls.map((control) => {
              const isActive = control.id === activeControl
              const isHovered = control.id === hoveredControl

              return (
                <button
                  key={control.id}
                  ref={(node) => {
                    controlRefs.current[control.id] = node
                  }}
                  type="button"
                  className={[
                    'control-button',
                    isActive ? 'active' : '',
                    isHovered ? 'hovered' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => runControlAction(control.id)}
                >
                  <strong>{control.label}</strong>
                  <span>{control.hint}</span>
                </button>
              )
            })}
          </div>

          <div className="bottom-grid">
            <div className="insight-card command-card">
              <h3>Command Log</h3>
              <ul className="command-list">
                {commandLog.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>

            <div className="insight-card">
              <h3>현재 구현된 인터랙션</h3>
              <ul>
                <li>Launch: HUD 강조 상태 유지</li>
                <li>Lock: 포인터 잠금 모드 표시</li>
                <li>Pulse: 배경 pulse effect 재생</li>
                <li>Mute: 오디오 상태 토글</li>
              </ul>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

function findHoveredControl(pointer, refs) {
  const viewportX = (pointer.x / 100) * window.innerWidth
  const viewportY = (pointer.y / 100) * window.innerHeight

  for (const [id, node] of Object.entries(refs)) {
    if (!node) continue
    const rect = node.getBoundingClientRect()
    if (viewportX >= rect.left && viewportX <= rect.right && viewportY >= rect.top && viewportY <= rect.bottom) {
      return id
    }
  }

  return ''
}

function labelForControl(id) {
  return controls.find((control) => control.id === id)?.label || 'None'
}

function drawLandmarks(ctx, landmarks, width, height) {
  ctx.save()
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.8)'
  ctx.fillStyle = 'rgba(103, 232, 249, 0.95)'
  ctx.lineWidth = 2

  for (const point of landmarks) {
    const x = (1 - point.x) * width
    const y = point.y * height
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function deriveGesture(landmarks) {
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  const indexPip = landmarks[6]
  const middleTip = landmarks[12]
  const ringTip = landmarks[16]
  const pinkyTip = landmarks[20]
  const wrist = landmarks[0]

  const pinchDistance = distance(thumbTip, indexTip)
  const isPointing = indexTip.y < indexPip.y && middleTip.y > indexTip.y && ringTip.y > indexTip.y
  const averageOpenDistance =
    (distance(wrist, indexTip) + distance(wrist, middleTip) + distance(wrist, ringTip) + distance(wrist, pinkyTip)) / 4

  if (pinchDistance < 0.05) {
    return { gesture: 'Pinch', confidence: Math.max(0.7, 1 - pinchDistance * 10) }
  }

  if (isPointing) {
    return { gesture: 'Point', confidence: 0.82 }
  }

  if (averageOpenDistance > 0.28) {
    return { gesture: 'Open Palm', confidence: 0.88 }
  }

  return { gesture: 'Tracking', confidence: 0.61 }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export default App
