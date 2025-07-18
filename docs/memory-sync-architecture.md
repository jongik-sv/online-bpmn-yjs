# BPMN.js ElementRegistry 메모리 기반 실시간 동기화 시스템

## 개요

BPMN.js의 ElementRegistry 내부 메모리 구조를 Y.js CRDT를 활용하여 실시간 동기화하는 시스템입니다. 기존의 이벤트 기반 동기화 방식 대신 메모리 상태를 직접 동기화하여 더 견고하고 일관성 있는 협업 환경을 제공합니다.

## 아키텍처 개요

```mermaid
graph TB
    subgraph "클라이언트 A"
        ERA[ElementRegistry A]
        YDA[Y.js Document A]
        ERA ↔ YDA
    end
    
    subgraph "서버"
        YS[Y.js Server]
        DB[(Database)]
        YS → DB
    end
    
    subgraph "클라이언트 B"
        ERB[ElementRegistry B]
        YDB[Y.js Document B]
        ERB ↔ YDB
    end
    
    YDA ↔ YS
    YDB ↔ YS
```

## 1. 핵심 개념

### 1.1 ElementRegistry 내부 구조
```javascript
class ElementRegistry {
  constructor() {
    this._elements = {};        // id → element 매핑
    this._gfx = {};            // id → SVG graphics 매핑
    this._elementTree = {};    // 부모-자식 관계 트리
  }
}
```

### 1.2 Y.js 문서 구조
```javascript
const ydoc = new Y.Doc();
const yElements = ydoc.getMap('elements');        // _elements 동기화
const yGraphics = ydoc.getMap('graphics');        // _gfx 메타데이터 동기화
const yElementTree = ydoc.getMap('elementTree');  // _elementTree 동기화
const yMetadata = ydoc.getMap('metadata');        // 추가 메타데이터
```

## 2. 데이터 구조 설계

### 2.1 Element 데이터 매핑

```javascript
// BPMN Element → Y.js Map 변환
function elementToYMap(element) {
  const elementMap = new Y.Map();
  
  // 기본 속성
  elementMap.set('id', element.id);
  elementMap.set('type', element.type);
  elementMap.set('x', element.x);
  elementMap.set('y', element.y);
  elementMap.set('width', element.width);
  elementMap.set('height', element.height);
  
  // BusinessObject → Y.Map
  if (element.businessObject) {
    const businessObjectMap = new Y.Map();
    Object.entries(element.businessObject).forEach(([key, value]) => {
      if (typeof value !== 'function') {
        businessObjectMap.set(key, value);
      }
    });
    elementMap.set('businessObject', businessObjectMap);
  }
  
  // Waypoints → Y.Array (연결선)
  if (element.waypoints) {
    const waypointsArray = new Y.Array();
    element.waypoints.forEach(wp => {
      const waypointMap = new Y.Map();
      waypointMap.set('x', wp.x);
      waypointMap.set('y', wp.y);
      waypointsArray.push([waypointMap]);
    });
    elementMap.set('waypoints', waypointsArray);
  }
  
  // 관계 정보 (ID만 저장)
  elementMap.set('parentId', element.parent?.id || null);
  elementMap.set('childrenIds', new Y.Array(element.children?.map(c => c.id) || []));
  elementMap.set('incomingIds', new Y.Array(element.incoming?.map(c => c.id) || []));
  elementMap.set('outgoingIds', new Y.Array(element.outgoing?.map(c => c.id) || []));
  
  return elementMap;
}
```

### 2.2 Graphics 메타데이터 매핑

```javascript
// SVG Graphics 메타데이터만 동기화 (DOM 제외)
function graphicsToYMap(elementId, gfx) {
  const gfxMap = new Y.Map();
  
  gfxMap.set('elementId', elementId);
  gfxMap.set('visible', gfx.style.display !== 'none');
  gfxMap.set('opacity', parseFloat(gfx.style.opacity) || 1);
  gfxMap.set('transform', gfx.getAttribute('transform') || '');
  
  // CSS 클래스
  const classArray = new Y.Array();
  if (gfx.classList) {
    gfx.classList.forEach(cls => classArray.push([cls]));
  }
  gfxMap.set('classes', classArray);
  
  return gfxMap;
}
```

## 3. 동기화 시스템 구현

### 3.1 핵심 동기화 클래스

```javascript
class YjsElementRegistrySync {
  constructor(elementRegistry, ydoc, options = {}) {
    this.elementRegistry = elementRegistry;
    this.ydoc = ydoc;
    this.options = {
      batchDelay: 50,
      enableGraphicsSync: true,
      enableTreeSync: true,
      ...options
    };
    
    // Y.js 컬렉션
    this.yElements = ydoc.getMap('elements');
    this.yGraphics = ydoc.getMap('graphics');
    this.yElementTree = ydoc.getMap('elementTree');
    this.yMetadata = ydoc.getMap('metadata');
    
    // 동기화 상태 관리
    this.isLocalUpdate = false;
    this.pendingUpdates = new Set();
    this.batchTimeout = null;
    
    this.initialize();
  }
  
  initialize() {
    this.setupYjsListeners();
    this.setupBpmnListeners();
    this.performInitialSync();
  }
}
```

### 3.2 Y.js → BPMN 방향 동기화

```javascript
setupYjsListeners() {
  // Elements 변경 감지
  this.yElements.observe((event) => {
    if (this.isLocalUpdate) return;
    
    event.changes.keys.forEach((change, elementId) => {
      switch (change.action) {
        case 'add':
          this.handleElementAdded(elementId, this.yElements.get(elementId));
          break;
        case 'update':
          this.handleElementUpdated(elementId, this.yElements.get(elementId));
          break;
        case 'delete':
          this.handleElementRemoved(elementId);
          break;
      }
    });
    
    // 관계 재구성
    this.rebuildElementRelations();
  });
  
  // Graphics 변경 감지
  if (this.options.enableGraphicsSync) {
    this.yGraphics.observe((event) => {
      if (this.isLocalUpdate) return;
      
      event.changes.keys.forEach((change, elementId) => {
        if (change.action === 'update') {
          this.handleGraphicsUpdated(elementId, this.yGraphics.get(elementId));
        }
      });
    });
  }
}
```

### 3.3 BPMN → Y.js 방향 동기화

```javascript
setupBpmnListeners() {
  // ElementRegistry 변경 감지
  this.elementRegistry._eventBus.on('elements.changed', (event) => {
    if (this.isLocalUpdate) return;
    
    // 배치 업데이트 스케줄링
    event.elements.forEach(element => {
      this.scheduleElementSync(element);
    });
  });
  
  // Graphics 변경 감지 (옵션)
  if (this.options.enableGraphicsSync) {
    this.setupGraphicsObserver();
  }
}

scheduleElementSync(element) {
  this.pendingUpdates.add(element);
  
  if (this.batchTimeout) {
    clearTimeout(this.batchTimeout);
  }
  
  this.batchTimeout = setTimeout(() => {
    this.flushPendingUpdates();
  }, this.options.batchDelay);
}

flushPendingUpdates() {
  if (this.pendingUpdates.size === 0) return;
  
  this.isLocalUpdate = true;
  
  // Y.js 트랜잭션으로 원자적 업데이트
  this.ydoc.transact(() => {
    this.pendingUpdates.forEach(element => {
      this.syncElementToYjs(element);
    });
  });
  
  this.pendingUpdates.clear();
  this.batchTimeout = null;
  this.isLocalUpdate = false;
}
```

## 4. 메모리 직접 조작

### 4.1 Element 생성

```javascript
handleElementAdded(elementId, yElementMap) {
  // Y.Map에서 BPMN Element 재구성
  const element = this.yMapToElement(yElementMap);
  
  // ElementRegistry에 직접 추가
  this.isLocalUpdate = true;
  
  // 메모리에 직접 생성 (기존 구현 활용)
  this.addElementDirectly(element);
  
  this.isLocalUpdate = false;
}

addElementDirectly(element) {
  // BusinessObject 생성
  const bpmnFactory = this.elementRegistry._modeler.get('bpmnFactory');
  const businessObject = this.createBusinessObject(element, bpmnFactory);
  
  // Element 객체 완성
  const completeElement = {
    ...element,
    businessObject: businessObject,
    parent: null, // 나중에 관계 설정
    children: [],
    incoming: [],
    outgoing: [],
    labels: [],
    // 렌더링 관련 속성
    hidden: false,
    collapsed: false,
    di: this.createDiagramInterchange(element, businessObject)
  };
  
  // Canvas에 추가 (DOM 생성 + ElementRegistry 등록)
  const canvas = this.elementRegistry._modeler.get('canvas');
  
  if (element.waypoints) {
    // 연결선
    canvas.addConnection(completeElement, this.findParent(element));
  } else {
    // 일반 요소
    canvas.addShape(completeElement, this.findParent(element));
  }
}
```

### 4.2 Element 업데이트

```javascript
handleElementUpdated(elementId, yElementMap) {
  const existingElement = this.elementRegistry.get(elementId);
  if (!existingElement) return;
  
  this.isLocalUpdate = true;
  
  // 속성 직접 업데이트
  this.updateElementProperties(existingElement, yElementMap);
  
  // 그래픽스 업데이트
  this.updateElementGraphics(existingElement);
  
  this.isLocalUpdate = false;
}

updateElementProperties(element, yElementMap) {
  // 위치 및 크기 업데이트
  element.x = yElementMap.get('x');
  element.y = yElementMap.get('y');
  element.width = yElementMap.get('width');
  element.height = yElementMap.get('height');
  
  // BusinessObject 업데이트
  const yBusinessObject = yElementMap.get('businessObject');
  if (yBusinessObject && element.businessObject) {
    yBusinessObject.forEach((value, key) => {
      if (key !== '$type' && key !== '$parent' && key !== '$model') {
        element.businessObject[key] = value;
      }
    });
  }
  
  // Waypoints 업데이트 (연결선)
  const yWaypoints = yElementMap.get('waypoints');
  if (yWaypoints && element.waypoints) {
    element.waypoints = [];
    yWaypoints.forEach(yWaypoint => {
      element.waypoints.push({
        x: yWaypoint.get('x'),
        y: yWaypoint.get('y')
      });
    });
  }
}
```

### 4.3 Element 삭제

```javascript
handleElementRemoved(elementId) {
  const element = this.elementRegistry.get(elementId);
  if (!element) return;
  
  this.isLocalUpdate = true;
  
  // Canvas에서 제거 (DOM 제거 + ElementRegistry에서 제거)
  const canvas = this.elementRegistry._modeler.get('canvas');
  
  if (element.waypoints) {
    canvas.removeConnection(element);
  } else {
    canvas.removeShape(element);
  }
  
  this.isLocalUpdate = false;
}
```

## 5. 관계 재구성

```javascript
rebuildElementRelations() {
  // 모든 요소의 관계를 재구성
  this.yElements.forEach((yElementMap, elementId) => {
    const element = this.elementRegistry.get(elementId);
    if (!element) return;
    
    // 부모 관계 설정
    const parentId = yElementMap.get('parentId');
    if (parentId) {
      element.parent = this.elementRegistry.get(parentId);
    }
    
    // 자식 관계 설정
    const childrenIds = yElementMap.get('childrenIds');
    if (childrenIds) {
      element.children = [];
      childrenIds.forEach((childId) => {
        const child = this.elementRegistry.get(childId);
        if (child) {
          element.children.push(child);
        }
      });
    }
    
    // 연결선 관계 설정
    this.rebuildConnectionRelations(element, yElementMap);
  });
}

rebuildConnectionRelations(element, yElementMap) {
  // Incoming 연결선
  const incomingIds = yElementMap.get('incomingIds');
  if (incomingIds) {
    element.incoming = [];
    incomingIds.forEach((connectionId) => {
      const connection = this.elementRegistry.get(connectionId);
      if (connection) {
        element.incoming.push(connection);
      }
    });
  }
  
  // Outgoing 연결선
  const outgoingIds = yElementMap.get('outgoingIds');
  if (outgoingIds) {
    element.outgoing = [];
    outgoingIds.forEach((connectionId) => {
      const connection = this.elementRegistry.get(connectionId);
      if (connection) {
        element.outgoing.push(connection);
      }
    });
  }
}
```

## 6. 사용법 및 초기화

### 6.1 기본 사용법

```javascript
// Y.js 문서 및 프로바이더 초기화
const ydoc = new Y.Doc();
const provider = new WebsocketProvider('ws://localhost:1234', 'bpmn-room', ydoc);

// BPMN 모델러 초기화
const modeler = new BpmnModeler({
  container: '#canvas'
});

// 동기화 시스템 초기화
const elementRegistry = modeler.get('elementRegistry');
const yjsSync = new YjsElementRegistrySync(elementRegistry, ydoc, {
  batchDelay: 50,
  enableGraphicsSync: true,
  enableTreeSync: true
});

// 자동으로 실시간 동기화 시작
console.log('BPMN ElementRegistry 메모리 동기화 시작');
```

### 6.2 고급 사용법

```javascript
// 커스텀 동기화 옵션
const yjsSync = new YjsElementRegistrySync(elementRegistry, ydoc, {
  batchDelay: 100,           // 배치 업데이트 지연 시간
  enableGraphicsSync: false, // Graphics 동기화 비활성화
  enableTreeSync: true,      // Element Tree 동기화 활성화
  conflictResolution: 'last-write-wins', // 충돌 해결 전략
  maxHistorySize: 1000       // 최대 히스토리 크기
});

// 이벤트 리스너
yjsSync.on('sync-complete', () => {
  console.log('동기화 완료');
});

yjsSync.on('conflict-detected', (conflict) => {
  console.log('충돌 감지:', conflict);
});
```

## 7. 성능 최적화

### 7.1 배치 처리

```javascript
class OptimizedYjsSync extends YjsElementRegistrySync {
  flushPendingUpdates() {
    if (this.pendingUpdates.size === 0) return;
    
    // 렌더링 일시 중단
    this.suspendRendering();
    
    this.isLocalUpdate = true;
    
    // 단일 Y.js 트랜잭션으로 모든 업데이트 처리
    this.ydoc.transact(() => {
      const updatesByType = this.groupUpdatesByType(this.pendingUpdates);
      
      // 요소 생성 → 요소 업데이트 → 관계 업데이트 순서로 처리
      this.processBatchUpdates(updatesByType);
    });
    
    this.pendingUpdates.clear();
    this.batchTimeout = null;
    this.isLocalUpdate = false;
    
    // 렌더링 재개
    this.resumeRendering();
  }
}
```

### 7.2 메모리 사용량 최적화

```javascript
// 대용량 다이어그램을 위한 지연 로딩
class LazyLoadingYjsSync extends YjsElementRegistrySync {
  constructor(elementRegistry, ydoc, options = {}) {
    super(elementRegistry, ydoc, {
      ...options,
      lazyLoading: true,
      visibleAreaOnly: true
    });
    
    this.visibleElements = new Set();
    this.loadedElements = new Set();
  }
  
  handleElementAdded(elementId, yElementMap) {
    // 현재 뷰포트에 있는 요소만 즉시 로드
    if (this.isElementVisible(yElementMap)) {
      super.handleElementAdded(elementId, yElementMap);
      this.loadedElements.add(elementId);
    } else {
      // 나머지는 지연 로딩 큐에 추가
      this.addToLazyLoadQueue(elementId, yElementMap);
    }
  }
}
```

## 8. 장점 및 고려사항

### 8.1 장점

1. **완전한 상태 동기화**: ElementRegistry 내부 메모리 상태 완전 복제
2. **실시간 일관성**: Y.js CRDT로 충돌 없는 실시간 동기화
3. **오프라인 지원**: Y.js의 오프라인 동기화 기능 활용
4. **성능 최적화**: 배치 처리 및 지연 로딩으로 대용량 다이어그램 지원
5. **확장성**: 여러 클라이언트 간 효율적인 상태 공유

### 8.2 고려사항

1. **메모리 사용량**: 전체 상태 복제로 인한 메모리 오버헤드
2. **초기 로딩**: 대용량 다이어그램의 초기 동기화 시간
3. **네트워크 대역폭**: 전체 상태 전송으로 인한 네트워크 사용량
4. **복잡성**: 관계 재구성 및 순환 참조 처리 복잡성

## 9. 결론

이 메모리 기반 동기화 시스템은 BPMN.js의 ElementRegistry 내부 구조를 Y.js CRDT로 완전히 동기화하여 견고하고 일관성 있는 실시간 협업 환경을 제공합니다. 기존의 이벤트 기반 방식보다 복잡하지만, 더 정확하고 신뢰할 수 있는 동기화를 구현할 수 있습니다.