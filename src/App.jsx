import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import './App.css'

const basePanels = [
  { id: 'scan', title: 'SYSTEM SCAN', value: 'LIVE', detail: '랜드마크와 손 상태를 분석 중' },
  { id: 'intent', title: 'INTENT', value: 'GESTURE', detail: 'pinch / point / hover dwell 감지' },
  { id: 'focus', title: 'FOCUS', value: 'HUD', detail: '보정된 포인터와 HUD 중심 좌표' },
]

const controls = [
  { id: 'launch', label: 'Launch', hint: '패널 열기' },
  { id: 'lock', label: 'Lock', hint: '현재 대상 고정' },
  { id: 'pulse', label: 'Pulse', hint: '이펙트 재생' },
  { id: 'mute', label: 'Mute', hint: '알림 끄기' },
]

const SMOOTHING_FACTOR = 0.18
const DWELL_MS = 1400

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const hudCanvasRef = useRef(null)
  const requestRef = useRef(null)
  const handLandmarkerRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const controlRefs = useRef({})
  const pinchLatchRef = useRef(false)
  const pulseTimeoutRef = useRef(null)
  const smoothedPointerRef = useRef({ x: 50, y: 50 })
  const dwellRef = useRef({ id: '', startedAt: 0, fired: false })
  const audioContextRef = useRef(null)
  const voiceRef = useRef(null)

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
  const [dwellProgress, setDwellProgress] = useState(0)
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

  useHudScene(hudCanvasRef, pointer, pulseActive, hoveredControl)

  useEffect(() => {
    let stream

    const audioContext = audioContextRef.current

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
        setStatus('손을 화면에 올려봐. 호버를 잠시 유지하거나 pinch 하면 HUD가 반응해.')
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
      window.speechSynthesis?.cancel()
      audioContext?.close?.()
    }
  }, [])

  const pushCommandLog = (entry) => {
    setCommandLog((current) => [entry, ...current].slice(0, 4))
  }

  const playFeedback = useCallback((controlId, trigger) => {
    if (isMuted) return
    playTone(audioContextRef, controlId)
    speakFeedback(voiceRef, `${labelForControl(controlId)} ${trigger}`)
  }, [isMuted])

  const runControlAction = useCallback((controlId, trigger = 'tap') => {
    setActiveControl(controlId)

    if (controlId === 'launch') {
      setIsPanelLaunched(true)
      setStatus(`HUD 패널을 전면 활성화했어. (${trigger})`)
      pushCommandLog(`LAUNCH PANEL · ${trigger.toUpperCase()}`)
      playFeedback(controlId, trigger)
      return
    }

    if (controlId === 'lock') {
      setIsLocked((value) => {
        const next = !value
        setStatus(next ? `포인터 위치를 잠갔어. (${trigger})` : `포인터 잠금을 해제했어. (${trigger})`)
        pushCommandLog(next ? `LOCK TARGET · ${trigger.toUpperCase()}` : `UNLOCK TARGET · ${trigger.toUpperCase()}`)
        playFeedback(next ? 'lock-on' : 'lock-off', trigger)
        return next
      })
      return
    }

    if (controlId === 'pulse') {
      setPulseActive(true)
      setStatus(`Pulse 이펙트를 재생했어. (${trigger})`)
      pushCommandLog(`PULSE TRIGGERED · ${trigger.toUpperCase()}`)
      playFeedback(controlId, trigger)
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current)
      pulseTimeoutRef.current = setTimeout(() => setPulseActive(false), 700)
      return
    }

    if (controlId === 'mute') {
      setIsMuted((value) => {
        const next = !value
        setStatus(next ? `알림을 음소거했어. (${trigger})` : `알림을 다시 켰어. (${trigger})`)
        pushCommandLog(next ? `MUTE ALERTS · ${trigger.toUpperCase()}` : `UNMUTE ALERTS · ${trigger.toUpperCase()}`)
        if (!next) playFeedback('unmute', trigger)
        return next
      })
    }
  }, [playFeedback])

  const updateDwell = useCallback((hovered) => {
    const now = performance.now()

    if (!hovered) {
      dwellRef.current = { id: '', startedAt: 0, fired: false }
      setDwellProgress(0)
      return
    }

    if (dwellRef.current.id !== hovered) {
      dwellRef.current = { id: hovered, startedAt: now, fired: false }
      setDwellProgress(0)
      return
    }

    if (dwellRef.current.fired) {
      setDwellProgress(1)
      return
    }

    const progress = Math.min((now - dwellRef.current.startedAt) / DWELL_MS, 1)
    setDwellProgress(progress)

    if (progress >= 1) {
      dwellRef.current = { ...dwellRef.current, fired: true }
      runControlAction(hovered, 'dwell')
    }
  }, [runControlAction])

  useEffect(() => {
    if (!tracking || !cameraReady) return

    const renderLoop = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
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
        const smoothedPointer = isLocked
          ? smoothedPointerRef.current
          : smoothPointer(smoothedPointerRef.current, nextPointer, SMOOTHING_FACTOR)

        smoothedPointerRef.current = smoothedPointer

        setGesture(derived.gesture)
        setConfidence(derived.confidence)
        setHandCount(results.landmarks.length)
        setPointer(smoothedPointer)

        const hovered = findHoveredControl(smoothedPointer, controlRefs.current)
        setHoveredControl(hovered)
        updateDwell(hovered)

        if (derived.gesture === 'Pinch' && hovered && !pinchLatchRef.current) {
          runControlAction(hovered, 'pinch')
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
        setDwellProgress(0)
        dwellRef.current = { id: '', startedAt: 0, fired: false }
        pinchLatchRef.current = false
      }

      requestRef.current = requestAnimationFrame(renderLoop)
    }

    requestRef.current = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(requestRef.current)
  }, [tracking, cameraReady, isLocked, isMuted, isPanelLaunched, runControlAction, updateDwell])

  return (
    <main className={pulseActive ? 'page-shell pulse-active' : 'page-shell'}>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">0418 Jarvis Hand Panel</span>
          <h1>JARVIS 스타일 손 제스처 컨트롤 패널</h1>
          <p>
            스무딩된 포인터, hover dwell, HUD 파티클 이펙트, 음성 피드백까지 붙어서 손 제스처 데모가 훨씬 안정적으로
            반응해.
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
            <span>Dwell: {Math.round(dwellProgress * 100)}%</span>
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
            <canvas ref={hudCanvasRef} className="hud-canvas" />
            <div className={isLocked ? 'reticle locked' : 'reticle'} style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }}>
              <span className="reticle-core" />
              <svg viewBox="0 0 120 120" className="reticle-ring" style={{ '--progress': dwellProgress }}>
                <circle cx="60" cy="60" r="52" pathLength="1" />
              </svg>
            </div>
            <div className="hud-overlay">
              <span>Gesture: {gesture}</span>
              <span>Pointer: {Math.round(pointer.x)}, {Math.round(pointer.y)}</span>
              <span>Audio: {isMuted ? 'Muted' : 'On'}</span>
              <span>Confidence: {(confidence * 100).toFixed(0)}%</span>
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
                  onClick={() => runControlAction(control.id, 'click')}
                >
                  <div className="control-button-head">
                    <strong>{control.label}</strong>
                    {isHovered && <em>{Math.round(dwellProgress * 100)}%</em>}
                  </div>
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
                <li>지수 보정 포인터 스무딩</li>
                <li>Hover dwell 1.4초 자동 활성화</li>
                <li>Pinch 직접 선택 유지</li>
                <li>Three.js HUD 파티클 + 리액티브 링</li>
                <li>Web Audio + SpeechSynthesis 피드백</li>
              </ul>
            </div>
          </div>

          <div className="footnote-row">
            <span>Hands: {handCount}</span>
            <span>Smoothing: {SMOOTHING_FACTOR}</span>
            <span>Dwell: {DWELL_MS}ms</span>
          </div>
        </section>
      </section>
    </main>
  )
}

function useHudScene(canvasRef, pointer, pulseActive, hoveredControl) {
  const motionRef = useRef({ pointer, pulseActive, hoveredControl })

  useEffect(() => {
    motionRef.current = { pointer, pulseActive, hoveredControl }
  }, [hoveredControl, pointer, pulseActive])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
    camera.position.z = 7

    const group = new THREE.Group()
    scene.add(group)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.48, 128),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    )
    group.add(ring)

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.8, 96),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    )
    group.add(innerRing)

    const particleCount = 180
    const positions = new Float32Array(particleCount * 3)
    const scales = []

    for (let index = 0; index < particleCount; index += 1) {
      const angle = (index / particleCount) * Math.PI * 2
      const radius = 2.1 + Math.random() * 0.9
      positions[index * 3] = Math.cos(angle) * radius
      positions[index * 3 + 1] = Math.sin(angle) * radius
      positions[index * 3 + 2] = (Math.random() - 0.5) * 0.4
      scales.push(0.7 + Math.random() * 1.2)
    }

    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0x7dd3fc,
        size: 0.06,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    scene.add(particles)

    const clock = new THREE.Clock()

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const width = parent.clientWidth
      const height = parent.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    resize()
    window.addEventListener('resize', resize)

    let frameId = 0
    const animate = () => {
      const elapsed = clock.getElapsedTime()
      const { pointer: livePointer, pulseActive: livePulse, hoveredControl: liveHover } = motionRef.current
      const energy = livePulse ? 1 : liveHover ? 0.65 : 0.35

      group.rotation.z += 0.003 + energy * 0.01
      ring.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.03 + energy * 0.12)
      innerRing.rotation.z -= 0.01
      innerRing.scale.setScalar(1 + Math.cos(elapsed * 1.7) * 0.04)

      particles.rotation.z -= 0.0025
      particles.position.x = ((livePointer.x - 50) / 50) * 0.9
      particles.position.y = -((livePointer.y - 50) / 50) * 0.55

      const attribute = particleGeometry.attributes.position
      for (let index = 0; index < particleCount; index += 1) {
        const base = index * 3
        const angle = (index / particleCount) * Math.PI * 2 + elapsed * (0.15 + energy * 0.4)
        const radius = 2.2 + Math.sin(elapsed * scales[index] + index) * 0.14
        attribute.array[base] = Math.cos(angle) * radius
        attribute.array[base + 1] = Math.sin(angle) * radius
      }
      attribute.needsUpdate = true

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      ring.geometry.dispose()
      ring.material.dispose()
      innerRing.geometry.dispose()
      innerRing.material.dispose()
      particleGeometry.dispose()
      particles.material.dispose()
    }
  }, [canvasRef])
}

function smoothPointer(current, target, factor) {
  return {
    x: current.x + (target.x - current.x) * factor,
    y: current.y + (target.y - current.y) * factor,
  }
}

function playTone(audioContextRef, controlId) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  if (!audioContextRef.current) {
    audioContextRef.current = new AudioContextClass()
  }

  const context = audioContextRef.current
  if (context.state === 'suspended') {
    context.resume().catch(() => {})
  }

  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const frequencies = {
    launch: 540,
    pulse: 720,
    mute: 260,
    unmute: 480,
    'lock-on': 620,
    'lock-off': 350,
  }

  oscillator.type = controlId === 'pulse' ? 'triangle' : 'sine'
  oscillator.frequency.setValueAtTime(frequencies[controlId] || 440, now)
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.2)
}

function speakFeedback(voiceRef, text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.05
  utterance.pitch = 1.05
  utterance.volume = 0.75

  if (!voiceRef.current) {
    const voices = window.speechSynthesis.getVoices()
    voiceRef.current = voices.find((voice) => /en|ko/i.test(voice.lang)) || null
  }

  if (voiceRef.current) utterance.voice = voiceRef.current
  window.speechSynthesis.speak(utterance)
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
  return controls.find((control) => control.id === id)?.label || id || 'None'
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
