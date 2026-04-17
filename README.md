# 0418_jarvis-hand-panel

JARVIS 스타일의 손 제스처 컨트롤 패널 프로토타입입니다.

이번 버전은 MediaPipe Hand Landmarker를 연결해서 실제 웹캠 손 추적을 수행합니다. 손 랜드마크를 화면에 오버레이하고, 간단한 gesture 추론으로 Open Palm, Pinch, Point 상태를 HUD에 반영합니다.

## Features

- JARVIS 스타일 다크 HUD 인터페이스
- 실제 웹캠 기반 손 랜드마크 추적
- index finger 기준 포인터 좌표 표시
- 간단한 gesture inference
  - Pinch
  - Point
  - Open Palm
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

## Next Step Ideas

- Pinch를 실제 버튼 선택 이벤트로 연결
- landmark smoothing / debounce 추가
- Three.js particle HUD 연동
- gesture history trail 또는 command palette 추가
