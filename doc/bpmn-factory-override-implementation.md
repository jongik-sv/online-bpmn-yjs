# BpmnFactory 오버라이드를 통한 근본적 ID 제어 구현

## 개요

연결선 ID 문제를 근본적으로 해결하기 위해 BPMN.js의 핵심 ID 생성 로직인 `BpmnFactory._ensureId()`를 오버라이드하는 방법입니다.

## 아키텍처

### 현재 ID 생성 체인
```
demo.js:createConnection()
  ↓
elementFactory.create('connection', attrs)
  ↓
ElementFactory.prototype.createElement() (line 152)
  ↓
BpmnFactory.prototype.create() (line 99)
  ↓
BpmnFactory.prototype._ensureId() (line 62) ← 여기를 오버라이드!
  ↓
moddle.ids.nextPrefixed() (자동 ID 생성)
```

### 새로운 제어 체인
```
demo.js:createConnection()
  ↓
elementFactory.create('connection', attrs)
  ↓
ElementFactory.prototype.createElement()
  ↓
CustomBpmnFactory.prototype.create()
  ↓
CustomBpmnFactory.prototype._ensureId() ← 커스텀 로직!
  ↓
generateCollaborativeId() (원하는 ID 생성)
```

## 핵심 구현

### 1. CustomBpmnFactory 클래스

```javascript
export default class CustomBpmnFactory extends BpmnFactory {
  /**
   * 핵심 오버라이드: _ensureId 메서드
   */
  _ensureId(element) {
    // 이미 ID가 있으면 claim만 하고 종료
    if (element.id) {
      this._model.ids.claim(element.id, element);
      return;
    }

    // 협업 ID 사용 조건 확인
    if (this._shouldUseCollaborativeId(element)) {
      const collaborativeId = this._generateCollaborativeId(element);
      if (collaborativeId) {
        element.id = collaborativeId;
        this._model.ids.claim(collaborativeId, element);
        return;
      }
    }

    // 기본 로직으로 폴백
    super._ensureId(element);
  }
}
```

### 2. 연결선 특화 ID 생성

```javascript
_generateConnectionCollaborativeId(element) {
  const sourceRef = element.sourceRef?.id;
  const targetRef = element.targetRef?.id;
  
  if (sourceRef && targetRef) {
    // 소스-타겟 기반 결정론적 ID 생성
    const hashInput = `SequenceFlow_${sourceRef}_${targetRef}_${documentId}`;
    const hash = this.calculateHash(hashInput);
    return `Flow_${hash}`;
  }
  
  // 폴백
  return this.generateCollaborativeId(element.$type, {x:0, y:0}, Date.now());
}
```

## 통합 방법

### 1. BPMN.js 모듈에 추가

```javascript
// demo.js의 initializeBpmnModeler() 수정
this.modeler = new window.BpmnJS({
  container: '#canvas',
  keyboard: { bindTo: document },
  additionalModules: [
    CustomBpmnFactoryModule  // ← 추가
  ],
  moddleExtensions: {}
});
```

### 2. 협업 데모 연동

```javascript
// demo.js의 initializeBpmnModeler() 수정
const customBpmnFactory = this.modeler.get('bpmnFactory');
if (customBpmnFactory && customBpmnFactory.setCollaborationDemo) {
  customBpmnFactory.setCollaborationDemo(this);
  customBpmnFactory.setUseCollaborativeIds(true);
  console.log('CustomBpmnFactory 설정 완료');
}
```

## 장점

### 1. 근본적 해결
- ID 생성의 최상위 지점을 제어
- 모든 BPMN 요소에 일관성 있게 적용
- Y.js 동기화 복잡성 대폭 감소

### 2. 아키텍처 우아함
- BPMN.js 내부 구조와 완벽 통합
- 기존 코드 변경 최소화
- 확장성과 유지보수성 확보

### 3. 성능 최적화
- ID 생성 시점에서 바로 해결
- 후처리 로직 불필요
- 동기화 오버헤드 감소

### 4. 완전한 제어
- Shape, Connection 모두 지원
- 조건부 활성화 가능
- 디버깅 용이성

## 이전 방법과의 비교

| 항목 | 이전 방법 | BpmnFactory 오버라이드 |
|------|-----------|----------------------|
| 해결 범위 | 부분적 | 완전한 |
| 코드 복잡성 | 높음 | 낮음 |
| 아키텍처 | 우회적 | 직접적 |
| 유지보수 | 어려움 | 쉬움 |
| 성능 | 보통 | 우수 |
| 확장성 | 제한적 | 높음 |

## 구현 단계

### 1. CustomBpmnFactory 생성
- `CustomBpmnFactory.js` 파일 생성
- `_ensureId()` 메서드 오버라이드
- 협업 ID 생성 로직 구현

### 2. 모듈 등록
- `CustomBpmnFactoryModule.js` 생성
- BPMN.js 의존성 주입 설정

### 3. 통합 및 테스트
- `demo.js`에서 모듈 로드
- 협업 데모 인스턴스 연동
- 기능 테스트 및 검증

## 예상 효과

### 즉시 효과
- 연결선 ID 일관성 문제 완전 해결
- Y.js 동기화 단순화
- 로컬/원격 XML 일치

### 장기 효과
- 코드 유지보수성 향상
- 새로운 BPMN 요소 쉽게 지원
- 성능 최적화

## 결론

**BpmnFactory 오버라이드 방법은 현재 문제를 해결하는 가장 우아하고 근본적인 접근법입니다.** 

BPMN.js의 핵심 ID 생성 로직을 직접 제어함으로써:
- ✅ 연결선 ID 문제 완전 해결
- ✅ 아키텍처 단순화
- ✅ 성능 최적화
- ✅ 확장성 확보

이 방법으로 복잡한 Y.js 동기화 로직 없이도 모든 BPMN 요소의 ID를 원하는 대로 제어할 수 있습니다.