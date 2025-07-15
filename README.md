# Online BPMN Diff - 실시간 BPMN 협업 시스템

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()

실시간 BPMN 다이어그램 협업 편집을 위한 Diff 기반 동기화 시스템입니다. Y.js CRDT와 WebSocket을 활용하여 여러 사용자가 동시에 BPMN 다이어그램을 편집할 수 있습니다.

## 🌟 주요 기능

### ⚡ 실시간 협업
- **동시 편집**: 여러 사용자가 동시에 BPMN 다이어그램 편집
- **즉시 동기화**: 변경사항이 실시간으로 모든 참여자에게 전파
- **충돌 해결**: Y.js CRDT를 통한 자동 충돌 해결
- **사용자 인식**: 다른 사용자의 커서와 선택 영역 표시

### 🔄 Diff 기반 동기화
- **효율적인 동기화**: 전체 문서가 아닌 변경된 부분만 전송
- **모듈러 아키텍처**: 추출기, 계산기, 적용기로 분리된 설계
- **플러그인 시스템**: 확장 가능한 기능 추가
- **성능 모니터링**: 동기화 성능 추적 및 최적화

### 🏗️ 확장 가능한 아키텍처
- **추상화 계층**: 다양한 동기화 전략 지원
- **어댑터 패턴**: Y.js 외 다른 동기화 프로토콜 지원 가능
- **이벤트 기반**: 느슨한 결합을 통한 모듈 간 통신
- **TypeScript 지원**: JSDoc을 통한 타입 정의

## 🚀 빠른 시작

### 필수 요구사항

- Node.js 18.0.0 이상
- npm 또는 yarn

### 설치

```bash
# 리포지토리 클론
git clone https://github.com/your-org/online-bpmn-diff.git
cd online-bpmn-diff

# 모든 의존성 설치
npm run install:all

# 또는 개별 설치
npm install                    # 루트 패키지
npm install --prefix server    # 서버 의존성
npm install --prefix tests     # 테스트 의존성
```

### 서버 실행

```bash
# 개발 모드 (파일 변경 감지)
npm run dev

# 프로덕션 모드
npm start
```

서버가 `http://localhost:3001`에서 실행됩니다.

### 테스트 실행

```bash
# 모든 테스트 실행
npm test

# 단위 테스트만 실행
npm run test:unit

# 통합 테스트만 실행
npm run test:integration

# 커버리지 리포트 생성
npm run test:coverage
```

## 📖 사용법

### 기본 사용법

```javascript
import { BpmnDiffSync } from 'online-bpmn-diff';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import * as Y from 'yjs';

// BPMN 모델러 생성
const modeler = new BpmnModeler({
  container: '#canvas'
});

// Y.js 문서 생성 (협업용)
const yjsDoc = new Y.Doc();

// BpmnDiffSync 초기화
const diffSync = new BpmnDiffSync({
  syncInterval: 1000,           // 1초마다 동기화
  enablePerformanceMonitoring: true
});

// 협업 시작
await diffSync.initialize(modeler, yjsDoc, {
  clientId: 'user-123'
});

// 자동 동기화 시작
diffSync.startAutoSync();

// 이벤트 리스너 등록
diffSync.on('sync:completed', (result) => {
  console.log('동기화 완료:', result);
});

diffSync.on('remote:change', (diff) => {
  console.log('원격 변경사항:', diff);
});
```

### 서버와 연결

```javascript
import { WSSharedDoc } from 'y-websocket';

// WebSocket을 통한 Y.js 동기화
const wsProvider = new WSSharedDoc(
  'document-id',
  'ws://localhost:3001/ws'
);

// BpmnDiffSync와 연결
await diffSync.initialize(modeler, wsProvider.doc, {
  clientId: 'user-123'
});
```

## 🏗️ 아키텍처

### 핵심 구성 요소

```
┌─────────────────────────────────────────────────────────────┐
│                    BpmnDiffSync                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                DiffSyncEngine                       │    │
│  │  ┌──────────────┬──────────────┬──────────────────┐  │    │
│  │  │  Extractor   │  Calculator  │   Applicator     │  │    │
│  │  │              │              │                  │  │    │
│  │  │ BpmnState    │ StandardDiff │  BpmnDiff        │  │    │
│  │  │ Extractor    │ Calculator   │  Applicator      │  │    │
│  │  └──────────────┴──────────────┴──────────────────┘  │    │
│  │  ┌─────────────────────────────────────────────────┐  │    │
│  │  │              StateManager                       │  │    │
│  │  └─────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 YjsAdapter                          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 모듈 설명

#### 🔧 **BpmnDiffSync**
- 메인 API 클래스
- 설정 관리 및 라이프사이클 제어
- 플러그인 시스템 관리

#### ⚙️ **DiffSyncEngine**
- 핵심 동기화 로직
- 구성 요소 간 조율
- 성능 모니터링

#### 📤 **BpmnStateExtractor**
- BPMN 다이어그램 상태 추출
- 요소 필터링 및 메타데이터 생성
- 시각적 정보 포함/제외 설정

#### 🧮 **StandardDiffCalculator**
- 상태 간 차이점 계산
- 추가/수정/삭제 요소 식별
- 의존성 순서 정렬

#### 🎯 **BpmnDiffApplicator**
- BPMN 모델러에 변경사항 적용
- 트랜잭션 관리 및 롤백
- 오류 처리 및 복구

#### 🔌 **YjsAdapter**
- Y.js CRDT와의 통합
- WebSocket 통신 관리
- 압축 및 배치 처리

#### 🗄️ **StateManager**
- 문서 상태 히스토리 관리
- 스냅샷 생성 및 복원
- 버전 관리

## 🌐 서버 API

### RESTful API

#### 문서 관리

```http
# 문서 목록 조회
GET /api/documents

# 새 문서 생성
POST /api/documents
Content-Type: application/json
{
  "name": "새 프로세스",
  "initialData": {
    "bpmn": "<bpmn:definitions>...</bpmn:definitions>"
  }
}

# 문서 조회
GET /api/documents/{id}

# 문서 삭제
DELETE /api/documents/{id}
```

#### 사용자 관리

```http
# 문서의 활성 사용자 조회
GET /api/documents/{id}/users

# 협업 세션 조회
GET /api/documents/{id}/sessions
```

#### 모니터링

```http
# 서버 상태 확인
GET /health

# 서버 정보
GET /info

# 메트릭스 조회
GET /api/metrics
```

### WebSocket API

```javascript
// 연결
ws://localhost:3001/ws?document={documentId}&user={userId}

// 메시지 형식
{
  "type": "sync",
  "update": Uint8Array,
  "origin": "user-id"
}

{
  "type": "awareness",
  "awareness": {
    "user": {
      "name": "사용자명",
      "cursor": { "x": 100, "y": 200 }
    }
  }
}
```

## 🔧 설정

### BpmnDiffSync 설정

```javascript
const diffSync = new BpmnDiffSync({
  // 동기화 설정
  syncInterval: 1000,                    // 자동 동기화 간격 (ms)
  enableAutoSync: true,                  // 자동 동기화 활성화
  
  // 성능 설정
  enablePerformanceMonitoring: true,     // 성능 모니터링
  maxStateHistory: 50,                   // 상태 히스토리 최대 개수
  
  // 추출기 설정
  extractor: {
    includeVisualInfo: true,             // 시각적 정보 포함
    includeBusinessObjects: true,        // 비즈니스 객체 포함
    includeTypes: ['bpmn:Task', 'bpmn:Gateway'], // 특정 타입만 포함
    excludeTypes: ['bpmn:TextAnnotation'] // 특정 타입 제외
  },
  
  // 계산기 설정
  calculator: {
    enableOptimization: true,            // 최적화 활성화
    batchSize: 100                       // 배치 크기
  },
  
  // 적용기 설정
  applicator: {
    rollbackOnError: true,               // 오류 시 롤백
    validateBeforeApply: true,           // 적용 전 검증
    batchSize: 50                        // 배치 크기
  },
  
  // 어댑터 설정
  adapter: {
    enableCompression: true,             // 압축 활성화
    batchUpdates: true,                  // 배치 업데이트
    batchDelay: 100                      // 배치 지연 시간 (ms)
  }
});
```

### 서버 설정

```javascript
const server = new BpmnCollaborationServer({
  // 서버 설정
  port: 3001,
  host: 'localhost',
  
  // 제한 설정
  maxDocuments: 100,
  maxUsersPerDocument: 50,
  documentTimeout: 3600000,             // 1시간
  
  // 기능 설정
  enableCORS: true,
  enableMetrics: true,
  enableLogging: true
});
```

## 📊 모니터링

### 성능 메트릭스

```javascript
// 동기화 성능
const metrics = diffSync.getPerformanceMetrics();
console.log('평균 동기화 시간:', metrics.averageSyncTime);
console.log('총 동기화 횟수:', metrics.totalSyncs);
console.log('실패한 동기화:', metrics.failedSyncs);

// 상세 통계
const stats = diffSync.getStatistics();
console.log('엔진 통계:', stats.engine);
console.log('상태 관리:', stats.stateManager);
console.log('성능 정보:', stats.performance);
```

### 서버 메트릭스

```javascript
// 서버 상태
const status = server.getStatus();
console.log('실행 시간:', status.uptime);
console.log('활성 연결:', status.connections);

// 협업 메트릭스
const metrics = await fetch('/api/metrics').then(r => r.json());
console.log('활성 문서:', metrics.documents.activeDocuments);
console.log('총 사용자:', metrics.users.activeUsers);
console.log('WebSocket 연결:', metrics.websockets.connections);
```

## 🔌 플러그인 개발

### 커스텀 플러그인 생성

```javascript
const customPlugin = {
  name: 'CustomPlugin',
  version: '1.0.0',
  
  // 플러그인 초기화
  initialize(diffSync, config) {
    console.log('커스텀 플러그인 초기화');
    
    // 이벤트 리스너 등록
    diffSync.on('sync:completed', this.handleSyncCompleted.bind(this));
  },
  
  // 동기화 완료 이벤트 처리
  handleSyncCompleted(result) {
    console.log('동기화 완료:', result.appliedChanges);
  },
  
  // 플러그인 정리
  destroy() {
    console.log('커스텀 플러그인 정리');
  }
};

// 플러그인 등록
diffSync.registerPlugin(customPlugin);
```

### 커스텀 추출기

```javascript
import { BaseExtractor } from 'online-bpmn-diff';

class CustomExtractor extends BaseExtractor {
  async extract(context) {
    const { modeler, clientId } = context;
    
    // 커스텀 추출 로직
    const customData = this.extractCustomData(modeler);
    
    return {
      timestamp: Date.now(),
      version: '1.0.0',
      clientId,
      elements: customData,
      metadata: {
        extractor: 'CustomExtractor',
        customProperty: 'value'
      }
    };
  }
  
  extractCustomData(modeler) {
    // 구현...
  }
}
```

## 🧪 테스트

### 단위 테스트

```bash
# 특정 모듈 테스트
npm run test:unit -- BpmnDiffSync.test.js

# 특정 테스트 케이스
npm run test:unit -- --grep "초기화"
```

### 통합 테스트

```bash
# 협업 기능 테스트
npm run test:integration -- collaboration.test.js

# 서버 API 테스트
npm run test:integration -- server.test.js
```

### 커버리지 리포트

```bash
npm run test:coverage
```

커버리지 리포트는 `coverage/` 디렉토리에 생성됩니다.

## 🐛 문제 해결

### 자주 발생하는 문제

#### WebSocket 연결 실패

```javascript
// 연결 상태 확인
if (!diffSync.isConnected) {
  console.error('WebSocket 연결이 끊어졌습니다');
  // 재연결 시도
  await diffSync.reconnect();
}
```

#### 동기화 성능 문제

```javascript
// 동기화 간격 조정
diffSync.updateConfig({
  syncInterval: 2000  // 2초로 증가
});

// 배치 크기 조정
diffSync.updateConfig({
  applicator: {
    batchSize: 25     // 배치 크기 감소
  }
});
```

#### 메모리 사용량 증가

```javascript
// 상태 히스토리 제한
diffSync.updateConfig({
  maxStateHistory: 20  // 기본값 50에서 감소
});

// 주기적 정리
setInterval(() => {
  diffSync.cleanup();
}, 300000); // 5분마다
```

### 디버깅

```javascript
// 디버그 모드 활성화
const diffSync = new BpmnDiffSync({
  debug: true,
  logLevel: 'debug'
});

// 이벤트 로깅
diffSync.on('*', (eventName, data) => {
  console.log(`이벤트: ${eventName}`, data);
});
```

## 🤝 기여하기

### 개발 환경 설정

```bash
# 리포지토리 포크 및 클론
git clone https://github.com/your-username/online-bpmn-diff.git
cd online-bpmn-diff

# 의존성 설치
npm run install:all

# 개발 서버 실행
npm run dev
```

### 코딩 규칙

- **ESLint**: 코드 스타일 검사
- **Prettier**: 코드 포맷팅
- **JSDoc**: 타입 및 문서화

```bash
# 린트 검사
npm run lint

# 코드 포맷팅
npm run format

# 문서 생성
npm run docs
```

### 커밋 규칙

```bash
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 변경
style: 코드 포맷팅
refactor: 코드 리팩토링
test: 테스트 추가/수정
chore: 빌드 과정 또는 보조 도구 변경
```

### Pull Request

1. 기능 브랜치 생성: `git checkout -b feature/new-feature`
2. 변경사항 커밋: `git commit -m 'feat: add new feature'`
3. 브랜치 푸시: `git push origin feature/new-feature`
4. Pull Request 생성

## 📄 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE) 하에 배포됩니다.

## 🙏 감사의 말

- [BPMN.js](https://bpmn.io/) - BPMN 다이어그램 편집기
- [Y.js](https://github.com/yjs/yjs) - CRDT 라이브러리
- [Express.js](https://expressjs.com/) - 웹 서버 프레임워크

## 📞 지원

- **문서**: [프로젝트 위키](https://github.com/your-org/online-bpmn-diff/wiki)
- **이슈 리포트**: [GitHub Issues](https://github.com/your-org/online-bpmn-diff/issues)
- **토론**: [GitHub Discussions](https://github.com/your-org/online-bpmn-diff/discussions)

---

**Made with ❤️ by BPMN Collaboration Team**