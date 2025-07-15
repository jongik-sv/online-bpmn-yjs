# PoC(Proof of Concept) 구현 가이드

## 개요

Diff 기반 동기화 모듈의 기능 검증을 위한 별도 프로젝트 구현 가이드입니다. 기존 코드와 분리된 환경에서 핵심 기능을 검증하고, 향후 실제 서비스에 적용할 수 있는 기반을 마련합니다.

## 1. 프로젝트 구조

### 1.1 PoC 디렉토리 구조

```
bpmn-diff-sync-poc/
├── packages/
│   ├── core/                    # 핵심 모듈
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   │   ├── DiffSyncEngine.js
│   │   │   │   ├── StateManager.js
│   │   │   │   └── EventBus.js
│   │   │   ├── extractors/
│   │   │   │   ├── BpmnStateExtractor.js
│   │   │   │   └── BaseExtractor.js
│   │   │   ├── calculators/
│   │   │   │   ├── StandardDiffCalculator.js
│   │   │   │   └── BaseDiffCalculator.js
│   │   │   ├── applicators/
│   │   │   │   ├── BpmnDiffApplicator.js
│   │   │   │   └── BaseApplicator.js
│   │   │   ├── adapters/
│   │   │   │   ├── YjsAdapter.js
│   │   │   │   └── BaseAdapter.js
│   │   │   ├── plugins/
│   │   │   │   ├── PerformanceMonitor.js
│   │   │   │   └── BasePlugin.js
│   │   │   ├── utils/
│   │   │   │   ├── Logger.js
│   │   │   │   └── Helpers.js
│   │   │   └── index.js
│   │   ├── test/
│   │   ├── types/
│   │   └── package.json
│   └── demo/                    # 데모 애플리케이션
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── utils/
│       │   └── main.js
│       ├── public/
│       ├── test/
│       └── package.json
├── tools/                       # 개발 도구
│   ├── build/
│   ├── test/
│   └── docs/
├── examples/                    # 사용 예제
│   ├── basic-usage/
│   ├── advanced-features/
│   └── integration-examples/
├── docs/                        # 문서
├── .github/
├── package.json                 # 루트 패키지
├── lerna.json                   # Lerna 설정
├── tsconfig.json
├── jest.config.js
└── README.md
```

### 1.2 워크스페이스 설정

```json
// package.json (루트)
{
  "name": "bpmn-diff-sync-poc",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*",
    "examples/*"
  ],
  "scripts": {
    "build": "lerna run build",
    "test": "lerna run test",
    "dev": "lerna run dev --parallel",
    "clean": "lerna clean",
    "bootstrap": "lerna bootstrap",
    "publish": "lerna publish"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@babel/preset-env": "^7.20.0",
    "jest": "^29.0.0",
    "lerna": "^6.0.0",
    "rollup": "^3.0.0",
    "typescript": "^4.9.0"
  }
}
```

## 2. 핵심 모듈 구현

### 2.1 DiffSyncEngine 구현

```javascript
// packages/core/src/engine/DiffSyncEngine.js
import { EventBus } from './EventBus.js';
import { StateManager } from './StateManager.js';
import { Logger } from '../utils/Logger.js';

export class DiffSyncEngine {
  constructor(config = {}) {
    this.config = this._mergeDefaultConfig(config);
    this.logger = new Logger(this.config.logging);
    this.eventBus = new EventBus();
    this.stateManager = new StateManager(this.config.state);
    
    // 상태
    this.isInitialized = false;
    this.isRunning = false;
    this.syncIntervalId = null;
    
    // 컴포넌트 (나중에 팩토리로 생성)
    this.extractor = null;
    this.calculator = null;
    this.applicator = null;
    this.adapter = null;
    
    // 플러그인
    this.plugins = new Map();
    
    this.logger.info('DiffSyncEngine created');
  }
  
  async initialize(context) {
    if (this.isInitialized) {
      throw new Error('Engine already initialized');
    }
    
    this.logger.info('Initializing DiffSyncEngine');
    this.context = context;
    
    try {
      // 컴포넌트 생성
      await this._createComponents();
      
      // 어댑터 초기화
      await this.adapter.initialize(context);
      
      // 상태 매니저 초기화
      await this.stateManager.initialize(context);
      
      // 플러그인 초기화
      await this._initializePlugins();
      
      // 초기 상태 캡처
      await this._captureInitialState();
      
      this.isInitialized = true;
      this.eventBus.emit('initialized', { engine: this });
      
      this.logger.info('DiffSyncEngine initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize engine:', error);
      throw error;
    }
  }
  
  async start() {
    if (!this.isInitialized) {
      throw new Error('Engine not initialized');
    }
    
    if (this.isRunning) {
      this.logger.warn('Engine already running');
      return;
    }
    
    this.logger.info('Starting DiffSyncEngine');
    
    // 원격 변경 리스너 등록
    this.adapter.onRemoteDiff(this._handleRemoteDiff.bind(this));
    
    // 주기적 동기화 시작
    this._startSyncLoop();
    
    this.isRunning = true;
    this.eventBus.emit('started');
    
    this.logger.info('DiffSyncEngine started');
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping DiffSyncEngine');
    
    // 동기화 루프 중단
    this._stopSyncLoop();
    
    this.isRunning = false;
    this.eventBus.emit('stopped');
    
    this.logger.info('DiffSyncEngine stopped');
  }
  
  async sync() {
    if (!this.isInitialized) {
      throw new Error('Engine not initialized');
    }
    
    try {
      const startTime = performance.now();
      
      // 현재 상태 추출
      const currentState = await this.extractor.extract(this.context);
      
      // Diff 계산
      const lastState = this.stateManager.getLastState();
      const diff = await this.calculator.calculate(lastState, currentState);
      
      if (diff.hasChanges) {
        this.logger.debug(`Local changes detected: +${diff.added.length} ~${diff.modified.length} -${diff.removed.length}`);
        
        // 어댑터를 통해 전송
        await this.adapter.sendDiff(diff);
        
        // 상태 업데이트
        await this.stateManager.updateState(currentState);
        
        const timing = performance.now() - startTime;
        this.eventBus.emit('localSync', { diff, timing });
        
        this.logger.debug(`Local sync completed in ${timing.toFixed(2)}ms`);
      }
      
    } catch (error) {
      this.logger.error('Sync failed:', error);
      this.eventBus.emit('syncError', { error, context: 'local_sync' });
      throw error;
    }
  }
  
  async _handleRemoteDiff(diff) {
    try {
      const startTime = performance.now();
      
      this.logger.debug(`Remote changes received: +${diff.added.length} ~${diff.modified.length} -${diff.removed.length}`);
      
      // Diff 적용
      const result = await this.applicator.apply(diff, this.context);
      
      if (result.success) {
        // 새 상태 캡처 및 저장
        const newState = await this.extractor.extract(this.context);
        await this.stateManager.updateState(newState);
        
        const timing = performance.now() - startTime;
        this.eventBus.emit('remoteSync', { diff, result, timing });
        
        this.logger.debug(`Remote sync completed in ${timing.toFixed(2)}ms`);
      } else {
        this.logger.error('Failed to apply remote diff:', result.errors);
        this.eventBus.emit('remoteSyncError', { diff, result });
      }
      
    } catch (error) {
      this.logger.error('Remote diff handling failed:', error);
      this.eventBus.emit('syncError', { error, context: 'remote_diff' });
    }
  }
  
  _startSyncLoop() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    
    this.syncIntervalId = setInterval(async () => {
      try {
        await this.sync();
      } catch (error) {
        // 에러는 이미 로깅됨
      }
    }, this.config.engine.syncInterval);
  }
  
  _stopSyncLoop() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }
  
  async _createComponents() {
    // 팩토리 패턴으로 컴포넌트 생성
    const { createExtractor, createCalculator, createApplicator, createAdapter } = await import('../factories/ComponentFactory.js');
    
    this.extractor = createExtractor(this.config.extractor);
    this.calculator = createCalculator(this.config.calculator);
    this.applicator = createApplicator(this.config.applicator);
    this.adapter = createAdapter(this.config.adapter);
    
    this.logger.debug('Components created');
  }
  
  async _initializePlugins() {
    for (const pluginConfig of this.config.plugins) {
      try {
        const plugin = await this._createPlugin(pluginConfig);
        await plugin.initialize(this);
        this.plugins.set(plugin.name, plugin);
        this.logger.debug(`Plugin initialized: ${plugin.name}`);
      } catch (error) {
        this.logger.error(`Failed to initialize plugin ${pluginConfig.type}:`, error);
      }
    }
  }
  
  async _captureInitialState() {
    try {
      const initialState = await this.extractor.extract(this.context);
      await this.stateManager.updateState(initialState);
      this.logger.info(`Initial state captured: ${Object.keys(initialState.elements).length} elements`);
    } catch (error) {
      this.logger.error('Failed to capture initial state:', error);
      throw error;
    }
  }
  
  _mergeDefaultConfig(userConfig) {
    const defaultConfig = {
      engine: {
        syncInterval: 500,
        maxBatchSize: 100,
        enableOptimization: true
      },
      extractor: {
        type: 'BpmnStateExtractor',
        options: {}
      },
      calculator: {
        type: 'StandardDiffCalculator',
        options: {}
      },
      applicator: {
        type: 'BpmnDiffApplicator',
        options: {}
      },
      adapter: {
        type: 'YjsAdapter',
        options: {}
      },
      plugins: [],
      logging: {
        level: 'info'
      }
    };
    
    return this._deepMerge(defaultConfig, userConfig);
  }
  
  async destroy() {
    this.logger.info('Destroying DiffSyncEngine');
    
    await this.stop();
    
    // 플러그인 정리
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.destroy();
      } catch (error) {
        this.logger.error(`Failed to destroy plugin ${plugin.name}:`, error);
      }
    }
    this.plugins.clear();
    
    // 어댑터 정리
    if (this.adapter) {
      await this.adapter.destroy();
    }
    
    // 이벤트 리스너 정리
    this.eventBus.removeAllListeners();
    
    this.isInitialized = false;
    this.logger.info('DiffSyncEngine destroyed');
  }
}
```

### 2.2 BpmnStateExtractor 구현

```javascript
// packages/core/src/extractors/BpmnStateExtractor.js
import { BaseExtractor } from './BaseExtractor.js';

export class BpmnStateExtractor extends BaseExtractor {
  constructor(config = {}) {
    super(config);
    this.options = {
      includeMetadata: true,
      positionPrecision: 0,
      excludeLabels: true,
      excludeTypes: [],
      customProperties: [],
      ...config.options
    };
  }
  
  async extract(context) {
    const { modeler } = context;
    
    if (!modeler) {
      throw new Error('BPMN modeler is required');
    }
    
    try {
      const elementRegistry = modeler.get('elementRegistry');
      const canvas = modeler.get('canvas');
      
      const elements = elementRegistry.getAll();
      const state = {
        timestamp: Date.now(),
        version: '1.0.0',
        clientId: context.clientId,
        elements: {},
        statistics: {
          elementCount: 0,
          connectionCount: 0
        }
      };
      
      // 메타데이터 추출
      if (this.options.includeMetadata) {
        state.metadata = this._extractMetadata(canvas);
      }
      
      // 요소별 데이터 추출
      elements
        .filter(element => this._shouldIncludeElement(element))
        .forEach(element => {
          const elementData = this._extractElementData(element);
          state.elements[element.id] = elementData;
          
          // 통계 업데이트
          if (this._isConnectionType(element.type)) {
            state.statistics.connectionCount++;
          } else {
            state.statistics.elementCount++;
          }
        });
      
      // 상태 검증
      if (!this.validate(state)) {
        throw new Error('Extracted state is invalid');
      }
      
      return state;
      
    } catch (error) {
      throw new Error(`State extraction failed: ${error.message}`);
    }
  }
  
  _shouldIncludeElement(element) {
    // 라벨 제외
    if (this.options.excludeLabels && element.type === 'label') {
      return false;
    }
    
    // 임시 요소 제외
    if (element.id.startsWith('_tmp_') || element.id === '__implicitroot') {
      return false;
    }
    
    // 제외 타입 체크
    if (this.options.excludeTypes.includes(element.type)) {
      return false;
    }
    
    return true;
  }
  
  _extractElementData(element) {
    const base = {
      id: element.id,
      type: element.type,
      x: this._roundPosition(element.x || 0),
      y: this._roundPosition(element.y || 0),
      width: this._roundPosition(element.width || 0),
      height: this._roundPosition(element.height || 0)
    };
    
    // 부모 관계
    if (element.parent && element.parent.id !== '__implicitroot') {
      base.parent = element.parent.id;
    }
    
    // 비즈니스 객체
    if (element.businessObject) {
      base.businessObject = this._extractBusinessObject(element.businessObject);
    }
    
    // 연결선 데이터
    if (element.waypoints) {
      base.waypoints = element.waypoints.map(wp => ({
        x: this._roundPosition(wp.x),
        y: this._roundPosition(wp.y)
      }));
    }
    
    if (element.source) {
      base.source = element.source.id;
    }
    
    if (element.target) {
      base.target = element.target.id;
    }
    
    // DI 정보
    if (element.di) {
      base.di = {
        id: element.di.id,
        $type: element.di.$type
      };
    }
    
    // 커스텀 속성
    if (this.options.customProperties.length > 0) {
      base.customProperties = this._extractCustomProperties(element);
    }
    
    return base;
  }
  
  _extractBusinessObject(businessObject) {
    const extracted = {
      id: businessObject.id,
      $type: businessObject.$type
    };
    
    // 기본 속성
    if (businessObject.name !== undefined) {
      extracted.name = businessObject.name;
    }
    
    // 참조 속성
    if (businessObject.sourceRef) {
      extracted.sourceRef = businessObject.sourceRef.id || businessObject.sourceRef;
    }
    
    if (businessObject.targetRef) {
      extracted.targetRef = businessObject.targetRef.id || businessObject.targetRef;
    }
    
    // 확장 속성
    const standardProps = new Set([
      'id', '$type', 'name', 'sourceRef', 'targetRef',
      '$parent', 'di', '$attrs', '$model', '$descriptor'
    ]);
    
    Object.keys(businessObject).forEach(key => {
      if (!standardProps.has(key) && 
          !key.startsWith('$') && 
          businessObject[key] !== undefined &&
          businessObject[key] !== null &&
          typeof businessObject[key] !== 'function') {
        extracted[key] = businessObject[key];
      }
    });
    
    return extracted;
  }
  
  _extractMetadata(canvas) {
    return {
      canvasViewbox: canvas.viewbox(),
      zoom: canvas.zoom(),
      rootElementId: canvas.getRootElement().id,
      scroll: canvas.scroll()
    };
  }
  
  _extractCustomProperties(element) {
    const properties = {};
    
    this.options.customProperties.forEach(propName => {
      if (element[propName] !== undefined) {
        properties[propName] = element[propName];
      }
    });
    
    return Object.keys(properties).length > 0 ? properties : undefined;
  }
  
  _roundPosition(value) {
    const precision = this.options.positionPrecision;
    return precision > 0 ? 
      Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision) :
      Math.round(value);
  }
  
  _isConnectionType(type) {
    return ['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association'].includes(type);
  }
}
```

### 2.3 StandardDiffCalculator 구현

```javascript
// packages/core/src/calculators/StandardDiffCalculator.js
import { BaseDiffCalculator } from './BaseDiffCalculator.js';

export class StandardDiffCalculator extends BaseDiffCalculator {
  constructor(config = {}) {
    super(config);
    this.options = {
      positionTolerance: 0.5,
      enableOptimization: true,
      ignoreMinorChanges: true,
      batchThreshold: 10,
      ...config.options
    };
  }
  
  async calculate(oldState, newState) {
    const startTime = performance.now();
    
    try {
      const diff = {
        id: this._generateDiffId(),
        timestamp: Date.now(),
        clientId: newState.clientId,
        fromVersion: oldState?.version || '0.0.0',
        toVersion: newState.version,
        added: [],
        modified: [],
        removed: [],
        hasChanges: false,
        statistics: {
          addedCount: 0,
          modifiedCount: 0,
          removedCount: 0,
          totalChanges: 0
        }
      };
      
      if (!oldState) {
        // 초기 상태 - 모든 요소가 새로 추가됨
        diff.added = Object.values(newState.elements);
        diff.hasChanges = diff.added.length > 0;
        diff.statistics.addedCount = diff.added.length;
        diff.statistics.totalChanges = diff.added.length;
        
        // 의존성 순서로 정렬
        diff.added = this._sortByDependency(diff.added);
        
        return diff;
      }
      
      const oldElements = oldState.elements || {};
      const newElements = newState.elements || {};
      
      // 변경사항 감지
      this._detectAddedElements(oldElements, newElements, diff);
      this._detectModifiedElements(oldElements, newElements, diff);
      this._detectRemovedElements(oldElements, newElements, diff);
      
      // 메타데이터 변경 감지
      if (oldState.metadata && newState.metadata) {
        diff.metadata = this._compareMetadata(oldState.metadata, newState.metadata);
      }
      
      // 통계 업데이트
      diff.statistics.addedCount = diff.added.length;
      diff.statistics.modifiedCount = diff.modified.length;
      diff.statistics.removedCount = diff.removed.length;
      diff.statistics.totalChanges = diff.added.length + diff.modified.length + diff.removed.length;
      
      // 최적화 적용
      if (this.options.enableOptimization) {
        this._optimizeDiff(diff);
      }
      
      const calculationTime = performance.now() - startTime;
      diff.timing = { calculation: calculationTime };
      
      return diff;
      
    } catch (error) {
      throw new Error(`Diff calculation failed: ${error.message}`);
    }
  }
  
  _detectAddedElements(oldElements, newElements, diff) {
    Object.keys(newElements).forEach(id => {
      if (!oldElements[id]) {
        diff.added.push(newElements[id]);
        diff.hasChanges = true;
      }
    });
    
    // 의존성 순서로 정렬
    diff.added = this._sortByDependency(diff.added);
  }
  
  _detectModifiedElements(oldElements, newElements, diff) {
    Object.keys(newElements).forEach(id => {
      if (oldElements[id]) {
        const changes = this._calculateElementChanges(oldElements[id], newElements[id]);
        
        if (changes.hasChanges) {
          // 미세 변경 무시 옵션 체크
          if (this.options.ignoreMinorChanges && this._isMinorChange(changes)) {
            return;
          }
          
          diff.modified.push({
            id: id,
            element: newElements[id],
            changes: changes.changes,
            changeTypes: Array.from(changes.types)
          });
          diff.hasChanges = true;
        }
      }
    });
  }
  
  _detectRemovedElements(oldElements, newElements, diff) {
    Object.keys(oldElements).forEach(id => {
      if (!newElements[id]) {
        diff.removed.push(id);
        diff.hasChanges = true;
      }
    });
  }
  
  _calculateElementChanges(oldElement, newElement) {
    const changes = {
      hasChanges: false,
      changes: {},
      types: new Set()
    };
    
    // 위치 변경
    this._detectPositionChanges(oldElement, newElement, changes);
    
    // 크기 변경
    this._detectSizeChanges(oldElement, newElement, changes);
    
    // Waypoints 변경
    this._detectWaypointChanges(oldElement, newElement, changes);
    
    // 비즈니스 객체 변경
    this._detectBusinessObjectChanges(oldElement, newElement, changes);
    
    // 연결 관계 변경
    this._detectConnectionChanges(oldElement, newElement, changes);
    
    return changes;
  }
  
  _detectPositionChanges(oldElement, newElement, changes) {
    const tolerance = this.options.positionTolerance;
    const oldX = oldElement.x || 0;
    const oldY = oldElement.y || 0;
    const newX = newElement.x || 0;
    const newY = newElement.y || 0;
    
    if (Math.abs(oldX - newX) > tolerance || Math.abs(oldY - newY) > tolerance) {
      changes.changes.position = {
        old: { x: oldX, y: oldY },
        new: { x: newX, y: newY }
      };
      changes.hasChanges = true;
      changes.types.add('position');
    }
  }
  
  _detectSizeChanges(oldElement, newElement, changes) {
    const oldWidth = oldElement.width || 0;
    const oldHeight = oldElement.height || 0;
    const newWidth = newElement.width || 0;
    const newHeight = newElement.height || 0;
    
    if (oldWidth !== newWidth || oldHeight !== newHeight) {
      changes.changes.size = {
        old: { width: oldWidth, height: oldHeight },
        new: { width: newWidth, height: newHeight }
      };
      changes.hasChanges = true;
      changes.types.add('size');
    }
  }
  
  _detectWaypointChanges(oldElement, newElement, changes) {
    if (!this._areWaypointsEqual(oldElement.waypoints, newElement.waypoints)) {
      changes.changes.waypoints = {
        old: oldElement.waypoints || [],
        new: newElement.waypoints || []
      };
      changes.hasChanges = true;
      changes.types.add('waypoints');
    }
  }
  
  _detectBusinessObjectChanges(oldElement, newElement, changes) {
    if (!this._areObjectsEqual(oldElement.businessObject, newElement.businessObject)) {
      changes.changes.businessObject = {
        old: oldElement.businessObject,
        new: newElement.businessObject
      };
      changes.hasChanges = true;
      changes.types.add('properties');
    }
  }
  
  _detectConnectionChanges(oldElement, newElement, changes) {
    const oldSource = oldElement.source;
    const oldTarget = oldElement.target;
    const newSource = newElement.source;
    const newTarget = newElement.target;
    
    if (oldSource !== newSource || oldTarget !== newTarget) {
      changes.changes.connection = {
        old: { source: oldSource, target: oldTarget },
        new: { source: newSource, target: newTarget }
      };
      changes.hasChanges = true;
      changes.types.add('connection');
    }
  }
  
  _areWaypointsEqual(waypoints1, waypoints2) {
    if (!waypoints1 && !waypoints2) return true;
    if (!waypoints1 || !waypoints2) return false;
    if (waypoints1.length !== waypoints2.length) return false;
    
    const tolerance = this.options.positionTolerance;
    return waypoints1.every((wp1, index) => {
      const wp2 = waypoints2[index];
      return Math.abs(wp1.x - wp2.x) <= tolerance && 
             Math.abs(wp1.y - wp2.y) <= tolerance;
    });
  }
  
  _areObjectsEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (!obj1 || !obj2) return false;
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    return keys1.every(key => {
      const val1 = obj1[key];
      const val2 = obj2[key];
      
      if (typeof val1 === 'object' && typeof val2 === 'object') {
        return this._areObjectsEqual(val1, val2);
      }
      
      return val1 === val2;
    });
  }
  
  _sortByDependency(elements) {
    // 의존성 순서: 부모 → 자식, 도형 → 연결선
    return elements.sort((a, b) => {
      // 부모-자식 관계
      if (a.parent === b.id) return 1;  // b가 a의 부모
      if (b.parent === a.id) return -1; // a가 b의 부모
      
      // 도형-연결선 관계
      const aIsConnection = this._isConnectionType(a.type);
      const bIsConnection = this._isConnectionType(b.type);
      
      if (!aIsConnection && bIsConnection) return -1; // 도형 우선
      if (aIsConnection && !bIsConnection) return 1;  // 연결선 나중
      
      return 0;
    });
  }
  
  _isConnectionType(type) {
    return ['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association'].includes(type);
  }
  
  _isMinorChange(changes) {
    // 위치 변경이 허용 오차 이내인 경우 미세 변경으로 간주
    if (changes.types.has('position')) {
      const posChange = changes.changes.position;
      const deltaX = Math.abs(posChange.new.x - posChange.old.x);
      const deltaY = Math.abs(posChange.new.y - posChange.old.y);
      
      if (deltaX <= this.options.positionTolerance && deltaY <= this.options.positionTolerance) {
        return true;
      }
    }
    
    return false;
  }
  
  _optimizeDiff(diff) {
    // 중복 제거
    diff.added = this._removeDuplicateElements(diff.added);
    diff.modified = this._removeDuplicateModifications(diff.modified);
    diff.removed = [...new Set(diff.removed)];
    
    // 배치 크기 제한
    if (diff.statistics.totalChanges > this.options.batchThreshold) {
      // 큰 변경사항은 우선순위에 따라 배치 분할 가능
      // 현재는 경고만 출력
      console.warn(`Large diff detected: ${diff.statistics.totalChanges} changes`);
    }
  }
  
  _removeDuplicateElements(elements) {
    const seen = new Set();
    return elements.filter(element => {
      if (seen.has(element.id)) {
        return false;
      }
      seen.add(element.id);
      return true;
    });
  }
  
  _removeDuplicateModifications(modifications) {
    const seen = new Set();
    return modifications.filter(mod => {
      if (seen.has(mod.id)) {
        return false;
      }
      seen.add(mod.id);
      return true;
    });
  }
  
  _compareMetadata(oldMetadata, newMetadata) {
    const changes = {};
    let hasChanges = false;
    
    // 뷰포트 변경
    if (!this._areObjectsEqual(oldMetadata.canvasViewbox, newMetadata.canvasViewbox)) {
      changes.viewport = {
        old: oldMetadata.canvasViewbox,
        new: newMetadata.canvasViewbox
      };
      hasChanges = true;
    }
    
    // 줌 변경
    if (oldMetadata.zoom !== newMetadata.zoom) {
      changes.zoom = {
        old: oldMetadata.zoom,
        new: newMetadata.zoom
      };
      hasChanges = true;
    }
    
    return hasChanges ? changes : null;
  }
  
  _generateDiffId() {
    return 'diff-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}
```

## 3. 데모 애플리케이션

### 3.1 데모 애플리케이션 구조

```javascript
// packages/demo/src/main.js
import BpmnModeler from 'bpmn-js/lib/Modeler';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { BpmnDiffSync } from '@bpmn-collaboration/diff-sync-core';

class DiffSyncDemo {
  constructor() {
    this.modeler = null;
    this.yjsDoc = null;
    this.wsProvider = null;
    this.diffSync = null;
    
    this.init();
  }
  
  async init() {
    try {
      // UI 초기화
      this.initUI();
      
      // BPMN.js 모델러 초기화
      await this.initModeler();
      
      // Y.js 문서 및 WebSocket 프로바이더 초기화
      this.initCollaboration();
      
      // Diff 동기화 모듈 초기화
      await this.initDiffSync();
      
      // 이벤트 리스너 설정
      this.setupEventListeners();
      
      console.log('Demo initialized successfully');
      
    } catch (error) {
      console.error('Demo initialization failed:', error);
      this.showError('초기화 실패: ' + error.message);
    }
  }
  
  initUI() {
    document.body.innerHTML = `
      <div id="demo-container">
        <header>
          <h1>BPMN Diff Sync Demo</h1>
          <div id="status" class="status">연결 중...</div>
          <div id="controls">
            <button id="clear-diagram">다이어그램 초기화</button>
            <button id="sync-now">즉시 동기화</button>
            <button id="show-metrics">성능 메트릭</button>
          </div>
        </header>
        
        <main>
          <div id="canvas-container">
            <div id="canvas"></div>
          </div>
          
          <aside id="sidebar">
            <div id="sync-info">
              <h3>동기화 정보</h3>
              <div id="sync-stats"></div>
            </div>
            
            <div id="event-log">
              <h3>이벤트 로그</h3>
              <div id="log-entries"></div>
            </div>
          </aside>
        </main>
      </div>
    `;
    
    // CSS 스타일 추가
    this.addStyles();
  }
  
  async initModeler() {
    this.modeler = new BpmnModeler({
      container: '#canvas',
      keyboard: {
        bindTo: window
      }
    });
    
    // 기본 다이어그램 로드
    const defaultDiagram = `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                        xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                        xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
                        id="Definitions_1" 
                        targetNamespace="http://bpmn.io/schema/bpmn">
        <bpmn:process id="Process_1" isExecutable="true">
          <bpmn:startEvent id="StartEvent_1"/>
        </bpmn:process>
        <bpmndi:BPMNDiagram id="BPMNDiagram_1">
          <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
            <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
              <dc:Bounds x="179" y="99" width="36" height="36"/>
            </bpmndi:BPMNShape>
          </bpmndi:BPMNPlane>
        </bpmndi:BPMNDiagram>
      </bpmn:definitions>`;
    
    await this.modeler.importXML(defaultDiagram);
  }
  
  initCollaboration() {
    // Y.js 문서 생성
    this.yjsDoc = new Y.Doc();
    
    // WebSocket 프로바이더 (로컬 서버 가정)
    this.wsProvider = new WebsocketProvider(
      'ws://localhost:1234', 
      'bpmn-demo-room',
      this.yjsDoc
    );
    
    // 연결 상태 모니터링
    this.wsProvider.on('status', (event) => {
      const statusEl = document.getElementById('status');
      statusEl.textContent = event.status === 'connected' ? '연결됨' : '연결 끊김';
      statusEl.className = 'status ' + event.status;
    });
  }
  
  async initDiffSync() {
    // Diff 동기화 모듈 생성
    this.diffSync = new BpmnDiffSync({
      engine: {
        syncInterval: 1000, // 1초 간격
        enableOptimization: true
      },
      calculator: {
        options: {
          positionTolerance: 1.0,
          ignoreMinorChanges: true
        }
      },
      plugins: [
        {
          type: 'PerformanceMonitor',
          options: {
            slowSyncThreshold: 100
          }
        }
      ],
      logging: {
        level: 'debug'
      }
    });
    
    // 초기화
    await this.diffSync.initialize(this.modeler, this.yjsDoc, {
      clientId: 'demo-client-' + Math.random().toString(36).substr(2, 6)
    });
    
    // 시작
    await this.diffSync.start();
  }
  
  setupEventListeners() {
    // Diff 동기화 이벤트
    this.diffSync.on('localSync', (data) => {
      this.logEvent('로컬 동기화', `+${data.diff.added.length} ~${data.diff.modified.length} -${data.diff.removed.length}`);
      this.updateSyncStats();
    });
    
    this.diffSync.on('remoteSync', (data) => {
      this.logEvent('원격 동기화', `+${data.diff.added.length} ~${data.diff.modified.length} -${data.diff.removed.length}`);
      this.updateSyncStats();
    });
    
    this.diffSync.on('syncError', (data) => {
      this.logEvent('동기화 오류', data.error.message, 'error');
    });
    
    // UI 컨트롤
    document.getElementById('clear-diagram').onclick = () => this.clearDiagram();
    document.getElementById('sync-now').onclick = () => this.syncNow();
    document.getElementById('show-metrics').onclick = () => this.showMetrics();
  }
  
  async clearDiagram() {
    try {
      const defaultDiagram = `<?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                          xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                          xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
                          id="Definitions_1" 
                          targetNamespace="http://bpmn.io/schema/bpmn">
          <bpmn:process id="Process_1" isExecutable="true"/>
          <bpmndi:BPMNDiagram id="BPMNDiagram_1">
            <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1"/>
          </bpmndi:BPMNDiagram>
        </bpmn:definitions>`;
      
      await this.modeler.importXML(defaultDiagram);
      this.logEvent('다이어그램 초기화', '성공');
    } catch (error) {
      this.logEvent('다이어그램 초기화', '실패: ' + error.message, 'error');
    }
  }
  
  async syncNow() {
    try {
      await this.diffSync.sync();
      this.logEvent('수동 동기화', '완료');
    } catch (error) {
      this.logEvent('수동 동기화', '실패: ' + error.message, 'error');
    }
  }
  
  showMetrics() {
    const metrics = this.diffSync.getMetrics();
    
    const metricsWindow = window.open('', 'metrics', 'width=600,height=400');
    metricsWindow.document.write(`
      <html>
        <head><title>성능 메트릭</title></head>
        <body>
          <h1>성능 메트릭</h1>
          <pre>${JSON.stringify(metrics, null, 2)}</pre>
        </body>
      </html>
    `);
  }
  
  logEvent(type, message, level = 'info') {
    const logContainer = document.getElementById('log-entries');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${level}`;
    logEntry.innerHTML = `
      <span class="timestamp">${timestamp}</span>
      <span class="type">${type}</span>
      <span class="message">${message}</span>
    `;
    
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // 최대 50개 항목 유지
    while (logContainer.children.length > 50) {
      logContainer.removeChild(logContainer.lastChild);
    }
  }
  
  updateSyncStats() {
    const statsContainer = document.getElementById('sync-stats');
    const metrics = this.diffSync.getMetrics();
    
    statsContainer.innerHTML = `
      <div>동기화 횟수: ${metrics.sync.cycles}</div>
      <div>평균 시간: ${metrics.sync.averageTime.toFixed(2)}ms</div>
      <div>마지막 동기화: ${new Date(metrics.sync.lastSyncTime).toLocaleTimeString()}</div>
      <div>에러율: ${(metrics.applicator.errorRate * 100).toFixed(1)}%</div>
    `;
  }
  
  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f5f5f5;
      }
      
      #demo-container {
        height: 100vh;
        display: flex;
        flex-direction: column;
      }
      
      header {
        background: white;
        padding: 1rem;
        border-bottom: 1px solid #ddd;
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      
      h1 { color: #333; }
      
      .status {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 500;
      }
      
      .status.connected { background: #d4edda; color: #155724; }
      .status.disconnected { background: #f8d7da; color: #721c24; }
      
      #controls {
        margin-left: auto;
        display: flex;
        gap: 0.5rem;
      }
      
      button {
        padding: 0.5rem 1rem;
        border: 1px solid #007bff;
        background: white;
        color: #007bff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.875rem;
      }
      
      button:hover {
        background: #007bff;
        color: white;
      }
      
      main {
        flex: 1;
        display: flex;
        overflow: hidden;
      }
      
      #canvas-container {
        flex: 1;
        background: white;
        border-right: 1px solid #ddd;
      }
      
      #canvas {
        width: 100%;
        height: 100%;
      }
      
      #sidebar {
        width: 300px;
        background: white;
        padding: 1rem;
        overflow-y: auto;
      }
      
      #sidebar h3 {
        margin-bottom: 0.5rem;
        color: #333;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.25rem;
      }
      
      #sync-stats div {
        padding: 0.25rem 0;
        font-size: 0.875rem;
      }
      
      #event-log {
        margin-top: 1rem;
      }
      
      .log-entry {
        padding: 0.5rem;
        margin-bottom: 0.25rem;
        border-radius: 4px;
        font-size: 0.75rem;
        display: flex;
        gap: 0.5rem;
      }
      
      .log-info { background: #e3f2fd; }
      .log-error { background: #ffebee; color: #c62828; }
      
      .timestamp { color: #666; }
      .type { font-weight: 500; }
      .message { flex: 1; }
    `;
    document.head.appendChild(style);
  }
  
  showError(message) {
    alert(message);
  }
}

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', () => {
  new DiffSyncDemo();
});
```

## 4. 개발 환경 설정

### 4.1 개발 도구 설정

```javascript
// tools/dev-server.js
const express = require('express');
const { createServer } = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');
const WebSocket = require('ws');
const path = require('path');

class DevServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.setupStaticFiles();
    this.setupWebSocket();
  }
  
  setupStaticFiles() {
    // 정적 파일 서빙
    this.app.use('/demo', express.static(path.join(__dirname, '../packages/demo/dist')));
    this.app.use('/core', express.static(path.join(__dirname, '../packages/core/dist')));
    
    // 루트 경로에서 데모 페이지로 리다이렉트
    this.app.get('/', (req, res) => {
      res.redirect('/demo');
    });
  }
  
  setupWebSocket() {
    const wss = new WebSocket.Server({ server: this.server });
    
    wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection');
      setupWSConnection(ws, req);
    });
  }
  
  start(port = 3000) {
    this.server.listen(port, () => {
      console.log(`Development server running on http://localhost:${port}`);
      console.log(`WebSocket server running on ws://localhost:1234`);
    });
  }
}

// 개발 서버 시작
if (require.main === module) {
  const server = new DevServer();
  server.start();
}

module.exports = DevServer;
```

### 4.2 빌드 설정

```javascript
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

export default [
  // ES Module 빌드
  {
    input: 'packages/core/src/index.js',
    output: {
      file: 'packages/core/dist/index.esm.js',
      format: 'es'
    },
    external: ['bpmn-js', 'yjs', 'eventemitter3', 'lodash'],
    plugins: [
      resolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**'
      }),
      isProduction && terser()
    ].filter(Boolean)
  },
  
  // CommonJS 빌드
  {
    input: 'packages/core/src/index.js',
    output: {
      file: 'packages/core/dist/index.cjs.js',
      format: 'cjs'
    },
    external: ['bpmn-js', 'yjs', 'eventemitter3', 'lodash'],
    plugins: [
      resolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**'
      }),
      isProduction && terser()
    ].filter(Boolean)
  },
  
  // UMD 빌드 (브라우저용)
  {
    input: 'packages/core/src/index.js',
    output: {
      file: 'packages/core/dist/index.umd.js',
      format: 'umd',
      name: 'BpmnDiffSync',
      globals: {
        'bpmn-js': 'BpmnJS',
        'yjs': 'Y',
        'eventemitter3': 'EventEmitter',
        'lodash': '_'
      }
    },
    external: ['bpmn-js', 'yjs', 'eventemitter3', 'lodash'],
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**'
      }),
      isProduction && terser()
    ].filter(Boolean)
  }
];
```

## 5. 테스트 환경

### 5.1 테스트 설정

```javascript
// jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'core',
      testMatch: ['<rootDir>/packages/core/test/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tools/test/setup.js']
    },
    {
      displayName: 'demo',
      testMatch: ['<rootDir>/packages/demo/test/**/*.test.js'],
      testEnvironment: 'jsdom'
    }
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.js',
    '!packages/*/src/**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000
};
```

### 5.2 통합 테스트

```javascript
// packages/core/test/integration/DiffSync.integration.test.js
import { DiffSyncEngine } from '../../src/engine/DiffSyncEngine.js';
import { MockModeler } from '../mocks/MockModeler.js';
import { MockYjsDoc } from '../mocks/MockYjsDoc.js';

describe('DiffSync Integration Tests', () => {
  let engine1, engine2;
  let modeler1, modeler2;
  let yjsDoc1, yjsDoc2;
  
  beforeEach(async () => {
    // 두 개의 모델러와 Y.js 문서 생성 (네트워크로 연결)
    [modeler1, modeler2] = await createConnectedModelers();
    [yjsDoc1, yjsDoc2] = await createConnectedYjsDocs();
    
    // 두 개의 동기화 엔진 생성
    engine1 = new DiffSyncEngine({
      engine: { syncInterval: 100 }
    });
    
    engine2 = new DiffSyncEngine({
      engine: { syncInterval: 100 }
    });
    
    // 초기화
    await engine1.initialize({ modeler: modeler1, yjsDoc: yjsDoc1, clientId: 'client1' });
    await engine2.initialize({ modeler: modeler2, yjsDoc: yjsDoc2, clientId: 'client2' });
    
    // 시작
    await engine1.start();
    await engine2.start();
  });
  
  afterEach(async () => {
    await engine1.destroy();
    await engine2.destroy();
  });
  
  test('should synchronize shape creation between engines', async () => {
    // Engine1에서 요소 생성
    const modeling1 = modeler1.get('modeling');
    const elementFactory1 = modeler1.get('elementFactory');
    
    const shape = elementFactory1.createShape({
      type: 'bpmn:Task',
      x: 100, y: 100, width: 100, height: 80
    });
    
    modeling1.createShape(shape, { x: 100, y: 100 }, modeler1.get('canvas').getRootElement());
    
    // 동기화 대기
    await waitForSync();
    
    // Engine2에서 확인
    const elements2 = modeler2.get('elementRegistry').getAll();
    const syncedShape = elements2.find(el => el.type === 'bpmn:Task');
    
    expect(syncedShape).toBeDefined();
    expect(syncedShape.x).toBe(100);
    expect(syncedShape.y).toBe(100);
  });
  
  test('should handle concurrent modifications', async () => {
    // 동시에 다른 요소 생성
    const modeling1 = modeler1.get('modeling');
    const modeling2 = modeler2.get('modeling');
    
    // 동시 실행
    const [result1, result2] = await Promise.all([
      createTaskAt(modeling1, 100, 100),
      createTaskAt(modeling2, 200, 200)
    ]);
    
    // 동기화 완료 대기
    await waitForSync();
    
    // 양쪽 모델러에서 두 요소 모두 확인
    const elements1 = modeler1.get('elementRegistry').getAll().filter(el => el.type === 'bpmn:Task');
    const elements2 = modeler2.get('elementRegistry').getAll().filter(el => el.type === 'bpmn:Task');
    
    expect(elements1).toHaveLength(2);
    expect(elements2).toHaveLength(2);
    
    // 위치 확인
    const positions1 = elements1.map(el => ({ x: el.x, y: el.y }));
    const positions2 = elements2.map(el => ({ x: el.x, y: el.y }));
    
    expect(positions1).toEqual(expect.arrayContaining([
      { x: 100, y: 100 },
      { x: 200, y: 200 }
    ]));
    expect(positions2).toEqual(positions1);
  });
});

async function waitForSync(timeoutMs = 2000) {
  return new Promise(resolve => setTimeout(resolve, timeoutMs));
}

async function createTaskAt(modeling, x, y) {
  const elementFactory = modeling._elementFactory;
  const canvas = modeling._canvas;
  
  const shape = elementFactory.createShape({
    type: 'bpmn:Task',
    x, y, width: 100, height: 80
  });
  
  return modeling.createShape(shape, { x, y }, canvas.getRootElement());
}
```

## 6. 빌드 및 배포

### 6.1 빌드 스크립트

```json
// packages/core/package.json
{
  "name": "@bpmn-collaboration/diff-sync-core",
  "version": "1.0.0-alpha.1",
  "main": "dist/index.cjs.js",
  "module": "dist/index.esm.js",
  "browser": "dist/index.umd.js",
  "types": "types/index.d.ts",
  "scripts": {
    "build": "rollup -c ../../rollup.config.js",
    "build:watch": "rollup -c ../../rollup.config.js --watch",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "type-check": "tsc --noEmit",
    "clean": "rimraf dist"
  },
  "files": [
    "dist/",
    "types/",
    "README.md"
  ]
}
```

### 6.2 GitHub Actions 워크플로우

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run type checking
      run: npm run type-check
    
    - name: Run tests
      run: npm test
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info

  build:
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js 18.x
      uses: actions/setup-node@v3
      with:
        node-version: 18.x
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build packages
      run: npm run build
    
    - name: Upload build artifacts
      uses: actions/upload-artifact@v3
      with:
        name: build-artifacts
        path: packages/*/dist/
```

## 7. 실행 가이드

### 7.1 개발 환경 실행

```bash
# 프로젝트 클론 및 초기화
git clone <repository-url> bpmn-diff-sync-poc
cd bpmn-diff-sync-poc

# 의존성 설치
npm install

# 패키지 링크
npm run bootstrap

# 개발 모드로 실행
npm run dev

# 별도 터미널에서 Y.js WebSocket 서버 실행
npx y-websocket-server --port 1234
```

### 7.2 빌드 및 테스트

```bash
# 전체 빌드
npm run build

# 테스트 실행
npm test

# 커버리지 포함 테스트
npm run test:coverage

# 타입 체크
npm run type-check
```

### 7.3 데모 실행

```bash
# 개발 서버 시작
npm run dev:demo

# 브라우저에서 http://localhost:3000 접속
# 여러 탭을 열어서 실시간 협업 테스트
```

이 PoC 구현을 통해 Diff 기반 동기화의 핵심 기능을 검증하고, 실제 서비스 적용을 위한 기반을 마련할 수 있습니다.