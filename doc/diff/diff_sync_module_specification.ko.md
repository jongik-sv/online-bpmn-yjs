# Diff 기반 동기화 모듈 사양서

## 개요

BPMN.js 기반 실시간 협업을 위한 독립적이고 재사용 가능한 Diff 기반 동기화 모듈의 상세 사양서입니다.

## 1. 모듈 정보

### 1.1 기본 정보

```yaml
패키지명: @bpmn-collaboration/diff-sync
버전: 1.0.0
라이선스: MIT
호환성:
  - Node.js: >=14.0.0
  - BPMN.js: >=10.0.0
  - Y.js: >=13.0.0
브라우저 지원:
  - Chrome: >=90
  - Firefox: >=88
  - Safari: >=14
  - Edge: >=90
번들 크기:
  - Minified: ~45KB
  - Gzipped: ~12KB
```

### 1.2 의존성

```json
{
  "peerDependencies": {
    "bpmn-js": "^10.0.0 || ^11.0.0 || ^12.0.0",
    "yjs": "^13.0.0"
  },
  "dependencies": {
    "eventemitter3": "^4.0.7",
    "lodash": "^4.17.21"
  },
  "optionalDependencies": {
    "y-websocket": "^1.4.5",
    "y-indexeddb": "^9.0.9"
  }
}
```

## 2. API 사양

### 2.1 메인 클래스: BpmnDiffSync

#### **생성자**

```typescript
constructor(options?: DiffSyncOptions)
```

**매개변수:**
- `options` (선택): 모듈 설정 옵션

**예제:**
```javascript
const diffSync = new BpmnDiffSync({
  engine: {
    syncInterval: 500,
    maxBatchSize: 100
  },
  logging: {
    level: 'info'
  }
});
```

#### **초기화 메서드**

```typescript
async initialize(
  modeler: BpmnModeler,
  collaborationProvider: Y.Doc | CollaborationProvider,
  options?: InitializeOptions
): Promise<BpmnDiffSync>
```

**매개변수:**
- `modeler`: BPMN.js 모델러 인스턴스
- `collaborationProvider`: Y.js 문서 또는 협업 제공자
- `options` (선택): 초기화 옵션

**반환값:** Promise<BpmnDiffSync>

**예제:**
```javascript
const modeler = new BpmnModeler({ container: '#canvas' });
const yjsDoc = new Y.Doc();

await diffSync.initialize(modeler, yjsDoc, {
  clientId: 'user-123',
  enableInitialSync: true
});
```

#### **이벤트 관리**

```typescript
on(event: string, callback: Function): void
off(event: string, callback: Function): void
once(event: string, callback: Function): void
emit(event: string, data?: any): void
```

**지원 이벤트:**
- `initialized`: 모듈 초기화 완료
- `localSync`: 로컬 변경사항 동기화
- `remoteSync`: 원격 변경사항 적용
- `syncError`: 동기화 오류
- `conflict`: 충돌 감지
- `performance`: 성능 경고

**예제:**
```javascript
diffSync.on('localSync', (data) => {
  console.log(`Synced ${data.diff.added.length} additions`);
});

diffSync.on('syncError', (error) => {
  console.error('Sync failed:', error.message);
});
```

#### **동기화 제어**

```typescript
// 즉시 동기화 실행
async sync(): Promise<SyncResult>

// 동기화 일시 정지/재개
pause(): void
resume(): void

// 동기화 간격 변경
setSyncInterval(interval: number): void

// 강제 상태 리셋
async reset(): Promise<void>
```

#### **상태 관리**

```typescript
// 현재 상태 스냅샷
createSnapshot(): DocumentState

// 상태 복원
async restoreSnapshot(snapshot: DocumentState): Promise<void>

// 현재 설정 조회
getConfig(): DiffSyncConfig

// 설정 업데이트
updateConfig(config: Partial<DiffSyncConfig>): void
```

#### **플러그인 관리**

```typescript
addPlugin(plugin: Plugin): void
removePlugin(pluginName: string): void
getPlugin(pluginName: string): Plugin | null
listPlugins(): string[]
```

#### **메트릭 및 디버깅**

```typescript
getMetrics(): PerformanceMetrics
getDebugInfo(): DebugInfo
exportLogs(): LogEntry[]
```

### 2.2 설정 옵션

#### **DiffSyncOptions 인터페이스**

```typescript
interface DiffSyncOptions {
  engine?: EngineConfig;
  extractor?: ExtractorConfig;
  calculator?: CalculatorConfig;
  applicator?: ApplicatorConfig;
  adapter?: AdapterConfig;
  plugins?: PluginConfig[];
  logging?: LoggingConfig;
  performance?: PerformanceConfig;
}

interface EngineConfig {
  syncInterval?: number;        // 동기화 간격 (ms), 기본값: 500
  maxBatchSize?: number;        // 최대 배치 크기, 기본값: 100
  enableOptimization?: boolean; // 최적화 활성화, 기본값: true
  autoStart?: boolean;          // 자동 시작, 기본값: true
  clientId?: string;            // 클라이언트 ID
}

interface ExtractorConfig {
  type?: 'BpmnStateExtractor' | 'CustomExtractor';
  options?: {
    includeMetadata?: boolean;    // 메타데이터 포함, 기본값: true
    positionPrecision?: number;   // 위치 정밀도, 기본값: 0
    excludeLabels?: boolean;      // 라벨 제외, 기본값: true
    excludeTypes?: string[];      // 제외할 요소 타입
    customProperties?: string[];  // 포함할 커스텀 속성
  };
}

interface CalculatorConfig {
  type?: 'StandardDiffCalculator' | 'OptimizedDiffCalculator';
  options?: {
    positionTolerance?: number;   // 위치 허용 오차, 기본값: 0.5
    enableOptimization?: boolean; // 최적화 활성화, 기본값: true
    ignoreMinorChanges?: boolean; // 미세 변경 무시, 기본값: true
    batchThreshold?: number;      // 배치 처리 임계값, 기본값: 10
  };
}

interface ApplicatorConfig {
  type?: 'BpmnDiffApplicator' | 'SafeDiffApplicator';
  options?: {
    validateBeforeApply?: boolean; // 적용 전 검증, 기본값: true
    rollbackOnError?: boolean;     // 오류시 롤백, 기본값: true
    batchSize?: number;            // 배치 크기, 기본값: 50
    applyTimeout?: number;         // 적용 타임아웃 (ms), 기본값: 5000
  };
}

interface AdapterConfig {
  type?: 'YjsAdapter' | 'WebSocketAdapter' | 'CustomAdapter';
  options?: {
    enableCompression?: boolean;   // 압축 활성화, 기본값: false
    retryOnError?: boolean;        // 오류시 재시도, 기본값: true
    maxRetries?: number;           // 최대 재시도 횟수, 기본값: 3
    retryDelay?: number;           // 재시도 지연 (ms), 기본값: 1000
  };
}

interface LoggingConfig {
  level?: 'debug' | 'info' | 'warn' | 'error'; // 로그 레벨, 기본값: 'info'
  enableConsole?: boolean;                      // 콘솔 로그, 기본값: true
  enableRemote?: boolean;                       // 원격 로그, 기본값: false
  remoteEndpoint?: string;                      // 원격 로그 엔드포인트
  maxLogEntries?: number;                       // 최대 로그 항목, 기본값: 1000
}

interface PerformanceConfig {
  enableMonitoring?: boolean;    // 성능 모니터링, 기본값: true
  slowSyncThreshold?: number;    // 느린 동기화 임계값 (ms), 기본값: 100
  memoryThreshold?: number;      // 메모리 임계값 (MB), 기본값: 100
  alertOnThreshold?: boolean;    // 임계값 초과시 알림, 기본값: true
}
```

### 2.3 데이터 타입

#### **DocumentState**

```typescript
interface DocumentState {
  timestamp: number;
  version: string;
  clientId: string;
  elements: Record<string, ElementData>;
  metadata?: DocumentMetadata;
  checksum?: string;
}

interface ElementData {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent?: string;
  businessObject?: BusinessObjectData;
  waypoints?: Point[];
  source?: string;
  target?: string;
  properties?: Record<string, any>;
}

interface BusinessObjectData {
  id: string;
  $type: string;
  name?: string;
  sourceRef?: string;
  targetRef?: string;
  [key: string]: any;
}

interface DocumentMetadata {
  canvasViewbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom?: number;
  scroll?: { x: number; y: number };
  rootElementId?: string;
  collaborators?: CollaboratorInfo[];
}
```

#### **DocumentDiff**

```typescript
interface DocumentDiff {
  id: string;
  timestamp: number;
  clientId: string;
  fromVersion: string;
  toVersion: string;
  added: ElementData[];
  modified: ModifiedElement[];
  removed: string[];
  metadata?: MetadataChanges;
  hasChanges: boolean;
  statistics?: DiffStatistics;
}

interface ModifiedElement {
  id: string;
  element: ElementData;
  changes: ElementChanges;
  changeTypes: Set<ChangeType>;
}

interface ElementChanges {
  position?: PositionChange;
  size?: SizeChange;
  properties?: PropertyChange;
  waypoints?: WaypointChange;
  connections?: ConnectionChange;
}

type ChangeType = 'position' | 'size' | 'properties' | 'waypoints' | 'connections';

interface DiffStatistics {
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  totalChanges: number;
  changesByType: Record<ChangeType, number>;
}
```

#### **SyncResult**

```typescript
interface SyncResult {
  success: boolean;
  syncId: string;
  timestamp: number;
  appliedChanges: {
    added: number;
    modified: number;
    removed: number;
  };
  skippedChanges: {
    count: number;
    reasons: string[];
  };
  errors: SyncError[];
  warnings: SyncWarning[];
  timing: {
    extraction: number;
    calculation: number;
    application: number;
    total: number;
  };
  metadata?: {
    conflictsResolved: number;
    optimizationsApplied: string[];
  };
}

interface SyncError {
  code: string;
  message: string;
  elementId?: string;
  stack?: string;
  recoverable: boolean;
}

interface SyncWarning {
  code: string;
  message: string;
  elementId?: string;
  suggestion?: string;
}
```

## 3. 플러그인 사양

### 3.1 플러그인 인터페이스

```typescript
interface Plugin {
  name: string;
  version: string;
  dependencies?: string[];
  
  initialize(engine: DiffSyncEngine): Promise<void>;
  destroy(): Promise<void>;
  
  // 선택적 메서드
  onConfigUpdate?(config: DiffSyncConfig): void;
  onStateChange?(state: DocumentState): void;
  onBeforeSync?(diff: DocumentDiff): DocumentDiff | Promise<DocumentDiff>;
  onAfterSync?(result: SyncResult): void;
}
```

### 3.2 내장 플러그인

#### **PerformanceMonitor**

```typescript
interface PerformanceMonitorConfig {
  slowSyncThreshold?: number;     // 느린 동기화 임계값 (ms)
  memoryThreshold?: number;       // 메모리 임계값 (MB)
  enableDetailedMetrics?: boolean; // 상세 메트릭 활성화
  reportInterval?: number;        // 리포트 간격 (ms)
}

interface PerformanceMetrics {
  syncCount: number;
  averageSyncTime: number;
  peakSyncTime: number;
  errorRate: number;
  memoryUsage: {
    current: number;
    peak: number;
    growth: number;
  };
  throughput: {
    elementsPerSecond: number;
    diffsPerSecond: number;
  };
  lastSync: number | null;
}
```

#### **ConflictResolver**

```typescript
interface ConflictResolverConfig {
  strategy?: 'timestamp' | 'user-priority' | 'merge' | 'manual';
  userPriorities?: Record<string, number>;
  mergeRules?: MergeRule[];
  timeoutMs?: number;
}

interface ConflictData {
  localDiff: DocumentDiff;
  remoteDiff: DocumentDiff;
  conflictingElements: string[];
  resolutionStrategy: string;
}
```

#### **ValidationPlugin**

```typescript
interface ValidationPluginConfig {
  enableBusinessRules?: boolean;
  enableSchemaValidation?: boolean;
  customValidators?: Validator[];
  strictMode?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

#### **CompressionPlugin**

```typescript
interface CompressionPluginConfig {
  algorithm?: 'gzip' | 'lz4' | 'custom';
  threshold?: number;              // 압축 임계값 (bytes)
  enableForDiffs?: boolean;        // Diff 압축 활성화
  enableForStates?: boolean;       // 상태 압축 활성화
}
```

## 4. 어댑터 사양

### 4.1 Y.js 어댑터

```typescript
interface YjsAdapterConfig {
  documentName?: string;          // Y.js 문서 이름
  mapName?: string;               // Y.Map 이름, 기본값: 'elements'
  enableAwareness?: boolean;      // Awareness 활성화
  awarenessTimeout?: number;      // Awareness 타임아웃 (ms)
  persistenceAdapter?: 'indexeddb' | 'websocket' | 'custom';
}

class YjsAdapter extends BaseAdapter {
  // Y.js 특화 메서드
  getAwarenessStates(): Map<number, any>;
  updateAwareness(state: any): void;
  getConnectedUsers(): string[];
  getDocumentSize(): number;
}
```

### 4.2 WebSocket 어댑터

```typescript
interface WebSocketAdapterConfig {
  url: string;                    // WebSocket URL
  protocols?: string[];          // WebSocket 프로토콜
  reconnectInterval?: number;     // 재연결 간격 (ms)
  maxReconnectAttempts?: number; // 최대 재연결 시도
  heartbeatInterval?: number;    // 하트비트 간격 (ms)
  messageFormat?: 'json' | 'binary';
}

class WebSocketAdapter extends BaseAdapter {
  // WebSocket 특화 메서드
  getConnectionState(): 'connecting' | 'open' | 'closing' | 'closed';
  getLatency(): number;
  reconnect(): Promise<void>;
  ping(): Promise<number>;
}
```

## 5. 오류 처리

### 5.1 오류 코드

```typescript
enum SyncErrorCode {
  // 초기화 오류
  INITIALIZATION_FAILED = 'INIT_001',
  INVALID_CONFIG = 'INIT_002',
  MISSING_DEPENDENCIES = 'INIT_003',
  
  // 상태 추출 오류
  STATE_EXTRACTION_FAILED = 'EXTRACT_001',
  INVALID_MODELER = 'EXTRACT_002',
  EXTRACTION_TIMEOUT = 'EXTRACT_003',
  
  // Diff 계산 오류
  DIFF_CALCULATION_FAILED = 'CALC_001',
  INVALID_STATE_FORMAT = 'CALC_002',
  CALCULATION_TIMEOUT = 'CALC_003',
  
  // Diff 적용 오류
  DIFF_APPLICATION_FAILED = 'APPLY_001',
  ELEMENT_NOT_FOUND = 'APPLY_002',
  INVALID_OPERATION = 'APPLY_003',
  APPLICATION_TIMEOUT = 'APPLY_004',
  
  // 네트워크 오류
  NETWORK_ERROR = 'NET_001',
  CONNECTION_LOST = 'NET_002',
  SYNC_TIMEOUT = 'NET_003',
  
  // 플러그인 오류
  PLUGIN_ERROR = 'PLUGIN_001',
  PLUGIN_NOT_FOUND = 'PLUGIN_002',
  PLUGIN_INITIALIZATION_FAILED = 'PLUGIN_003'
}

interface DetailedSyncError extends Error {
  code: SyncErrorCode;
  elementId?: string;
  context?: any;
  recoverable: boolean;
  timestamp: number;
  stack: string;
}
```

### 5.2 복구 전략

```typescript
interface RecoveryStrategy {
  automatic: boolean;            // 자동 복구 시도
  maxRetries: number;           // 최대 재시도 횟수
  retryDelay: number;           // 재시도 지연 (ms)
  fallbackMode: boolean;        // 폴백 모드 활성화
  rollbackOnFailure: boolean;   // 실패시 롤백
}

interface RecoveryResult {
  recovered: boolean;
  strategy: string;
  attempts: number;
  fallbackActivated: boolean;
  data?: any;
}
```

## 6. 성능 사양

### 6.1 성능 목표

| 메트릭 | 목표값 | 측정 방법 |
|--------|--------|-----------|
| **초기화 시간** | < 100ms | 모듈 로딩부터 사용 준비까지 |
| **상태 추출** | < 50ms | 1000개 요소 기준 |
| **Diff 계산** | < 30ms | 100개 변경사항 기준 |
| **Diff 적용** | < 100ms | 100개 변경사항 기준 |
| **동기화 지연** | < 300ms | 변경 감지부터 원격 반영까지 |
| **메모리 사용량** | < 50MB | 1000개 요소 + 100명 사용자 |
| **CPU 사용률** | < 10% | 유휴 시간 기준 |

### 6.2 확장성 목표

| 시나리오 | 지원 규모 | 성능 요구사항 |
|----------|-----------|---------------|
| **소규모** | 요소 < 100개, 사용자 < 10명 | 지연 < 100ms |
| **중규모** | 요소 < 500개, 사용자 < 50명 | 지연 < 200ms |
| **대규모** | 요소 < 1000개, 사용자 < 100명 | 지연 < 300ms |
| **초대규모** | 요소 < 5000개, 사용자 < 500명 | 지연 < 500ms |

## 7. 보안 고려사항

### 7.1 데이터 보안

- **입력 검증**: 모든 외부 입력에 대한 엄격한 검증
- **XSS 방지**: HTML/JavaScript 인젝션 방지
- **데이터 암호화**: 민감한 데이터 암호화 지원
- **접근 제어**: 권한 기반 접근 제어

### 7.2 네트워크 보안

- **HTTPS 강제**: 프로덕션 환경에서 HTTPS 필수
- **인증 토큰**: JWT 또는 유사한 인증 메커니즘
- **CORS 정책**: 적절한 CORS 설정
- **Rate Limiting**: API 호출 제한

## 8. 브라우저 호환성

### 8.1 지원 브라우저

| 브라우저 | 최소 버전 | 제한사항 |
|----------|-----------|----------|
| Chrome | 90+ | 전체 기능 지원 |
| Firefox | 88+ | 전체 기능 지원 |
| Safari | 14+ | SharedArrayBuffer 제한 |
| Edge | 90+ | 전체 기능 지원 |

### 8.2 폴리필 요구사항

```javascript
// 필요한 폴리필
import 'core-js/stable';
import 'regenerator-runtime/runtime';

// 선택적 폴리필 (IE11 지원시)
import 'whatwg-fetch';
import 'es6-promise/auto';
```

## 9. 테스트 사양

### 9.1 테스트 커버리지 목표

- **단위 테스트**: 95% 이상
- **통합 테스트**: 90% 이상
- **E2E 테스트**: 주요 시나리오 100%

### 9.2 테스트 환경

```yaml
단위 테스트:
  - 프레임워크: Jest
  - 모킹: jest.mock()
  - 커버리지: Istanbul

통합 테스트:
  - 환경: Node.js + JSDOM
  - 라이브러리: @testing-library
  - 시뮬레이션: 모의 Y.js/WebSocket

E2E 테스트:
  - 도구: Playwright
  - 브라우저: Chrome, Firefox, Safari
  - 시나리오: 실제 협업 환경
```

## 10. 배포 및 릴리스

### 10.1 빌드 결과물

```
dist/
├── index.js              # CommonJS 빌드
├── index.esm.js          # ES Module 빌드
├── index.umd.js          # UMD 빌드
├── index.min.js          # 압축된 UMD 빌드
├── types/                # TypeScript 타입 정의
└── docs/                 # 생성된 문서
```

### 10.2 CDN 배포

```html
<!-- 개발용 -->
<script src="https://unpkg.com/@bpmn-collaboration/diff-sync@latest/dist/index.umd.js"></script>

<!-- 프로덕션용 -->
<script src="https://unpkg.com/@bpmn-collaboration/diff-sync@1.0.0/dist/index.min.js"></script>
```

### 10.3 버전 관리

- **Semantic Versioning**: MAJOR.MINOR.PATCH
- **Release Notes**: 각 버전별 변경사항 문서화
- **Breaking Changes**: 하위 호환성 변경사항 명시
- **Migration Guide**: 업그레이드 가이드 제공

이 사양서를 기반으로 모듈을 구현하면, 다양한 프로젝트에서 안정적이고 효율적으로 사용할 수 있는 Diff 기반 동기화 모듈을 제공할 수 있습니다.