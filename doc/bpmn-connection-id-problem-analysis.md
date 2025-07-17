# BPMN.js 연결선 생성 시 사용자 지정 ID 무시 문제 분석

## 문제 상황

`client/src/demo.js`의 `createConnection()` 함수에서 다음 코드로 연결선을 생성할 때, 사용자가 지정한 ID가 무시되고 BPMN.js가 자동으로 생성한 ID가 사용되는 문제가 발생합니다.

```javascript
const newConnectionObject = elementFactory.create('connection', {
  id: connectionId, // <-- 이 ID가 무시됨
  type: 'bpmn:SequenceFlow',
  source: source,
  target: target,
});
```

## 근본 원인 분석

### 1. 연결선 생성 호출 체인

```
demo.js:createConnection()
  ↓
elementFactory.create('connection', attrs)
  ↓
ElementFactory.prototype.create() (line 114)
  ↓
ElementFactory.prototype.createElement() (line 152)
  ↓
BpmnFactory.prototype.create() (line 166)
  ↓
BpmnFactory.prototype._ensureId() (line 102)
  ↓
ID가 덮어씌워짐
```

### 2. 핵심 문제 지점

**ElementFactory.js의 createElement() 메서드 (라인 161-166):**
```javascript
if (!businessObject) {
  if (!attrs.type) {
    throw new Error('no shape type specified');
  }
  
  businessObject = this._bpmnFactory.create(attrs.type); // <-- 문제 지점
  
  ensureCompatDiRef(businessObject);
}
```

**문제점:**
- `attrs.id`가 `businessObject` 생성 시 전달되지 않음
- `this._bpmnFactory.create(attrs.type)`는 `attrs.type`만 전달하고 `attrs.id`는 무시됨
- 결과적으로 `BpmnFactory._ensureId()`에서 새로운 ID가 자동 생성됨

### 3. BpmnFactory._ensureId()의 동작

**BpmnFactory.js의 _ensureId() 메서드 (라인 62-89):**
```javascript
BpmnFactory.prototype._ensureId = function(element) {
  if (element.id) {
    this._model.ids.claim(element.id, element);
    return;
  }
  
  // 연결선의 경우 'Flow_' 접두사 사용
  if (isAny(element, [ 'bpmn:SequenceFlow', 'bpmn:MessageFlow' ])) {
    prefix = 'Flow';
  }
  
  prefix += '_';
  
  if (!element.id && this._needsId(element)) {
    element.id = this._model.ids.nextPrefixed(prefix, element); // 자동 ID 생성
  }
};
```

**동작 과정:**
1. `element.id`가 없으면 새로운 ID 생성
2. `SequenceFlow`의 경우 `Flow_` 접두사 사용
3. `this._model.ids.nextPrefixed()`로 유니크한 ID 생성 (예: `Flow_1`, `Flow_2`)

### 4. 원인 요약

1. **ElementFactory.createElement()**: `attrs.id`를 `businessObject` 생성 시 전달하지 않음
2. **BpmnFactory.create()**: `attrs` 전체가 아닌 `type`만 받아서 처리
3. **BpmnFactory._ensureId()**: `businessObject`에 ID가 없으면 자동으로 새 ID 생성
4. **최종 결과**: 사용자 지정 ID가 무시되고 `Flow_1`, `Flow_2` 등의 자동 생성 ID 사용

## 해결 방안

### 방안 1: businessObject 직접 생성 (권장)

```javascript
createConnection(connectionId, connectionData) {
  try {
    const elementFactory = this.modeler.get('elementFactory');
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');
    const bpmnFactory = this.modeler.get('bpmnFactory');
    
    // 이미 해당 ID로 연결이 존재하는지 확인
    const existingConnection = elementRegistry.get(connectionId);
    if (existingConnection) {
      console.log(`연결이 이미 존재함: ${connectionId}, 생성 스킵`);
      return;
    }
    
    const source = elementRegistry.get(connectionData.source);
    const target = elementRegistry.get(connectionData.target);
    
    if (source && target) {
      // 1. businessObject를 원하는 ID로 미리 생성
      const businessObject = bpmnFactory.create('bpmn:SequenceFlow', {
        id: connectionId,
        sourceRef: source.businessObject,
        targetRef: target.businessObject
      });
      
      // 2. 생성된 businessObject를 사용하여 연결 생성
      const newConnectionObject = elementFactory.create('connection', {
        id: connectionId,
        type: 'bpmn:SequenceFlow',
        businessObject: businessObject, // 미리 생성된 businessObject 사용
        source: source,
        target: target,
      });
      
      // 3. 모델링으로 연결 생성
      const connection = modeling.createConnection(
        source,
        target,
        newConnectionObject,
        source.parent
      );
      
      console.log('연결 성공:', connection);
    } else {
      console.error('연결 대상을 찾지 못했습니다:', source, target);
    }
  } catch (error) {
    console.error('연결 생성 오류:', error);
  }
}
```

### 방안 2: modeling.connect() 사용

```javascript
createConnection(connectionId, connectionData) {
  try {
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');
    const bpmnFactory = this.modeler.get('bpmnFactory');
    
    const source = elementRegistry.get(connectionData.source);
    const target = elementRegistry.get(connectionData.target);
    
    if (source && target) {
      // businessObject를 원하는 ID로 미리 생성
      const businessObject = bpmnFactory.create('bpmn:SequenceFlow', {
        id: connectionId,
        sourceRef: source.businessObject,
        targetRef: target.businessObject
      });
      
      // modeling.connect()로 연결 생성
      const connection = modeling.connect(source, target, {
        type: 'bpmn:SequenceFlow',
        businessObject: businessObject
      });
      
      console.log('연결 성공:', connection);
    }
  } catch (error) {
    console.error('연결 생성 오류:', error);
  }
}
```

### 방안 3: 생성 후 ID 업데이트

```javascript
createConnection(connectionId, connectionData) {
  try {
    const elementRegistry = this.modeler.get('elementRegistry');
    const modeling = this.modeler.get('modeling');
    
    const source = elementRegistry.get(connectionData.source);
    const target = elementRegistry.get(connectionData.target);
    
    if (source && target) {
      // 1. 먼저 기본 방식으로 연결 생성
      const connection = modeling.connect(source, target, {
        type: 'bpmn:SequenceFlow'
      });
      
      // 2. 생성된 연결의 ID를 원하는 값으로 변경
      modeling.updateProperties(connection, { id: connectionId });
      
      console.log('연결 성공:', connection);
    }
  } catch (error) {
    console.error('연결 생성 오류:', error);
  }
}
```

## 권장 해결 방안

**방안 1 (businessObject 직접 생성)**을 권장합니다.

### 장점:
- BPMN.js의 내부 로직을 따라 안전하게 ID 설정
- ID 충돌 관리 시스템과 호환
- 가장 확실하게 원하는 ID 보장

### 단점:
- 코드가 약간 복잡해짐
- BPMN.js 내부 API 의존성 증가

## 테스트 방법

```javascript
// 테스트 코드
const connectionId = 'MY_CUSTOM_CONNECTION_ID';
const connectionData = {
  source: 'StartEvent_1',
  target: 'Task_1'
};

createConnection(connectionId, connectionData);

// 검증
const elementRegistry = this.modeler.get('elementRegistry');
const createdConnection = elementRegistry.get(connectionId);
console.log('생성된 연결 ID:', createdConnection?.id);
console.log('BusinessObject ID:', createdConnection?.businessObject?.id);
```

## 결론

BPMN.js에서 연결선 생성 시 사용자 지정 ID가 무시되는 문제는 `ElementFactory.createElement()`에서 `businessObject` 생성 시 ID를 전달하지 않기 때문입니다. 이를 해결하기 위해서는 `businessObject`를 미리 원하는 ID로 생성한 후 `elementFactory.create()`에 전달하는 방법이 가장 안전하고 확실합니다.