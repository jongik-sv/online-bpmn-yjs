# bpmn-js 협업 시스템 구현을 위한 원격 변경사항 적용 방법

## 핵심 개념: Silent Update 아키텍처

bpmn-js에서 협업 시스템을 구현하는 핵심은 **원격 변경사항을 로컬 모델에 반영하되 commandStack이나 element 이벤트를 발생시키지 않는 "Silent Update" 메커니즘**입니다. 이를 위해 bpmn-js의 내부 구조를 우회하는 여러 방법을 사용해야 합니다.

## 1. bpmn-js 내부 모델 구조와 commandStack 우회

### 내부 아키텍처 이해

bpmn-js는 3계층 구조로 구성되어 있습니다:
- **Model Layer**: BPMN 2.0 business objects (bpmn-moddle)
- **Diagram Layer**: 그래픽 요소들 (diagram-js)
- **View Layer**: 시각적 렌더링

**각 요소는 이중 구조를 갖습니다:**
```javascript
// 다이어그램 요소 구조
{
  id: 'Task_1',
  x: 100, y: 100,
  width: 100, height: 80,
  businessObject: {
    $type: 'bpmn:Task',
    id: 'Task_1',
    name: 'My Task',
    $parent: ProcessElement
  }
}
```

### CommandStack 우회 방법

**방법 1: Custom CommandStack 분리**
```javascript
// 사용자 액션용과 협업용 CommandStack 분리
export var SilentCommandStackModule = {
  __init__: ['silentCommandStack'],
  silentCommandStack: ['type', CommandStack]
};

function SilentModeling(eventBus, elementFactory, silentCommandStack, bpmnRules) {
  Modeling.call(this, eventBus, elementFactory, silentCommandStack, bpmnRules);
}

// 사용법
var userModeling = modeler.get('modeling');        // 사용자 액션 (undo/redo 포함)
var silentModeling = modeler.get('silentModeling'); // 협업 업데이트 (silent)
```

**방법 2: CommandStack 임시 비활성화**
```javascript
function executeWithoutCommands(modeler, operation) {
  var commandStack = modeler.get('commandStack');
  var originalEnabled = commandStack._enabled;
  
  commandStack._enabled = false;
  try {
    operation();
  } finally {
    commandStack._enabled = originalEnabled;
  }
}
```

## 2. 직접 모델 조작 - addElement/removeElement 우회

### BusinessObject 직접 조작

**기본 패턴:**
```javascript
// 공식 API 우회하고 직접 businessObject 수정
function updateBusinessObjectDirectly(elementId, properties) {
  var elementRegistry = modeler.get('elementRegistry');
  var element = elementRegistry.get(elementId);
  
  // businessObject 직접 수정 (이벤트 없음)
  Object.assign(element.businessObject, properties);
  
  return element;
}
```

**복잡한 BPMN 구조 생성:**
```javascript
function createComplexElement(parentId, taskData) {
  var elementRegistry = modeler.get('elementRegistry');
  var bpmnFactory = modeler.get('bpmnFactory');
  var elementFactory = modeler.get('elementFactory');
  
  // Business object 생성
  var businessObject = bpmnFactory.create('bpmn:Task', {
    id: taskData.id,
    name: taskData.name
  });
  
  // 조건부 표현식 추가
  if (taskData.condition) {
    var conditionExpression = bpmnFactory.create('bpmn:FormalExpression', {
      body: taskData.condition
    });
    businessObject.conditionExpression = conditionExpression;
  }
  
  // Shape 생성
  var shape = elementFactory.createShape({
    type: 'bpmn:Task',
    businessObject: businessObject,
    x: taskData.x,
    y: taskData.y,
    width: 100,
    height: 80
  });
  
  return shape;
}
```

### Canvas 직접 조작

```javascript
// Canvas에 직접 요소 추가/제거 (이벤트 없음)
function addElementSilently(element, parent) {
  var canvas = modeler.get('canvas');
  var elementRegistry = modeler.get('elementRegistry');
  var graphicsFactory = modeler.get('graphicsFactory');
  
  // Canvas에 직접 추가
  canvas._addElement(element, parent);
  
  // Registry에 그래픽스와 함께 등록
  var gfx = graphicsFactory.create('shape', element);
  elementRegistry.add(element, gfx);
}

function removeElementSilently(elementId) {
  var canvas = modeler.get('canvas');
  var elementRegistry = modeler.get('elementRegistry');
  var element = elementRegistry.get(elementId);
  
  // Canvas에서 직접 제거
  canvas._removeElement(element);
  elementRegistry.remove(element);
}
```

## 3. 이벤트 발생 없이 모델 업데이트 (무한 루프 방지)

### 협업 이벤트 필터링 패턴

```javascript
class CollaborationManager {
  constructor(modeler) {
    this.modeler = modeler;
    this.isProcessingRemoteEvent = false;
    this.remoteEventSources = new Set();
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // 로컬 변경사항만 브로드캐스트
    this.modeler.on('element.changed', (event) => {
      if (this.isProcessingRemoteEvent) return;
      if (this.remoteEventSources.has(event.element.id)) {
        this.remoteEventSources.delete(event.element.id);
        return;
      }
      
      this.broadcastChange(event);
    });
  }
  
  // 원격 변경사항 적용 (무한 루프 방지)
  applyRemoteChanges(changes) {
    this.isProcessingRemoteEvent = true;
    
    try {
      changes.forEach(change => {
        this.remoteEventSources.add(change.elementId);
        this.applyChangeDirectly(change);
      });
    } finally {
      this.isProcessingRemoteEvent = false;
    }
  }
  
  applyChangeDirectly(change) {
    var elementRegistry = this.modeler.get('elementRegistry');
    var element = elementRegistry.get(change.elementId);
    
    if (change.type === 'property') {
      // 직접 businessObject 수정
      Object.assign(element.businessObject, change.properties);
    } else if (change.type === 'position') {
      // 직접 position 수정
      element.x = change.x;
      element.y = change.y;
    }
    
    // 그래픽스 업데이트
    this.updateGraphicsSilently(element);
  }
}
```

### 변경사항 감지 및 중복 방지

```javascript
class ChangeTracker {
  constructor() {
    this.lastKnownState = new Map();
    this.pendingChanges = new Set();
  }
  
  shouldProcessChange(elementId, newProperties) {
    var currentState = this.lastKnownState.get(elementId);
    
    // 실제 변경사항인지 확인
    if (this.deepEqual(currentState, newProperties)) {
      return false;
    }
    
    // 중복 처리 방지
    if (this.pendingChanges.has(elementId)) {
      return false;
    }
    
    this.lastKnownState.set(elementId, { ...newProperties });
    this.pendingChanges.add(elementId);
    
    // 처리 완료 후 제거
    setTimeout(() => this.pendingChanges.delete(elementId), 0);
    
    return true;
  }
  
  deepEqual(obj1, obj2) {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  }
}
```

## 4. "Silent" 업데이트를 위한 내부 API 활용

### 포괄적인 Silent Update 서비스

```javascript
class SilentUpdateService {
  constructor(modeler) {
    this.modeler = modeler;
    this.canvas = modeler.get('canvas');
    this.elementRegistry = modeler.get('elementRegistry');
    this.graphicsFactory = modeler.get('graphicsFactory');
    this.eventBus = modeler.get('eventBus');
  }
  
  updateBusinessObject(elementId, properties) {
    var element = this.elementRegistry.get(elementId);
    if (!element) return null;
    
    // 직접 businessObject 수정
    Object.assign(element.businessObject, properties);
    
    // 그래픽스 업데이트
    this.updateGraphicsSilently(element);
    
    return element;
  }
  
  updateVisualProperties(elementId, visualProps) {
    var element = this.elementRegistry.get(elementId);
    if (!element) return null;
    
    // 시각적 속성 직접 업데이트
    Object.assign(element, visualProps);
    
    // 그래픽스 강제 업데이트
    this.updateGraphicsSilently(element);
    
    return element;
  }
  
  updateGraphicsSilently(element) {
    var gfx = this.elementRegistry.getGraphics(element);
    if (gfx) {
      // 그래픽스 팩토리를 사용한 직접 업데이트
      this.graphicsFactory.update('shape', element, gfx);
    }
  }
  
  batchUpdate(updates) {
    // 렌더링 일시 중단
    this.suspendRendering();
    
    try {
      updates.forEach(update => {
        switch(update.type) {
          case 'business':
            this.updateBusinessObject(update.elementId, update.properties);
            break;
          case 'visual':
            this.updateVisualProperties(update.elementId, update.properties);
            break;
          case 'marker':
            this.canvas.addMarker(update.elementId, update.marker);
            break;
        }
      });
    } finally {
      this.resumeRendering();
    }
  }
  
  suspendRendering() {
    this.canvas._suspendRendering = true;
  }
  
  resumeRendering() {
    this.canvas._suspendRendering = false;
    this.canvas._redraw();
  }
}
```

### EventBus 우회 패턴

```javascript
class EventBusManager {
  constructor(modeler) {
    this.eventBus = modeler.get('eventBus');
    this.originalFire = this.eventBus.fire;
    this.isSilentMode = false;
  }
  
  enableSilentMode() {
    this.isSilentMode = true;
    this.eventBus.fire = () => {}; // 이벤트 발생 억제
  }
  
  disableSilentMode() {
    this.isSilentMode = false;
    this.eventBus.fire = this.originalFire;
  }
  
  withSilentMode(operation) {
    this.enableSilentMode();
    try {
      operation();
    } finally {
      this.disableSilentMode();
    }
  }
}
```

## 5. 실시간 협업 BPMN 에디터 구현 베스트 프랙티스

### 아키텍처 패턴

**권장 아키텍처: Operational Transformation (OT) 기반**

```javascript
class BPMNCollaborationSystem {
  constructor(modeler, websocket) {
    this.modeler = modeler;
    this.websocket = websocket;
    this.silentUpdater = new SilentUpdateService(modeler);
    this.changeTracker = new ChangeTracker();
    this.otEngine = new OperationalTransformEngine();
    
    this.localOperations = [];
    this.remoteOperations = [];
    this.revision = 0;
    
    this.setupWebSocketHandlers();
    this.setupLocalChangeHandlers();
  }
  
  setupWebSocketHandlers() {
    this.websocket.onmessage = (event) => {
      var operation = JSON.parse(event.data);
      this.handleRemoteOperation(operation);
    };
  }
  
  setupLocalChangeHandlers() {
    this.modeler.on('commandStack.changed', (event) => {
      if (event.trigger === 'execute') {
        this.handleLocalChange(event);
      }
    });
  }
  
  handleLocalChange(event) {
    var operation = this.createOperation(event);
    this.localOperations.push(operation);
    
    // 서버로 전송
    this.websocket.send(JSON.stringify({
      type: 'operation',
      operation: operation,
      revision: this.revision
    }));
  }
  
  handleRemoteOperation(data) {
    var operation = data.operation;
    
    // OT 적용하여 충돌 해결
    var transformedOperation = this.otEngine.transform(
      operation,
      this.localOperations,
      this.revision
    );
    
    // Silent update로 적용
    this.applyOperationSilently(transformedOperation);
    
    this.revision = data.revision;
  }
  
  applyOperationSilently(operation) {
    switch(operation.type) {
      case 'updateProperty':
        this.silentUpdater.updateBusinessObject(
          operation.elementId,
          operation.properties
        );
        break;
      case 'moveElement':
        this.silentUpdater.updateVisualProperties(
          operation.elementId,
          { x: operation.x, y: operation.y }
        );
        break;
      case 'createElement':
        this.createElementSilently(operation.element);
        break;
    }
  }
}
```

### 사용자 인식 시스템

```javascript
class UserAwarenessSystem {
  constructor(modeler, websocket) {
    this.modeler = modeler;
    this.websocket = websocket;
    this.activeCursors = new Map();
    
    this.setupMouseTracking();
  }
  
  setupMouseTracking() {
    var canvas = this.modeler.get('canvas');
    var container = canvas.getContainer();
    
    container.addEventListener('mousemove', (event) => {
      var position = this.getCanvasPosition(event);
      this.broadcastCursorPosition(position);
    });
  }
  
  displayRemoteCursor(userId, position) {
    var cursor = this.activeCursors.get(userId);
    if (!cursor) {
      cursor = this.createCursorElement(userId);
      this.activeCursors.set(userId, cursor);
    }
    
    cursor.style.left = position.x + 'px';
    cursor.style.top = position.y + 'px';
  }
  
  createCursorElement(userId) {
    var cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.setAttribute('data-user-id', userId);
    
    var canvas = this.modeler.get('canvas');
    canvas.getContainer().appendChild(cursor);
    
    return cursor;
  }
}
```

## 6. 소스코드 분석을 통한 내부 모델 직접 조작

### 핵심 내부 서비스 활용

```javascript
class DirectModelManipulator {
  constructor(modeler) {
    this.modeler = modeler;
    this.elementRegistry = modeler.get('elementRegistry');
    this.elementFactory = modeler.get('elementFactory');
    this.bpmnFactory = modeler.get('bpmnFactory');
    this.canvas = modeler.get('canvas');
    this.graphicsFactory = modeler.get('graphicsFactory');
  }
  
  // ElementRegistry 직접 조작
  addToRegistry(element, gfx) {
    this.elementRegistry._elements[element.id] = {
      element: element,
      gfx: gfx
    };
  }
  
  removeFromRegistry(elementId) {
    delete this.elementRegistry._elements[elementId];
  }
  
  // Canvas 직접 조작
  addToCanvas(element, parent) {
    var gfx = this.graphicsFactory.create('shape', element);
    this.canvas._addElement(element, parent);
    this.addToRegistry(element, gfx);
    return gfx;
  }
  
  removeFromCanvas(element) {
    this.canvas._removeElement(element);
    this.removeFromRegistry(element.id);
  }
  
  // BusinessObject 직접 생성
  createBusinessObject(type, properties) {
    return this.bpmnFactory.create(type, properties);
  }
  
  // 완전한 요소 생성 (이벤트 없음)
  createCompleteElement(type, properties, position, parent) {
    var businessObject = this.createBusinessObject(type, properties);
    
    var shape = this.elementFactory.createShape({
      type: type,
      businessObject: businessObject,
      x: position.x,
      y: position.y,
      width: properties.width || 100,
      height: properties.height || 80
    });
    
    this.addToCanvas(shape, parent);
    return shape;
  }
}
```

### 모델 트리 직접 조작

```javascript
class ModelTreeManipulator {
  constructor(modeler) {
    this.modeler = modeler;
    this.elementRegistry = modeler.get('elementRegistry');
  }
  
  // Parent-child 관계 직접 설정
  setParentChild(parentId, childId) {
    var parent = this.elementRegistry.get(parentId);
    var child = this.elementRegistry.get(childId);
    
    if (parent && child) {
      child.parent = parent;
      if (!parent.children) parent.children = [];
      parent.children.push(child);
      
      // BusinessObject 레벨에서도 관계 설정
      child.businessObject.$parent = parent.businessObject;
      if (!parent.businessObject.flowElements) {
        parent.businessObject.flowElements = [];
      }
      parent.businessObject.flowElements.push(child.businessObject);
    }
  }
  
  // 연결 관계 직접 설정
  setConnection(sourceId, targetId, connectionId) {
    var source = this.elementRegistry.get(sourceId);
    var target = this.elementRegistry.get(targetId);
    var connection = this.elementRegistry.get(connectionId);
    
    if (source && target && connection) {
      connection.source = source;
      connection.target = target;
      
      if (!source.outgoing) source.outgoing = [];
      if (!target.incoming) target.incoming = [];
      
      source.outgoing.push(connection);
      target.incoming.push(connection);
    }
  }
}
```

## 7. eventBus 우회하면서 캔버스와 모델 동기화 유지

### 동기화 매니저

```javascript
class SynchronizationManager {
  constructor(modeler) {
    this.modeler = modeler;
    this.canvas = modeler.get('canvas');
    this.elementRegistry = modeler.get('elementRegistry');
    this.graphicsFactory = modeler.get('graphicsFactory');
    this.eventBus = modeler.get('eventBus');
    
    this.syncQueue = [];
    this.isProcessingSync = false;
  }
  
  // 동기화 큐에 작업 추가
  queueSync(operation) {
    this.syncQueue.push(operation);
    this.processQueue();
  }
  
  async processQueue() {
    if (this.isProcessingSync) return;
    
    this.isProcessingSync = true;
    
    while (this.syncQueue.length > 0) {
      var operation = this.syncQueue.shift();
      await this.processOperation(operation);
    }
    
    this.isProcessingSync = false;
  }
  
  async processOperation(operation) {
    switch(operation.type) {
      case 'updateElement':
        this.updateElementSync(operation.elementId, operation.changes);
        break;
      case 'createElement':
        this.createElementSync(operation.element);
        break;
      case 'removeElement':
        this.removeElementSync(operation.elementId);
        break;
    }
  }
  
  updateElementSync(elementId, changes) {
    var element = this.elementRegistry.get(elementId);
    if (!element) return;
    
    // 1. 모델 업데이트
    if (changes.businessObject) {
      Object.assign(element.businessObject, changes.businessObject);
    }
    
    // 2. 다이어그램 속성 업데이트
    if (changes.visual) {
      Object.assign(element, changes.visual);
    }
    
    // 3. 그래픽스 업데이트
    this.updateGraphics(element);
    
    // 4. 최소한의 이벤트 발생 (필요시)
    this.fireMinimalEvent(element);
  }
  
  updateGraphics(element) {
    var gfx = this.elementRegistry.getGraphics(element);
    if (gfx) {
      this.graphicsFactory.update('shape', element, gfx);
    }
  }
  
  fireMinimalEvent(element) {
    // 필요한 경우에만 최소한의 이벤트 발생
    this.eventBus.fire('element.changed', {
      element: element,
      source: 'collaboration'
    });
  }
  
  // 캔버스 강제 리렌더링
  forceRedraw() {
    this.canvas._redraw();
  }
  
  // 전체 동기화 검증
  validateSync() {
    var elements = this.elementRegistry.getAll();
    var inconsistencies = [];
    
    elements.forEach(element => {
      var gfx = this.elementRegistry.getGraphics(element);
      if (!gfx) {
        inconsistencies.push({
          elementId: element.id,
          issue: 'missing_graphics'
        });
      }
    });
    
    if (inconsistencies.length > 0) {
      console.warn('Synchronization inconsistencies found:', inconsistencies);
      this.fixInconsistencies(inconsistencies);
    }
  }
  
  fixInconsistencies(inconsistencies) {
    inconsistencies.forEach(issue => {
      if (issue.issue === 'missing_graphics') {
        var element = this.elementRegistry.get(issue.elementId);
        var gfx = this.graphicsFactory.create('shape', element);
        this.elementRegistry.updateGraphics(element, gfx);
      }
    });
  }
}
```

## 통합 협업 시스템 구현 예제

```javascript
class BPMNCollaborationImplementation {
  constructor(containerEl, websocketUrl) {
    this.modeler = new BpmnModeler({
      container: containerEl,
      additionalModules: [
        SilentCommandStackModule
      ]
    });
    
    this.websocket = new WebSocket(websocketUrl);
    this.collaborationManager = new CollaborationManager(this.modeler);
    this.silentUpdater = new SilentUpdateService(this.modeler);
    this.syncManager = new SynchronizationManager(this.modeler);
    this.awarenessSystem = new UserAwarenessSystem(this.modeler, this.websocket);
    
    this.setupCollaboration();
  }
  
  setupCollaboration() {
    // 웹소켓 이벤트 핸들러
    this.websocket.onmessage = (event) => {
      var data = JSON.parse(event.data);
      
      switch(data.type) {
        case 'model_change':
          this.handleRemoteModelChange(data.changes);
          break;
        case 'cursor_position':
          this.awarenessSystem.displayRemoteCursor(data.userId, data.position);
          break;
        case 'user_selection':
          this.highlightRemoteSelection(data.userId, data.elementIds);
          break;
      }
    };
    
    // 로컬 변경사항 감지
    this.modeler.on('commandStack.changed', (event) => {
      if (!this.collaborationManager.isProcessingRemoteEvent) {
        this.broadcastLocalChange(event);
      }
    });
  }
  
  handleRemoteModelChange(changes) {
    // 배치 업데이트로 처리
    this.silentUpdater.batchUpdate(changes);
    
    // 동기화 검증
    this.syncManager.validateSync();
  }
  
  broadcastLocalChange(event) {
    var operation = this.createOperationFromEvent(event);
    this.websocket.send(JSON.stringify({
      type: 'model_change',
      operation: operation,
      userId: this.getCurrentUserId()
    }));
  }
  
  createOperationFromEvent(event) {
    // commandStack 이벤트를 협업 operation으로 변환
    return {
      type: 'element_update',
      elementId: event.element?.id,
      changes: event.context,
      timestamp: Date.now()
    };
  }
}

// 사용법
var collaboration = new BPMNCollaborationImplementation(
  '#canvas-container',
  'ws://localhost:8080/collaborate'
);
```

## 핵심 주의사항

1. **버전 호환성**: 내부 API는 bpmn-js 버전 업데이트시 변경될 수 있으므로 버전 관리가 중요합니다.

2. **메모리 관리**: 직접 조작시 메모리 누수를 방지하기 위해 적절한 정리 작업이 필요합니다.

3. **유효성 검증**: 내부 API 우회시 BPMN 규칙 검증이 생략되므로 별도 검증 로직이 필요합니다.

4. **성능 최적화**: 대량 업데이트시 렌더링 일시 중단과 배치 처리가 필수입니다.

5. **에러 처리**: 내부 API 사용시 예외 상황에 대한 견고한 에러 처리가 중요합니다.

이 가이드를 통해 bpmn-js에서 효과적인 협업 시스템을 구현하여 실시간 다중 사용자 BPMN 편집 환경을 구축할 수 있습니다.