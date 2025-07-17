# BPMN.js modeling.connect() 실행 경로 추적

## 개요

이 문서는 `client/src/demo.js`에서 `modeling.connect()` 메서드를 호출했을 때의 완전한 실행 경로를 추적한 결과입니다.

## 호출 코드

```javascript
// demo.js:960
const connection = modeling.connect(source, target, { 
    type: connectionData.type || 'bpmn:SequenceFlow', 
    id: connectionId 
});
```

## 완전한 실행 경로

### 1. BPMN.js Modeling.connect() 
**파일**: `bpmn-js/lib/features/modeling/Modeling.js:122-135`

```javascript
Modeling.prototype.connect = function(source, target, attrs, hints) {
  var bpmnRules = this._bpmnRules;

  if (!attrs) {
    attrs = bpmnRules.canConnect(source, target);
  }

  if (!attrs) {
    return;
  }

  return this.createConnection(source, target, attrs, source.parent, hints);
};
```

**역할**:
- BPMN 규칙 검증 (`bpmnRules.canConnect()`)
- attrs가 없으면 자동으로 규칙에서 생성
- diagram-js의 `createConnection()` 호출

### 2. diagram-js Modeling.createConnection()
**파일**: `diagram-js/lib/features/modeling/Modeling.js:314-337`

```javascript
Modeling.prototype.createConnection = function(source, target, parentIndex, connection, parent, hints) {
  if (typeof parentIndex === 'object') {
    hints = parent;
    parent = connection;
    connection = parentIndex;
    parentIndex = undefined;
  }

  connection = this._create('connection', connection);

  var context = {
    source: source,
    target: target,
    parent: parent,
    parentIndex: parentIndex,
    connection: connection,
    hints: hints
  };

  this._commandStack.execute('connection.create', context);

  return context.connection;
};
```

**파라미터 매핑 과정**:
1. **BPMN.js 호출**: `createConnection(source, target, attrs, source.parent, hints)`
2. **diagram-js 함수 시그니처**: `function(source, target, parentIndex, connection, parent, hints)`
3. **초기 매핑**:
   - `source` → `source`
   - `target` → `target`
   - `attrs` → `parentIndex` (객체)
   - `source.parent` → `connection`
   - `hints` → `parent`
   - `undefined` → `hints`
4. **재정렬 로직** (line 316-321): `typeof parentIndex === 'object'`이므로:
   - `hints = parent` (즉, `hints = hints`)
   - `parent = connection` (즉, `parent = source.parent`)
   - `connection = parentIndex` (즉, `connection = attrs`)
   - `parentIndex = undefined` (특정 인덱스 지정 없음)

5. **최종 파라미터**:
   - `source` = source
   - `target` = target
   - `connection` = attrs (ID 및 type 포함)
   - `parent` = source.parent
   - `hints` = hints
   - `parentIndex` = undefined

**최종 결과**:
- ElementFactory를 통한 connection 객체 생성
- CommandStack을 통한 명령 실행

### 3. ElementFactory.create()
**파일**: `diagram-js/lib/core/ElementFactory.js:102-111`

```javascript
ElementFactory.prototype.create = function(type, attrs) {
  attrs = assign({}, attrs || {});

  if (!attrs.id) {
    attrs.id = type + '_' + (this._uid++);
  }

  return create(type, attrs);
};
```

**역할**:
- **ID 처리**: 제공된 ID가 있으면 보존, 없으면 자동 생성
- 실제 connection 객체 생성

### 4. CreateConnectionHandler.execute()
**파일**: `diagram-js/lib/features/modeling/cmd/CreateConnectionHandler.js:39-67`

```javascript
CreateConnectionHandler.prototype.execute = function(context) {
  var connection = context.connection,
      source = context.source,
      target = context.target,
      parent = context.parent,
      parentIndex = context.parentIndex,
      hints = context.hints;

  if (!source || !target) {
    throw new Error('source and target required');
  }

  if (!parent) {
    throw new Error('parent required');
  }

  connection.source = source;
  connection.target = target;

  if (!connection.waypoints) {
    connection.waypoints = this._layouter.layoutConnection(connection, hints);
  }

  // add connection
  this._canvas.addConnection(connection, parent, parentIndex);

  return connection;
};
```

**역할**:
- source/target 유효성 검사
- connection 객체에 source, target 속성 설정
- waypoints 자동 레이아웃 생성
- Canvas에 connection 추가

### 5. Canvas.addConnection()
**파일**: `diagram-js/lib/core/Canvas.js:957-959`

```javascript
Canvas.prototype.addConnection = function(connection, parent, parentIndex) {
  return this._addElement('connection', connection, parent, parentIndex);
};
```

**역할**:
- `_addElement()` 메서드로 위임

### 6. Canvas._addElement()
**파일**: `diagram-js/lib/core/Canvas.js:909-933`

```javascript
Canvas.prototype._addElement = function(type, element, parent, parentIndex) {
  parent = parent || this.getRootElement();

  const eventBus = this._eventBus,
        graphicsFactory = this._graphicsFactory;

  this._ensureValid(type, element);

  eventBus.fire(type + '.add', { element: element, parent: parent });

  this._setParent(element, parent, parentIndex);

  // create graphics
  const gfx = graphicsFactory.create(type, element, parentIndex);

  this._elementRegistry.add(element, gfx);

  // update its visual
  graphicsFactory.update(type, element, gfx);

  eventBus.fire(type + '.added', { element: element, gfx: gfx });

  return element;
};
```

**역할**:
- 부모 요소 설정
- 이벤트 발생 (`connection.add`)
- 부모-자식 관계 설정
- 그래픽 요소 생성 (SVG)
- ElementRegistry에 등록
- 시각적 업데이트
- 완료 이벤트 발생 (`connection.added`)

## 핵심 포인트

### 1. ID 처리 메커니즘
- `ElementFactory.create()` (line 106-108)에서 ID 처리
- 제공된 ID가 있으면 **보존**
- 없으면 `type + '_' + uid` 형태로 자동 생성

### 2. Command Pattern 사용
- 모든 modeling 작업은 CommandStack을 통해 실행
- Undo/Redo 기능 지원
- 트랜잭션 형태로 작업 관리

### 3. 이벤트 기반 아키텍처
- 각 단계에서 이벤트 발생
- 다른 컴포넌트들이 이벤트에 반응하여 추가 작업 수행
- `connection.add` → `connection.added` 순서

### 4. 레이어드 아키텍처
- **BPMN.js Layer**: BPMN 특화 로직 (규칙 검증)
- **diagram-js Layer**: 일반적인 다이어그램 로직
- **Canvas Layer**: 실제 렌더링 및 DOM 조작

### 5. 의존성 주입
- 각 서비스는 필요한 의존성을 주입받아 사용
- `$inject` 배열로 의존성 명시
- EventBus, ElementFactory, CommandStack, Canvas 등

## 성능 고려사항

1. **동기 실행**: 모든 과정이 동기적으로 실행됨
2. **이벤트 오버헤드**: 각 단계에서 이벤트 발생으로 인한 오버헤드
3. **DOM 조작**: GraphicsFactory에서 실제 SVG 요소 생성
4. **메모리 관리**: ElementRegistry에서 요소 참조 관리

## 확장 포인트

1. **이벤트 리스너**: `connection.add`, `connection.added` 이벤트 활용
2. **Command Handler**: 커스텀 connection 생성 로직
3. **GraphicsFactory**: 커스텀 렌더링 로직
4. **Rules**: 커스텀 연결 규칙

## 디버깅 팁

1. **이벤트 로깅**: EventBus 이벤트를 로깅하여 실행 흐름 추적
2. **Command Stack**: 명령 스택 상태 확인
3. **ElementRegistry**: 등록된 요소 상태 확인
4. **Canvas 상태**: SVG DOM 구조 검사

---

**작성일**: 2025-07-16  
**기준 버전**: BPMN.js (client/node_modules 기준)  
**추적 시작점**: `client/src/demo.js:960`