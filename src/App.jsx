import { useEffect, useMemo, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import './App.css'

const panels = [
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

  const [tracking, setTracking] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [status, setStatus] = useState('카메라 권한을 허용하면 손 트래킹을 시작할 수 있어.')
  const [error, setError] = useState('')
  const [gesture, setGesture] = useState('No hand')
  const [confidence, setConfidence] = useState(0)
  const [handCount, setHandCount] = useState(0)
  const [activeControl, setActiveControl] = useState('launch')
  const [pointer, setPointer] = useState({ x: 50, y: 50 })

  const metrics = useMemo(
    () => [
      { ...panels[0], value: tracking ? 'LIVE' : 'PAUSED' },
      { ...panels[1], value: gesture.toUpperCase() },
      { ...panels[2], value: `${Math.round(pointer.x)} / ${Math.round(pointer.y)}` },
    ],
    [gesture, pointer.x, pointer.y, tracking],
  )

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
        setStatus('손을 화면에 올려봐. pinch와 point를 감지할 수 있어.')
      } catch (err) {
        setError(err.message || '카메라 또는 모델 초기화에 실패했어.')
        setStatus('초기화 실패')
      }
    }

    setup()

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
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
        setGesture(derived.gesture)
        setConfidence(derived.confidence)
        setHandCount(results.landmarks.length)
        setPointer({ x: (1 - landmarks[8].x) * 100, y: landmarks[8].y * 100 })
      } else {
        setGesture('No hand')
        setConfidence(0)
        setHandCount(0)
      }

      requestRef.current = requestAnimationFrame(renderLoop)
    }

    requestRef.current = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(requestRef.current)
  }, [tracking, cameraReady])

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">0418 Jarvis Hand Panel</span>
          <h1>JARVIS 스타일 손 제스처 컨트롤 패널</h1>
          <p>
            MediaPipe Hand Landmarker를 붙여서 실제 웹캠 손 추적을 수행하는 버전이야. 현재는 손 랜드마크,
            index 포인터, 그리고 간단한 gesture 추론을 보여줘.
          </p>
        </div>

        <div className="status-card">
          <span className="status-label">Tracking</span>
          <strong>{tracking ? 'ONLINE' : 'PAUSED'}</strong>
          <p>{status}</p>
          <div className="status-mini-grid">
            <span>Gesture: {gesture}</span>
            <span>Confidence: {confidence.toFixed(2)}</span>
            <span>Hands: {handCount}</span>
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

          <div className="camera-stage live">
            <video ref={videoRef} className="camera-video" playsInline muted />
            <canvas ref={canvasRef} className="camera-canvas" />
            <div className="hud-overlay">
              <span>Gesture: {gesture}</span>
              <span>Pointer: {Math.round(pointer.x)}, {Math.round(pointer.y)}</span>
              <span>Track: {tracking ? 'active' : 'paused'}</span>
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
            <h3>현재 구현된 제스처</h3>
            <ul>
              <li>Pinch: 엄지와 검지 끝 거리가 가까움</li>
              <li>Point: 검지만 펴진 상태에 가까움</li>
              <li>Open Palm: 손가락이 전반적으로 펼쳐짐</li>
            </ul>
          </div>
        </section>
      </section>
    </main>
  )
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
  const averageOpenDistance = (distance(wrist, indexTip) + distance(wrist, middleTip) + distance(wrist, ringTip) + distance(wrist, pinkyTip)) / 4

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
