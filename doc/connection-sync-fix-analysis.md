# 연결선 Y.js 동기화 시 incoming/outgoing 관계 누락 문제 해결

## 문제 상황

로컬에서 연결선을 생성할 때는 정상적으로 소스/타겟 요소 간 연결 관계가 설정되지만, 원격에서는 연결 관계가 누락되는 문제가 발생합니다.

### 로컬 XML (정상)
```xml
<bpmn:task id="Task_1" name="작업 1">
  <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
  <bpmn:outgoing>SequenceFlow_2</bpmn:outgoing>
  <bpmn:outgoing>Flow_0ojdmoq</bpmn:outgoing>  <!-- ✅ 연결 관계 설정됨 -->
</bpmn:task>

<bpmn:task id="Activity_134oxqb">
  <bpmn:incoming>Flow_0ojdmoq</bpmn:incoming>  <!-- ✅ 연결 관계 설정됨 -->
</bpmn:task>
```

### 원격 XML (문제)
```xml
<bpmn:task id="Task_1" name="작업 1">
  <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
  <bpmn:outgoing>SequenceFlow_2</bpmn:outgoing>
  <!-- ❌ Flow_0ojdmoq outgoing 누락 -->
</bpmn:task>

<bpmn:task id="Activity_134oxqb" />
<!-- ❌ Flow_0ojdmoq incoming 누락 -->
```

## 원인 분석

### 1. 로컬 연결선 생성 (정상 동작)

**createConnection() 함수 (907-912라인)**:
```javascript
const businessObject = bpmnFactory.create('bpmn:SequenceFlow', {
  id: connectionId,
  sourceRef: source.businessObject,   // ✅ 소스 참조 설정
  targetRef: target.businessObject    // ✅ 타겟 참조 설정
});
```

### 2. Y.js 동기화 시 정보 누락

**syncElementToYjs() 함수 (1687-1690라인)**:
```javascript
businessObject: element.businessObject ? {
  id: element.id,
  name: element.businessObject.name || '',
  // ❌ sourceRef/targetRef 누락!
} : {},
```

**Y.js 연결 데이터 구조 (1703-1712라인)**:
```javascript
const newData = {
  type: element.type,
  source: element.source?.id,         // ID만 전송
  target: element.target?.id,         // ID만 전송
  businessObject: elementData.businessObject,  // sourceRef/targetRef 없음
  waypoints: element.waypoints ? element.waypoints.map(wp => ({
    x: wp.x,
    y: wp.y
  })) : []
};
```

### 3. 원격 연결선 생성 시 참조 누락

원격에서 `applyConnectionChange()` → `createConnection()` 호출 시:
- `connectionData.businessObject`에 `sourceRef`/`targetRef` 정보 없음
- 결과적으로 BPMN 요소 간 연결 관계 미설정

## 해결 방안

### 방안 1: Y.js 동기화 시 sourceRef/targetRef 정보 포함 (권장)

```javascript
// syncElementToYjs() 함수 수정 (1687-1690라인)
businessObject: element.businessObject ? {
  id: element.id,
  name: element.businessObject.name || '',
  // ✅ 연결선인 경우 sourceRef/targetRef 추가
  ...(element.type && element.type.includes('SequenceFlow') ? {
    sourceRef: element.businessObject.sourceRef?.id || element.source?.id,
    targetRef: element.businessObject.targetRef?.id || element.target?.id
  } : {})
} : {},
```

### 방안 2: createConnection() 함수에서 참조 재설정

```javascript
// createConnection() 함수 수정
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
      // businessObject 생성 - 강제로 sourceRef/targetRef 설정
      const businessObjectData = {
        id: connectionId,
        sourceRef: source.businessObject,  // ✅ 강제 설정
        targetRef: target.businessObject,  // ✅ 강제 설정
        // Y.js에서 전달받은 추가 정보 병합
        ...(connectionData.businessObject || {})
      };
      
      const businessObject = bpmnFactory.create('bpmn:SequenceFlow', businessObjectData);
      
      // 연결 생성
      const newConnectionObject = elementFactory.create('connection', {
        id: connectionId,
        type: 'bpmn:SequenceFlow',
        businessObject: businessObject,
        source: source,
        target: target,
      });
      
      const connection = modeling.createConnection(
        source,
        target,
        newConnectionObject,
        source.parent
      );
      
      console.log('연결 성공:', connection);
      console.log('BusinessObject sourceRef:', connection.businessObject.sourceRef?.id);
      console.log('BusinessObject targetRef:', connection.businessObject.targetRef?.id);
    } else {
      console.error('연결 대상을 찾지 못했습니다:', source, target);
    }
  } catch (error) {
    console.error('연결 생성 오류:', error);
  }
}
```

### 방안 3: 연결선 전용 동기화 로직 추가

```javascript
// syncElementToYjs() 함수에서 연결선 처리 강화
if (element.type && element.type.includes('SequenceFlow')) {
  const existingData = this.yConnections.get(element.id);
  const newData = {
    type: element.type,
    source: element.source?.id,
    target: element.target?.id,
    businessObject: {
      id: element.id,
      name: element.businessObject?.name || '',
      // ✅ 연결선 전용 정보 추가
      sourceRef: element.businessObject?.sourceRef?.id || element.source?.id,
      targetRef: element.businessObject?.targetRef?.id || element.target?.id
    },
    waypoints: element.waypoints ? element.waypoints.map(wp => ({
      x: wp.x,
      y: wp.y
    })) : []
  };
  
  // 중복 동기화 방지를 위한 추가 체크
  const lastSyncedData = this.lastSyncedData.get(element.id);
  const isDataChanged = !this.isDataEqual(existingData, newData);
  const isNewSync = !this.isDataEqual(lastSyncedData, newData);
  
  if (isDataChanged && isNewSync) {
    // 트랜잭션으로 감싸서 origin 설정
    this.yjsDoc.transact(() => {
      this.yConnections.set(element.id, newData);
    }, this.clientId);
    this.lastSyncedData.set(element.id, JSON.parse(JSON.stringify(newData)));
    console.log('Y.js 연결 동기화됨:', element.id);
  }
}
```

## 권장 구현 순서

1. **방안 1 구현**: Y.js 동기화 시 sourceRef/targetRef 정보 포함
2. **방안 2 적용**: createConnection에서 참조 재설정 로직 추가
3. **테스트 및 검증**: 원격에서 연결선 생성 시 incoming/outgoing 관계 정상 설정 확인

## 검증 방법

```javascript
// 테스트 코드
const connectionId = 'Flow_0ojdmoq';
const connectionData = {
  source: 'Task_1',
  target: 'Activity_134oxqb',
  businessObject: {
    sourceRef: 'Task_1',
    targetRef: 'Activity_134oxqb'
  }
};

// 연결 생성
createConnection(connectionId, connectionData);

// XML 확인
const { xml } = await this.modeler.saveXML({ format: true });
console.log('생성된 XML:', xml);

// Task_1에 <bpmn:outgoing>Flow_0ojdmoq</bpmn:outgoing> 있는지 확인
// Activity_134oxqb에 <bpmn:incoming>Flow_0ojdmoq</bpmn:incoming> 있는지 확인
```

## 예상 결과

방안 구현 후 원격에서도 로컬과 동일하게 연결 관계가 설정됩니다:

```xml
<bpmn:task id="Task_1" name="작업 1">
  <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
  <bpmn:outgoing>SequenceFlow_2</bpmn:outgoing>
  <bpmn:outgoing>Flow_0ojdmoq</bpmn:outgoing>  <!-- ✅ 복원됨 -->
</bpmn:task>

<bpmn:task id="Activity_134oxqb">
  <bpmn:incoming>Flow_0ojdmoq</bpmn:incoming>  <!-- ✅ 복원됨 -->
</bpmn:task>
```

이 해결방안으로 로컬과 원격 간 연결선 동기화가 완전히 동일하게 동작할 것입니다.