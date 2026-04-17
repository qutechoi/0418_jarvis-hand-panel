# 0418_jarvis-hand-panel

JARVIS 스타일의 손 제스처 컨트롤 패널 프로토타입입니다.

웹캠 기반 손 트래킹 앱을 상정해, 제스처 상태(Open Palm, Pinch, Point, Swipe)에 따라 HUD 스타일 패널이 반응하는 UI를 React + Vite로 구성했습니다.

## Features

- JARVIS 스타일 다크 HUD 인터페이스
- 제스처 상태 전환 시각화
- 카메라 피드 모형 + 손 포인터 표시
- 제스처 버튼 및 컨트롤 패널 프로토타입
- 향후 MediaPipe/Three.js 연결을 염두에 둔 구조

## Stack

- React
- Vite
- CSS

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Next Step Ideas

- MediaPipe Hand Landmarker 연결
- Pinch 거리 기반 실제 선택 로직
- Three.js HUD / particle effect 연동
- WebXR 또는 full-screen immersive mode 확장
