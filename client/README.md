# BPMN 실시간 협업 데모

완전한 클라이언트 사이드 애플리케이션으로 구성된 BPMN 실시간 협업 데모입니다.

## 🚀 빠른 시작

### 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:8080` 접속

### 프로덕션 빌드
```bash
npm run build
```
`dist/` 폴더에 빌드 결과물 생성

### 정적 서버 실행
```bash
npm run serve
```

## 📦 프로젝트 구조

```
demo/
├── src/
│   ├── index.js          # 메인 엔트리 포인트
│   ├── demo.js           # 데모 클래스
│   ├── index.html        # HTML 템플릿
│   └── style.css         # 스타일시트
├── dist/                 # 빌드 결과물
├── webpack.config.js     # Webpack 설정
├── package.json          # NPM 설정
└── README.md            # 이 파일
```

## 🔧 기술 스택

- **Webpack**: 모듈 번들러
- **Y.js**: 실시간 동기화
- **BPMN.js**: BPMN 다이어그램 편집기
- **Y-WebSocket**: WebSocket 프로바이더

## ✨ 주요 기능

- ✅ 실시간 BPMN 다이어그램 편집
- ✅ 다중 사용자 협업
- ✅ 자동 동기화
- ✅ 사용자 커서 표시
- ✅ 활동 로그
- ✅ 완전한 클라이언트 사이드 애플리케이션

## 🛠️ 개발 모드

```bash
# 개발 서버 시작 (HMR 지원)
npm run dev

# 빌드 (프로덕션)
npm run build

# 정적 파일 서빙
npm run serve
```

## 📋 의존성

- `yjs`: 실시간 협업 엔진
- `y-websocket`: WebSocket 기반 네트워크 어댑터
- `bpmn-js`: BPMN 다이어그램 편집기

## 🔍 문제 해결

모든 의존성이 Webpack으로 번들링되므로 이전의 CDN 로딩 문제가 해결됩니다.

- 라이브러리 로딩 문제 없음
- 모든 의존성 로컬 관리
- 개발 서버 HMR 지원
- 프로덕션 빌드 최적화