# 모듈 통합 가이드

## 개요

Diff 기반 동기화 모듈을 기존 BPMN.js 프로젝트에 통합하기 위한 상세 가이드입니다. NPM 패키지로 배포된 모듈을 다양한 환경에서 안전하고 효율적으로 적용하는 방법을 제시합니다.

## 1. 설치 및 기본 설정

### 1.1 NPM 패키지 설치

```bash
# 메인 모듈 설치
npm install @bpmn-collaboration/diff-sync

# 피어 의존성 설치 (프로젝트에 없는 경우)
npm install bpmn-js@^11.0.0 yjs@^13.0.0

# 선택적 의존성 (WebSocket 지원)
npm install y-websocket@^1.4.5

# TypeScript 사용시
npm install --save-dev @types/bpmn-js
```

### 1.2 기본 통합 예제

```javascript
// ES6 모듈 환경
import BpmnModeler from 'bpmn-js/lib/Modeler';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { BpmnDiffSync } from '@bpmn-collaboration/diff-sync';

class BpmnCollaborationApp {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = this._mergeOptions(options);
    
    this.modeler = null;
    this.yjsDoc = null;
    this.wsProvider = null;
    this.diffSync = null;
    
    this.isInitialized = false;
  }
  
  async initialize() {
    try {
      // BPMN.js 모델러 초기화
      await this._initializeModeler();
      
      // Y.js 문서 및 WebSocket 프로바이더 초기화
      this._initializeCollaboration();
      
      // Diff 동기화 모듈 초기화
      await this._initializeDiffSync();
      
      // 이벤트 리스너 설정
      this._setupEventListeners();
      
      this.isInitialized = true;
      this._emit('initialized');
      
    } catch (error) {
      this._emit('error', { type: 'initialization', error });
      throw error;
    }
  }
  
  async _initializeModeler() {
    this.modeler = new BpmnModeler({
      container: this.containerId,
      keyboard: this.options.keyboard,
      ...this.options.modeler
    });
    
    // 기본 다이어그램 로드 (옵션)
    if (this.options.defaultDiagram) {
      await this.modeler.importXML(this.options.defaultDiagram);
    }
  }
  
  _initializeCollaboration() {
    // Y.js 문서 생성
    this.yjsDoc = new Y.Doc();
    
    // WebSocket 프로바이더 설정
    if (this.options.websocket) {
      this.wsProvider = new WebsocketProvider(
        this.options.websocket.url,
        this.options.websocket.room,
        this.yjsDoc,
        this.options.websocket.options
      );
    }
  }
  
  async _initializeDiffSync() {
    this.diffSync = new BpmnDiffSync(this.options.diffSync);
    
    await this.diffSync.initialize(this.modeler, this.yjsDoc, {
      clientId: this.options.clientId || this._generateClientId()
    });
    
    await this.diffSync.start();
  }
  
  _setupEventListeners() {
    // Diff 동기화 이벤트
    this.diffSync.on('localSync', (data) => {
      this._emit('sync', { type: 'local', ...data });
    });
    
    this.diffSync.on('remoteSync', (data) => {
      this._emit('sync', { type: 'remote', ...data });
    });
    
    this.diffSync.on('syncError', (data) => {
      this._emit('error', { type: 'sync', ...data });
    });
    
    // WebSocket 연결 상태
    if (this.wsProvider) {
      this.wsProvider.on('status', (event) => {
        this._emit('connectionStatus', event);
      });
    }
  }
  
  // Public API
  async loadDiagram(xml) {
    await this.modeler.importXML(xml);
    this._emit('diagramLoaded');
  }
  
  async saveDiagram() {
    const { xml } = await this.modeler.saveXML({ format: true });
    return xml;
  }
  
  createSnapshot() {
    return this.diffSync.createSnapshot();
  }
  
  getMetrics() {
    return this.diffSync.getMetrics();
  }
  
  async destroy() {
    if (this.diffSync) {
      await this.diffSync.destroy();
    }
    
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
    
    if (this.modeler) {
      this.modeler.destroy();
    }
    
    this.isInitialized = false;
    this._emit('destroyed');
  }
  
  _mergeOptions(userOptions) {
    return {
      // 기본 설정
      clientId: null,
      keyboard: { bindTo: window },
      
      // BPMN.js 모델러 설정
      modeler: {},
      
      // WebSocket 설정
      websocket: {
        url: 'ws://localhost:1234',
        room: 'bpmn-collaboration',
        options: {}
      },
      
      // Diff 동기화 설정
      diffSync: {
        engine: {
          syncInterval: 500,
          enableOptimization: true
        },
        calculator: {
          options: {
            positionTolerance: 1.0,
            ignoreMinorChanges: true
          }
        },
        plugins: [
          { type: 'PerformanceMonitor', options: {} }
        ]
      },
      
      // 기본 다이어그램
      defaultDiagram: null,
      
      // 사용자 옵션으로 덮어쓰기
      ...userOptions
    };
  }
  
  _generateClientId() {
    return 'client-' + Math.random().toString(36).substr(2, 9);
  }
  
  _emit(event, data) {
    // 이벤트 시스템 구현 (EventEmitter 또는 커스텀)
    if (this.options.onEvent) {
      this.options.onEvent(event, data);
    }
  }
}

// 사용 예제
const app = new BpmnCollaborationApp('#canvas', {
  websocket: {
    url: 'wss://your-server.com/collaboration',
    room: 'project-123'
  },
  diffSync: {
    engine: {
      syncInterval: 300
    }
  },
  onEvent: (event, data) => {
    console.log('App event:', event, data);
  }
});

await app.initialize();
```

## 2. 프레임워크별 통합 가이드

### 2.1 React 통합

```jsx
// React Hook 구현
import { useEffect, useRef, useState, useCallback } from 'react';
import { BpmnDiffSync } from '@bpmn-collaboration/diff-sync';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export function useBpmnCollaboration(options = {}) {
  const containerRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [syncStats, setSyncStats] = useState({ local: 0, remote: 0 });
  const [error, setError] = useState(null);
  
  const modelerRef = useRef(null);
  const diffSyncRef = useRef(null);
  const wsProviderRef = useRef(null);
  
  const initialize = useCallback(async () => {
    if (!containerRef.current || isInitialized) return;
    
    try {
      setError(null);
      
      // BPMN.js 모델러 초기화
      modelerRef.current = new BpmnModeler({
        container: containerRef.current,
        keyboard: { bindTo: window },
        ...options.modeler
      });
      
      // Y.js 및 WebSocket 설정
      const yjsDoc = new Y.Doc();
      
      if (options.websocket) {
        wsProviderRef.current = new WebsocketProvider(
          options.websocket.url,
          options.websocket.room,
          yjsDoc
        );
        
        wsProviderRef.current.on('status', (event) => {
          setConnectionStatus(event.status);
        });
      }
      
      // Diff 동기화 초기화
      diffSyncRef.current = new BpmnDiffSync(options.diffSync);
      
      await diffSyncRef.current.initialize(modelerRef.current, yjsDoc);
      await diffSyncRef.current.start();
      
      // 이벤트 리스너
      diffSyncRef.current.on('localSync', (data) => {
        setSyncStats(prev => ({ ...prev, local: prev.local + 1 }));
      });
      
      diffSyncRef.current.on('remoteSync', (data) => {
        setSyncStats(prev => ({ ...prev, remote: prev.remote + 1 }));
      });
      
      diffSyncRef.current.on('syncError', (error) => {
        setError(error);
      });
      
      setIsInitialized(true);
      
    } catch (err) {
      setError(err);
    }
  }, [options, isInitialized]);
  
  const cleanup = useCallback(async () => {
    if (diffSyncRef.current) {
      await diffSyncRef.current.destroy();
      diffSyncRef.current = null;
    }
    
    if (wsProviderRef.current) {
      wsProviderRef.current.destroy();
      wsProviderRef.current = null;
    }
    
    if (modelerRef.current) {
      modelerRef.current.destroy();
      modelerRef.current = null;
    }
    
    setIsInitialized(false);
    setConnectionStatus('disconnected');
  }, []);
  
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  const loadDiagram = useCallback(async (xml) => {
    if (modelerRef.current) {
      await modelerRef.current.importXML(xml);
    }
  }, []);
  
  const saveDiagram = useCallback(async () => {
    if (modelerRef.current) {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      return xml;
    }
  }, []);
  
  return {
    containerRef,
    initialize,
    cleanup,
    loadDiagram,
    saveDiagram,
    isInitialized,
    connectionStatus,
    syncStats,
    error,
    modeler: modelerRef.current,
    diffSync: diffSyncRef.current
  };
}

// React 컴포넌트 사용 예제
export function BpmnCollaborationEditor({ websocketUrl, room, onError }) {
  const {
    containerRef,
    initialize,
    isInitialized,
    connectionStatus,
    syncStats,
    error
  } = useBpmnCollaboration({
    websocket: {
      url: websocketUrl,
      room: room
    },
    diffSync: {
      engine: { syncInterval: 500 }
    }
  });
  
  useEffect(() => {
    initialize();
  }, [initialize]);
  
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);
  
  return (
    <div className="bpmn-collaboration-editor">
      <div className="toolbar">
        <span className={`status ${connectionStatus}`}>
          {connectionStatus === 'connected' ? '연결됨' : '연결 끊김'}
        </span>
        <span className="sync-stats">
          로컬: {syncStats.local} | 원격: {syncStats.remote}
        </span>
      </div>
      
      <div 
        ref={containerRef} 
        className="bpmn-canvas"
        style={{ width: '100%', height: '600px' }}
      />
      
      {error && (
        <div className="error-banner">
          오류: {error.message}
        </div>
      )}
    </div>
  );
}
```

### 2.2 Vue.js 통합

```vue
<!-- BpmnCollaborationEditor.vue -->
<template>
  <div class="bpmn-collaboration-editor">
    <div class="toolbar">
      <span :class="['status', connectionStatus]">
        {{ connectionStatus === 'connected' ? '연결됨' : '연결 끊김' }}
      </span>
      <span class="sync-stats">
        로컬: {{ syncStats.local }} | 원격: {{ syncStats.remote }}
      </span>
      <button @click="loadSampleDiagram" :disabled="!isInitialized">
        샘플 로드
      </button>
    </div>
    
    <div ref="canvasContainer" class="bpmn-canvas"></div>
    
    <div v-if="error" class="error-banner">
      오류: {{ error.message }}
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { BpmnDiffSync } from '@bpmn-collaboration/diff-sync';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export default {
  name: 'BpmnCollaborationEditor',
  props: {
    websocketUrl: {
      type: String,
      required: true
    },
    room: {
      type: String,
      required: true
    },
    options: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['initialized', 'error', 'sync'],
  
  setup(props, { emit }) {
    const canvasContainer = ref(null);
    const isInitialized = ref(false);
    const connectionStatus = ref('disconnected');
    const syncStats = ref({ local: 0, remote: 0 });
    const error = ref(null);
    
    let modeler = null;
    let diffSync = null;
    let wsProvider = null;
    
    const initialize = async () => {
      try {
        error.value = null;
        
        // BPMN.js 모델러 초기화
        modeler = new BpmnModeler({
          container: canvasContainer.value,
          keyboard: { bindTo: window },
          ...props.options.modeler
        });
        
        // Y.js 및 WebSocket 설정
        const yjsDoc = new Y.Doc();
        wsProvider = new WebsocketProvider(
          props.websocketUrl,
          props.room,
          yjsDoc
        );
        
        wsProvider.on('status', (event) => {
          connectionStatus.value = event.status;
        });
        
        // Diff 동기화 초기화
        diffSync = new BpmnDiffSync(props.options.diffSync);
        await diffSync.initialize(modeler, yjsDoc);
        await diffSync.start();
        
        // 이벤트 리스너
        diffSync.on('localSync', (data) => {
          syncStats.value.local++;
          emit('sync', { type: 'local', ...data });
        });
        
        diffSync.on('remoteSync', (data) => {
          syncStats.value.remote++;
          emit('sync', { type: 'remote', ...data });
        });
        
        diffSync.on('syncError', (errorData) => {
          error.value = errorData.error;
          emit('error', errorData);
        });
        
        isInitialized.value = true;
        emit('initialized');
        
      } catch (err) {
        error.value = err;
        emit('error', err);
      }
    };
    
    const cleanup = async () => {
      if (diffSync) {
        await diffSync.destroy();
        diffSync = null;
      }
      
      if (wsProvider) {
        wsProvider.destroy();
        wsProvider = null;
      }
      
      if (modeler) {
        modeler.destroy();
        modeler = null;
      }
      
      isInitialized.value = false;
      connectionStatus.value = 'disconnected';
    };
    
    const loadSampleDiagram = async () => {
      if (!modeler) return;
      
      const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="Process_1">
            <bpmn:startEvent id="StartEvent_1"/>
            <bpmn:task id="Task_1" name="Sample Task"/>
            <bpmn:endEvent id="EndEvent_1"/>
            <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
            <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
          </bpmn:process>
        </bpmn:definitions>`;
      
      await modeler.importXML(sampleXML);
    };
    
    onMounted(() => {
      initialize();
    });
    
    onUnmounted(() => {
      cleanup();
    });
    
    watch(() => props.websocketUrl, () => {
      cleanup().then(() => initialize());
    });
    
    return {
      canvasContainer,
      isInitialized,
      connectionStatus,
      syncStats,
      error,
      loadSampleDiagram
    };
  }
};
</script>

<style scoped>
.bpmn-collaboration-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.status {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.status.connected {
  background: #d4edda;
  color: #155724;
}

.status.disconnected {
  background: #f8d7da;
  color: #721c24;
}

.sync-stats {
  font-size: 0.875rem;
  color: #666;
}

.bpmn-canvas {
  flex: 1;
  background: white;
}

.error-banner {
  background: #f8d7da;
  color: #721c24;
  padding: 0.5rem;
  text-align: center;
}
</style>
```

### 2.3 Angular 통합

```typescript
// bpmn-collaboration.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { BpmnDiffSync } from '@bpmn-collaboration/diff-sync';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CollaborationState {
  isInitialized: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  syncStats: { local: number; remote: number };
  error: Error | null;
}

@Injectable({
  providedIn: 'root'
})
export class BpmnCollaborationService {
  private modeler: BpmnModeler | null = null;
  private diffSync: BpmnDiffSync | null = null;
  private wsProvider: WebsocketProvider | null = null;
  
  private stateSubject = new BehaviorSubject<CollaborationState>({
    isInitialized: false,
    connectionStatus: 'disconnected',
    syncStats: { local: 0, remote: 0 },
    error: null
  });
  
  private syncEventSubject = new Subject<any>();
  
  public state$ = this.stateSubject.asObservable();
  public syncEvent$ = this.syncEventSubject.asObservable();
  
  async initialize(
    container: HTMLElement,
    websocketUrl: string,
    room: string,
    options: any = {}
  ): Promise<void> {
    try {
      this.updateState({ error: null });
      
      // BPMN.js 모델러 초기화
      this.modeler = new BpmnModeler({
        container,
        keyboard: { bindTo: window },
        ...options.modeler
      });
      
      // Y.js 및 WebSocket 설정
      const yjsDoc = new Y.Doc();
      this.wsProvider = new WebsocketProvider(websocketUrl, room, yjsDoc);
      
      this.wsProvider.on('status', (event: any) => {
        this.updateState({ connectionStatus: event.status });
      });
      
      // Diff 동기화 초기화
      this.diffSync = new BpmnDiffSync(options.diffSync);
      await this.diffSync.initialize(this.modeler, yjsDoc);
      await this.diffSync.start();
      
      // 이벤트 리스너
      this.diffSync.on('localSync', (data: any) => {
        const currentStats = this.stateSubject.value.syncStats;
        this.updateState({
          syncStats: { ...currentStats, local: currentStats.local + 1 }
        });
        this.syncEventSubject.next({ type: 'local', ...data });
      });
      
      this.diffSync.on('remoteSync', (data: any) => {
        const currentStats = this.stateSubject.value.syncStats;
        this.updateState({
          syncStats: { ...currentStats, remote: currentStats.remote + 1 }
        });
        this.syncEventSubject.next({ type: 'remote', ...data });
      });
      
      this.diffSync.on('syncError', (error: any) => {
        this.updateState({ error: error.error });
      });
      
      this.updateState({ isInitialized: true });
      
    } catch (error) {
      this.updateState({ error: error as Error });
      throw error;
    }
  }
  
  async loadDiagram(xml: string): Promise<void> {
    if (this.modeler) {
      await this.modeler.importXML(xml);
    }
  }
  
  async saveDiagram(): Promise<string | null> {
    if (this.modeler) {
      const { xml } = await this.modeler.saveXML({ format: true });
      return xml;
    }
    return null;
  }
  
  getMetrics() {
    return this.diffSync?.getMetrics() || null;
  }
  
  async destroy(): Promise<void> {
    if (this.diffSync) {
      await this.diffSync.destroy();
      this.diffSync = null;
    }
    
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
    
    if (this.modeler) {
      this.modeler.destroy();
      this.modeler = null;
    }
    
    this.updateState({
      isInitialized: false,
      connectionStatus: 'disconnected',
      syncStats: { local: 0, remote: 0 },
      error: null
    });
  }
  
  private updateState(partialState: Partial<CollaborationState>): void {
    const currentState = this.stateSubject.value;
    this.stateSubject.next({ ...currentState, ...partialState });
  }
}

// bpmn-collaboration.component.ts
import { Component, ElementRef, ViewChild, OnInit, OnDestroy, Input } from '@angular/core';
import { BpmnCollaborationService, CollaborationState } from './bpmn-collaboration.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-bpmn-collaboration',
  template: `
    <div class="bpmn-collaboration-editor">
      <div class="toolbar">
        <span [class]="'status ' + (state$ | async)?.connectionStatus">
          {{ getConnectionStatusText((state$ | async)?.connectionStatus) }}
        </span>
        <span class="sync-stats">
          로컬: {{ (state$ | async)?.syncStats.local }} | 
          원격: {{ (state$ | async)?.syncStats.remote }}
        </span>
        <button (click)="loadSampleDiagram()" 
                [disabled]="!(state$ | async)?.isInitialized">
          샘플 로드
        </button>
      </div>
      
      <div #canvasContainer class="bpmn-canvas"></div>
      
      <div *ngIf="(state$ | async)?.error" class="error-banner">
        오류: {{ (state$ | async)?.error?.message }}
      </div>
    </div>
  `,
  styles: [`
    .bpmn-collaboration-editor {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    .toolbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
    }
    
    .status {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
    }
    
    .status.connected {
      background: #d4edda;
      color: #155724;
    }
    
    .status.disconnected {
      background: #f8d7da;
      color: #721c24;
    }
    
    .bpmn-canvas {
      flex: 1;
      background: white;
    }
    
    .error-banner {
      background: #f8d7da;
      color: #721c24;
      padding: 0.5rem;
      text-align: center;
    }
  `]
})
export class BpmnCollaborationComponent implements OnInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef;
  
  @Input() websocketUrl: string = 'ws://localhost:1234';
  @Input() room: string = 'default-room';
  @Input() options: any = {};
  
  state$: Observable<CollaborationState>;
  
  constructor(private collaborationService: BpmnCollaborationService) {
    this.state$ = this.collaborationService.state$;
  }
  
  async ngOnInit() {
    await this.collaborationService.initialize(
      this.canvasContainer.nativeElement,
      this.websocketUrl,
      this.room,
      this.options
    );
  }
  
  async ngOnDestroy() {
    await this.collaborationService.destroy();
  }
  
  async loadSampleDiagram() {
    const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_1">
          <bpmn:startEvent id="StartEvent_1"/>
          <bpmn:task id="Task_1" name="Sample Task"/>
          <bpmn:endEvent id="EndEvent_1"/>
        </bpmn:process>
      </bpmn:definitions>`;
    
    await this.collaborationService.loadDiagram(sampleXML);
  }
  
  getConnectionStatusText(status: string | undefined): string {
    switch (status) {
      case 'connected': return '연결됨';
      case 'connecting': return '연결 중';
      default: return '연결 끊김';
    }
  }
}
```

## 3. 서버 환경별 통합 가이드

### 3.1 Express.js 서버 설정

```javascript
// server/collaboration-server.js
const express = require('express');
const { createServer } = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');
const WebSocket = require('ws');
const cors = require('cors');

class CollaborationServer {
  constructor(options = {}) {
    this.options = {
      port: 3000,
      wsPort: 1234,
      enableCors: true,
      enablePersistence: false,
      ...options
    };
    
    this.app = express();
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupWebSocket();
    
    if (this.options.enablePersistence) {
      this.setupPersistence();
    }
  }
  
  setupMiddleware() {
    if (this.options.enableCors) {
      this.app.use(cors());
    }
    
    this.app.use(express.json());
    this.app.use(express.static('public'));
    
    // 상태 체크 엔드포인트
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        connections: this.wss?.clients.size || 0,
        timestamp: new Date().toISOString()
      });
    });
    
    // 협업 세션 관리 API
    this.app.get('/api/sessions', this.getSessions.bind(this));
    this.app.post('/api/sessions', this.createSession.bind(this));
    this.app.delete('/api/sessions/:id', this.deleteSession.bind(this));
  }
  
  setupWebSocket() {
    this.wss = new WebSocket.Server({ 
      port: this.options.wsPort,
      perMessageDeflate: false 
    });
    
    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection from:', req.socket.remoteAddress);
      
      // Y.js WebSocket 유틸리티 사용
      setupWSConnection(ws, req, {
        gc: true // 가비지 컬렉션 활성화
      });
      
      ws.on('close', () => {
        console.log('WebSocket connection closed');
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
    
    console.log(`WebSocket server running on port ${this.options.wsPort}`);
  }
  
  setupPersistence() {
    // LevelDB를 사용한 Y.js 문서 영속화
    const { LeveldbPersistence } = require('y-leveldb');
    
    this.persistence = new LeveldbPersistence('./db');
    
    // 정기적인 가비지 컬렉션
    setInterval(() => {
      this.persistence.flushDocument();
    }, 30000); // 30초마다
  }
  
  async getSessions(req, res) {
    try {
      // 활성 세션 목록 반환
      const sessions = Array.from(this.wss.clients).map(client => ({
        id: client.id,
        room: client.room,
        connectedAt: client.connectedAt
      }));
      
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  async createSession(req, res) {
    try {
      const { room, initialDiagram } = req.body;
      
      // 세션 생성 로직
      const session = {
        id: this.generateSessionId(),
        room,
        createdAt: new Date().toISOString(),
        initialDiagram
      };
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  async deleteSession(req, res) {
    try {
      const sessionId = req.params.id;
      
      // 세션 정리 로직
      // Y.js 문서 정리, 연결된 클라이언트 해제 등
      
      res.json({ message: 'Session deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  start() {
    this.server.listen(this.options.port, () => {
      console.log(`Collaboration server running on port ${this.options.port}`);
      console.log(`WebSocket server running on port ${this.options.wsPort}`);
    });
  }
  
  generateSessionId() {
    return 'session-' + Math.random().toString(36).substr(2, 9);
  }
}

// 서버 시작
if (require.main === module) {
  const server = new CollaborationServer({
    port: process.env.PORT || 3000,
    wsPort: process.env.WS_PORT || 1234,
    enablePersistence: process.env.ENABLE_PERSISTENCE === 'true'
  });
  
  server.start();
}

module.exports = CollaborationServer;
```

### 3.2 Docker 컨테이너 설정

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 애플리케이션 코드 복사
COPY . .

# 포트 노출
EXPOSE 3000 1234

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 애플리케이션 시작
CMD ["node", "server/collaboration-server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  collaboration-server:
    build: .
    ports:
      - "3000:3000"
      - "1234:1234"
    environment:
      - NODE_ENV=production
      - ENABLE_PERSISTENCE=true
    volumes:
      - ./data:/app/db
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

## 4. 설정 최적화 가이드

### 4.1 성능 최적화 설정

```javascript
// 성능 중심 설정
const performanceConfig = {
  diffSync: {
    engine: {
      syncInterval: 200,           // 더 빠른 동기화
      maxBatchSize: 50,           // 작은 배치 크기
      enableOptimization: true    // 최적화 활성화
    },
    calculator: {
      type: 'OptimizedDiffCalculator',
      options: {
        positionTolerance: 0.1,   // 정밀한 위치 감지
        enableOptimization: true,
        batchThreshold: 5         // 작은 배치 임계값
      }
    },
    applicator: {
      options: {
        batchSize: 25,            // 작은 적용 배치
        applyTimeout: 3000        // 짧은 타임아웃
      }
    },
    plugins: [
      {
        type: 'PerformanceMonitor',
        options: {
          slowSyncThreshold: 50,  // 50ms 이상을 느린 동기화로 간주
          enableDetailedMetrics: true
        }
      }
    ]
  }
};

// 안정성 중심 설정
const stabilityConfig = {
  diffSync: {
    engine: {
      syncInterval: 1000,         // 안정적인 동기화 간격
      maxBatchSize: 200,         // 큰 배치 크기
      enableOptimization: false  // 안정성을 위해 최적화 비활성화
    },
    calculator: {
      options: {
        positionTolerance: 2.0,   // 느슨한 위치 허용
        ignoreMinorChanges: true  // 미세 변경 무시
      }
    },
    applicator: {
      options: {
        validateBeforeApply: true, // 적용 전 검증
        rollbackOnError: true,     // 오류시 롤백
        applyTimeout: 10000        // 긴 타임아웃
      }
    },
    plugins: [
      {
        type: 'ValidationPlugin',
        options: {
          enableBusinessRules: true,
          strictMode: true
        }
      }
    ]
  }
};

// 대용량 다이어그램 설정
const scalabilityConfig = {
  diffSync: {
    engine: {
      syncInterval: 2000,         // 느린 동기화로 부하 감소
      maxBatchSize: 500,         // 큰 배치로 효율성 향상
      enableOptimization: true
    },
    calculator: {
      options: {
        positionTolerance: 5.0,   // 큰 허용 오차
        ignoreMinorChanges: true,
        batchThreshold: 50        // 큰 배치 임계값
      }
    },
    plugins: [
      {
        type: 'CompressionPlugin',
        options: {
          enableForDiffs: true,    // Diff 압축
          enableForStates: true,   // 상태 압축
          threshold: 1024          // 1KB 이상 압축
        }
      }
    ]
  }
};
```

### 4.2 네트워크 최적화

```javascript
// WebSocket 최적화 설정
const networkOptimizedConfig = {
  websocket: {
    url: 'wss://your-server.com/collaboration',
    room: 'project-room',
    options: {
      // 재연결 설정
      maxBackoffTime: 30000,
      initialBackoffTime: 1000,
      randomizationFactor: 0.1,
      multiplier: 1.5,
      maxRetries: 10,
      
      // 압축 설정
      perMessageDeflate: {
        threshold: 1024,         // 1KB 이상 압축
        concurrencyLimit: 10,
        serverMaxWindowBits: 15,
        clientMaxWindowBits: 15
      },
      
      // 버퍼 설정
      maxPayload: 100 * 1024 * 1024, // 100MB
      
      // 하트비트
      pingInterval: 30000,
      pongTimeout: 5000
    }
  },
  
  diffSync: {
    adapter: {
      type: 'YjsAdapter',
      options: {
        enableCompression: true,   // 어댑터 레벨 압축
        retryOnError: true,
        maxRetries: 5,
        retryDelay: 2000,
        
        // 배치 전송 최적화
        batchTimeout: 100,        // 100ms 내 변경사항 배치
        maxBatchSize: 10          // 최대 10개 변경사항 배치
      }
    }
  }
};
```

## 5. 모니터링 및 디버깅

### 5.1 모니터링 설정

```javascript
// 모니터링 플러그인 설정
const monitoringConfig = {
  diffSync: {
    plugins: [
      {
        type: 'PerformanceMonitor',
        options: {
          enableMetrics: true,
          reportInterval: 10000,     // 10초마다 리포트
          slowSyncThreshold: 100,
          memoryThreshold: 100,      // 100MB
          
          // 메트릭 콜백
          onMetricsReport: (metrics) => {
            // 외부 모니터링 시스템으로 전송
            sendToMonitoringService(metrics);
          },
          
          onSlowSync: (data) => {
            console.warn('Slow sync detected:', data);
          },
          
          onMemoryThreshold: (data) => {
            console.warn('Memory threshold exceeded:', data);
          }
        }
      },
      
      {
        type: 'LoggingPlugin',
        options: {
          level: 'info',
          enableRemoteLogging: true,
          remoteEndpoint: 'https://your-logging-service.com/logs',
          
          // 구조화된 로깅
          structured: true,
          includeContext: true,
          includeStackTrace: true
        }
      }
    ]
  }
};

// 외부 모니터링 서비스 연동
function sendToMonitoringService(metrics) {
  fetch('/api/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: Date.now(),
      service: 'bpmn-collaboration',
      metrics: metrics
    })
  }).catch(error => {
    console.error('Failed to send metrics:', error);
  });
}
```

### 5.2 디버깅 도구

```javascript
// 디버깅 헬퍼 클래스
class DiffSyncDebugger {
  constructor(diffSync) {
    this.diffSync = diffSync;
    this.events = [];
    this.states = [];
    this.setupEventTracking();
  }
  
  setupEventTracking() {
    // 모든 이벤트 추적
    const originalEmit = this.diffSync.eventBus.emit;
    this.diffSync.eventBus.emit = (event, data) => {
      this.events.push({
        timestamp: Date.now(),
        event,
        data: JSON.parse(JSON.stringify(data))
      });
      
      // 최대 1000개 이벤트 유지
      if (this.events.length > 1000) {
        this.events.shift();
      }
      
      return originalEmit.call(this.diffSync.eventBus, event, data);
    };
  }
  
  captureState() {
    const state = this.diffSync.createSnapshot();
    this.states.push({
      timestamp: Date.now(),
      state: JSON.parse(JSON.stringify(state))
    });
    
    // 최대 100개 상태 유지
    if (this.states.length > 100) {
      this.states.shift();
    }
  }
  
  getRecentEvents(count = 50) {
    return this.events.slice(-count);
  }
  
  getStateHistory() {
    return this.states;
  }
  
  exportDebugData() {
    return {
      events: this.events,
      states: this.states,
      metrics: this.diffSync.getMetrics(),
      config: this.diffSync.getConfig(),
      timestamp: Date.now()
    };
  }
  
  visualizeDiff(diff) {
    console.group('🔄 Diff Visualization');
    console.log('📊 Statistics:', diff.statistics);
    
    if (diff.added.length > 0) {
      console.group('➕ Added Elements');
      diff.added.forEach(el => {
        console.log(`${el.type} (${el.id}) at (${el.x}, ${el.y})`);
      });
      console.groupEnd();
    }
    
    if (diff.modified.length > 0) {
      console.group('🔄 Modified Elements');
      diff.modified.forEach(mod => {
        console.log(`${mod.id}:`, mod.changes);
      });
      console.groupEnd();
    }
    
    if (diff.removed.length > 0) {
      console.group('❌ Removed Elements');
      diff.removed.forEach(id => {
        console.log(id);
      });
      console.groupEnd();
    }
    
    console.groupEnd();
  }
}

// 사용 예제
const debugger = new DiffSyncDebugger(diffSync);

// 주기적으로 상태 캡처
setInterval(() => {
  debugger.captureState();
}, 5000);

// 디버그 데이터 내보내기
window.exportDebugData = () => {
  const data = debugger.exportDebugData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { 
    type: 'application/json' 
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bpmn-sync-debug-${Date.now()}.json`;
  a.click();
};
```

## 6. 트러블슈팅 가이드

### 6.1 일반적인 문제 해결

```javascript
// 연결 문제 진단
class ConnectionDiagnostics {
  constructor(diffSync) {
    this.diffSync = diffSync;
  }
  
  async diagnose() {
    const results = {
      websocket: await this.checkWebSocket(),
      yjs: await this.checkYjsSync(),
      diffSync: await this.checkDiffSync(),
      performance: await this.checkPerformance()
    };
    
    return results;
  }
  
  async checkWebSocket() {
    try {
      const wsProvider = this.diffSync.adapter.wsProvider;
      
      return {
        status: wsProvider.wsconnected ? 'connected' : 'disconnected',
        url: wsProvider.url,
        room: wsProvider.roomname,
        synced: wsProvider.synced,
        lastUpdate: wsProvider.lastMessageReceived
      };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  async checkYjsSync() {
    try {
      const yjsDoc = this.diffSync.adapter.yjsDoc;
      
      return {
        clientId: yjsDoc.clientID,
        stateVector: Array.from(yjsDoc.getStateVector()),
        updateSize: yjsDoc.getUpdate().length,
        elementCount: yjsDoc.getMap('elements').size
      };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  async checkDiffSync() {
    try {
      const metrics = this.diffSync.getMetrics();
      const state = this.diffSync.createSnapshot();
      
      return {
        isRunning: this.diffSync.isRunning,
        syncCount: metrics.sync.cycles,
        errorRate: metrics.applicator.errorRate,
        elementCount: Object.keys(state.elements).length,
        lastSync: metrics.sync.lastSyncTime
      };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  async checkPerformance() {
    const metrics = this.diffSync.getMetrics();
    
    const warnings = [];
    
    if (metrics.sync.averageTime > 200) {
      warnings.push('Slow synchronization detected');
    }
    
    if (metrics.applicator.errorRate > 0.05) {
      warnings.push('High error rate detected');
    }
    
    return {
      averageSyncTime: metrics.sync.averageTime,
      errorRate: metrics.applicator.errorRate,
      warnings
    };
  }
}

// 자동 복구 시스템
class AutoRecovery {
  constructor(diffSync) {
    this.diffSync = diffSync;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 3;
    
    this.setupRecoveryListeners();
  }
  
  setupRecoveryListeners() {
    this.diffSync.on('syncError', async (error) => {
      await this.handleSyncError(error);
    });
    
    this.diffSync.on('connectionLost', async () => {
      await this.handleConnectionLoss();
    });
  }
  
  async handleSyncError(error) {
    console.warn('Sync error detected, attempting recovery:', error);
    
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      console.error('Max recovery attempts reached');
      return;
    }
    
    this.recoveryAttempts++;
    
    try {
      // 상태 재설정
      await this.diffSync.reset();
      
      // 재동기화
      await this.diffSync.sync();
      
      console.log('Recovery successful');
      this.recoveryAttempts = 0;
      
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
      setTimeout(() => this.handleSyncError(error), 5000);
    }
  }
  
  async handleConnectionLoss() {
    console.warn('Connection lost, attempting reconnection');
    
    // 지수 백오프로 재연결 시도
    const delay = Math.min(1000 * Math.pow(2, this.recoveryAttempts), 30000);
    
    setTimeout(async () => {
      try {
        await this.diffSync.reconnect();
        console.log('Reconnection successful');
        this.recoveryAttempts = 0;
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.recoveryAttempts++;
        this.handleConnectionLoss();
      }
    }, delay);
  }
}
```

이 통합 가이드를 통해 다양한 환경에서 Diff 기반 동기화 모듈을 안전하고 효율적으로 적용할 수 있습니다.