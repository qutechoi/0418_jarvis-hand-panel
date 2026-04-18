# 0418_jarvis-hand-panel

JARVIS 스타일의 손 제스처 컨트롤 패널 프로토타입입니다.

이번 버전은 MediaPipe Hand Landmarker를 연결해서 실제 웹캠 손 추적을 수행합니다. 손 랜드마크를 화면에 오버레이하고, 간단한 gesture 추론으로 Open Palm, Pinch, Point 상태를 HUD에 반영합니다.

## Features

- JARVIS 스타일 다크 HUD 인터페이스
- 실제 웹캠 기반 손 랜드마크 추적
- index finger 기준 포인터 좌표 표시
- 지수 보정(pointer smoothing)으로 손 떨림 완화
- hover dwell(1.4초)로 pinch 없이도 버튼 자동 활성화
- 간단한 gesture inference
  - Pinch
  - Point
  - Open Palm
- Three.js 기반 HUD 파티클 / 링 이펙트
- Web Audio + SpeechSynthesis 명령 피드백
- Control Dashboard와 실시간 상태 연동

## Stack

- React
- Vite
- MediaPipe Tasks Vision
- CSS

## Local Development

```bash
npm install
npm run dev
```

브라우저에서 카메라 권한 허용이 필요합니다.

## Build

```bash
npm run build
```

## Interaction Notes

- Pinch selection은 그대로 유지됩니다.
- 포인터는 index fingertip 좌표를 그대로 쓰되 smoothing 후 HUD에 반영합니다.
- 버튼 위에 손 포인터를 유지하면 dwell progress가 차고 자동 실행됩니다.
- `Mute`가 켜져 있으면 beep / voice feedback이 함께 꺼집니다.

## Next Step Ideas

- dwell 시간과 smoothing factor를 UI 슬라이더로 노출
- landmark trail 또는 gesture history overlay 추가
- command palette / mode switching 확장
- 실제 시스템 액션과 WebSocket 또는 API 연동
