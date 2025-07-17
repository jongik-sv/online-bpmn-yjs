# 연결선 동기화 문제 디버깅 분석

## 현재 상태 확인

### ✅ 방안 1 적용 확인 (라인 1697-1700)
```javascript
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

### ✅ 방안 2 적용 확인 (라인 910-916)
```javascript
// businessObject 생성 - 강제로 sourceRef/targetRef 설정
const businessObjectData = {
  id: connectionId,
  sourceRef: source.businessObject,  // ✅ 강제 설정
  targetRef: target.businessObject,  // ✅ 강제 설정
  // Y.js에서 전달받은 추가 정보 병합
  ...(connectionData.businessObject || {})
};
```

### ❌ 방안 3은 불필요
방안 1에서 이미 해결되므로 중복 로직입니다.

## 잠재적 문제점 분석

### 1. sourceRef/targetRef 값 타입 불일치

**문제**: 방안 1에서는 ID 문자열을 전송하지만, 방안 2에서는 businessObject 객체를 사용합니다.

```javascript
// 방안 1: ID 문자열 전송
sourceRef: element.businessObject.sourceRef?.id || element.source?.id,

// 방안 2: businessObject 객체 사용  
sourceRef: source.businessObject,
```

**해결**: Y.js에서 전달받은 데이터를 businessObject로 변환해야 합니다.

### 2. Y.js 동기화 시점 문제

**문제**: 연결선이 생성된 직후 Y.js로 동기화될 때, `businessObject.sourceRef`가 아직 설정되지 않았을 수 있습니다.

### 3. 디버깅 로그 부족

현재 연결선 생성 과정에서 중요한 정보들이 로깅되지 않아 문제 파악이 어렵습니다.

## 추가 디버깅 방법

### 1. Y.js 동기화 데이터 확인

```javascript
// syncElementToYjs() 함수에 로깅 추가 (1697-1700라인 수정)
...(element.type && element.type.includes('SequenceFlow') ? {
  sourceRef: element.businessObject.sourceRef?.id || element.source?.id,
  targetRef: element.businessObject.targetRef?.id || element.target?.id
} : {})

// 로깅 추가
if (element.type && element.type.includes('SequenceFlow')) {
  console.log(`🔍 Y.js 연결선 동기화:`, {
    id: element.id,
    sourceRef: element.businessObject.sourceRef?.id || element.source?.id,
    targetRef: element.businessObject.targetRef?.id || element.target?.id,
    hasBusinessObjectSourceRef: !!element.businessObject.sourceRef,
    hasBusinessObjectTargetRef: !!element.businessObject.targetRef,
    sourceId: element.source?.id,
    targetId: element.target?.id
  });
}
```

### 2. 원격 연결선 생성 시 데이터 확인

```javascript
// createConnection() 함수에 로깅 추가 (915라인 이후)
console.log(`🔍 원격 연결선 생성 데이터:`, {
  connectionId,
  connectionData,
  businessObjectData,
  hasConnectionDataBusinessObject: !!connectionData.businessObject,
  connectionDataBusinessObject: connectionData.businessObject
});
```

### 3. 최종 businessObject 확인

```javascript
// createConnection() 함수에 추가 로깅 (930라인 이후)
console.log(`🔍 생성된 연결선 확인:`, {
  connectionId: connection.id,
  businessObjectId: connection.businessObject.id,
  businessObjectSourceRef: connection.businessObject.sourceRef?.id,
  businessObjectTargetRef: connection.businessObject.targetRef?.id,
  sourceIncoming: connection.source.businessObject.incoming?.map(i => i.id),
  sourceOutgoing: connection.source.businessObject.outgoing?.map(o => o.id),
  targetIncoming: connection.target.businessObject.incoming?.map(i => i.id),
  targetOutgoing: connection.target.businessObject.outgoing?.map(o => o.id)
});
```

## 수정 제안

### 제안 1: createConnection()에서 sourceRef/targetRef 처리 개선

```javascript
// createConnection() 함수 수정 (910-916라인)
const businessObjectData = {
  id: connectionId,
  sourceRef: source.businessObject,
  targetRef: target.businessObject
};

// Y.js에서 전달받은 businessObject 정보가 있으면 병합 (ID 제외)
if (connectionData.businessObject) {
  const { id, sourceRef, targetRef, ...otherProps } = connectionData.businessObject;
  Object.assign(businessObjectData, otherProps);
  
  console.log(`🔍 Y.js businessObject 병합:`, {
    receivedSourceRef: sourceRef,
    receivedTargetRef: targetRef,
    otherProps
  });
}

const businessObject = bpmnFactory.create('bpmn:SequenceFlow', businessObjectData);
```

### 제안 2: modeling.createConnection() 호출 후 관계 검증

```javascript
// createConnection() 함수에 검증 로직 추가 (930라인 이후)
const connection = modeling.createConnection(
  source,
  target,
  newConnectionObject,
  source.parent
);

// 연결 관계 검증
setTimeout(() => {
  const sourceOutgoing = source.businessObject.outgoing || [];
  const targetIncoming = target.businessObject.incoming || [];
  
  const sourceHasConnection = sourceOutgoing.some(flow => flow.id === connectionId);
  const targetHasConnection = targetIncoming.some(flow => flow.id === connectionId);
  
  console.log(`🔍 연결 관계 검증:`, {
    connectionId,
    sourceHasConnection,
    targetHasConnection,
    sourceOutgoingIds: sourceOutgoing.map(f => f.id),
    targetIncomingIds: targetIncoming.map(f => f.id)
  });
  
  if (!sourceHasConnection || !targetHasConnection) {
    console.warn(`⚠️ 연결 관계 누락 감지!`, {
      connectionId,
      sourceHasConnection,
      targetHasConnection
    });
  }
}, 100);
```

### 제안 3: Y.js 데이터 전송 시 타입 통일

```javascript
// syncElementToYjs() 함수 수정 (1697-1700라인)
...(element.type && element.type.includes('SequenceFlow') ? {
  sourceRef: element.businessObject.sourceRef?.id || element.source?.id,
  targetRef: element.businessObject.targetRef?.id || element.target?.id,
  // 추가: 원본 businessObject 전체 정보도 포함
  fullBusinessObject: {
    id: element.businessObject.id,
    name: element.businessObject.name,
    sourceRef: element.businessObject.sourceRef?.id,
    targetRef: element.businessObject.targetRef?.id
  }
} : {})
```

## 검증 시나리오

### 1. 로컬 연결선 생성 테스트
1. 로컬에서 연결선 생성
2. Y.js 동기화 데이터 확인
3. 원격에서 동일한 데이터 수신 확인
4. 원격에서 연결선 생성 성공 확인
5. 양쪽 XML 비교

### 2. 단계별 로깅 확인
1. `syncElementToYjs()` 로그 확인
2. Y.js 전송 데이터 확인  
3. `applyConnectionChange()` 로그 확인
4. `createConnection()` 로그 확인
5. 최종 연결 관계 검증 로그 확인

이 디버깅 방법들을 통해 정확히 어느 지점에서 연결 관계가 누락되는지 파악할 수 있습니다.