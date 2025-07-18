/**
 * CommandStack Utilities
 * 
 * CommandStack 제어를 위한 유틸리티 함수들
 * 기존 CommandStack을 임시로 비활성화하거나 조작하는 기능 제공
 */

/**
 * CommandStack을 임시로 비활성화하고 작업 실행
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @param {Function} operation - 실행할 작업
 * @returns {any} 작업 결과
 */
export function executeWithoutCommands(modeler, operation) {
  const commandStack = modeler.get('commandStack');
  const originalEnabled = commandStack._enabled;
  
  try {
    // CommandStack 비활성화
    commandStack._enabled = false;
    return operation();
  } finally {
    // CommandStack 복원
    commandStack._enabled = originalEnabled;
  }
}

/**
 * CommandStack 히스토리를 임시로 비활성화하고 작업 실행
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @param {Function} operation - 실행할 작업
 * @returns {any} 작업 결과
 */
export function executeWithoutHistory(modeler, operation) {
  const commandStack = modeler.get('commandStack');
  const originalMaxStackSize = commandStack._maxStackSize;
  const originalStack = commandStack._stack.slice();
  const originalStackIdx = commandStack._stackIdx;
  
  try {
    // 히스토리 비활성화
    commandStack._maxStackSize = 0;
    return operation();
  } finally {
    // 히스토리 복원
    commandStack._maxStackSize = originalMaxStackSize;
    commandStack._stack = originalStack;
    commandStack._stackIdx = originalStackIdx;
  }
}

/**
 * CommandStack의 특정 이벤트를 억제하고 작업 실행
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @param {Array<string>} eventsToSuppress - 억제할 이벤트 타입들
 * @param {Function} operation - 실행할 작업
 * @returns {any} 작업 결과
 */
export function executeWithSuppressedEvents(modeler, eventsToSuppress, operation) {
  const eventBus = modeler.get('eventBus');
  const originalFire = eventBus.fire.bind(eventBus);
  const suppressedSet = new Set(eventsToSuppress);
  
  try {
    // 특정 이벤트들 억제
    eventBus.fire = (type, event) => {
      if (suppressedSet.has(type)) {
        return; // 이벤트 억제
      }
      return originalFire(type, event);
    };
    
    return operation();
  } finally {
    // 원본 fire 메서드 복원
    eventBus.fire = originalFire;
  }
}

/**
 * CommandStack을 일시 정지하고 작업 실행
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @param {Function} operation - 실행할 작업
 * @returns {any} 작업 결과
 */
export function executeWithPausedCommandStack(modeler, operation) {
  const commandStack = modeler.get('commandStack');
  const originalExecute = commandStack.execute.bind(commandStack);
  
  try {
    // execute 메서드를 no-op으로 교체
    commandStack.execute = () => {};
    return operation();
  } finally {
    // 원본 execute 복원
    commandStack.execute = originalExecute;
  }
}

/**
 * CommandStack의 현재 상태 스냅샷 생성
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @returns {Object} CommandStack 상태 스냅샷
 */
export function createCommandStackSnapshot(modeler) {
  const commandStack = modeler.get('commandStack');
  
  return {
    stack: commandStack._stack.slice(),
    stackIdx: commandStack._stackIdx,
    maxStackSize: commandStack._maxStackSize,
    enabled: commandStack._enabled
  };
}

/**
 * CommandStack 상태를 스냅샷으로 복원
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @param {Object} snapshot - 복원할 스냅샷
 */
export function restoreCommandStackSnapshot(modeler, snapshot) {
  const commandStack = modeler.get('commandStack');
  
  commandStack._stack = snapshot.stack.slice();
  commandStack._stackIdx = snapshot.stackIdx;
  commandStack._maxStackSize = snapshot.maxStackSize;
  commandStack._enabled = snapshot.enabled;
}

/**
 * CommandStack 히스토리 클리어 (안전하게)
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @param {boolean} fireEvents - 이벤트 발생 여부
 */
export function clearCommandStackHistory(modeler, fireEvents = true) {
  const commandStack = modeler.get('commandStack');
  const eventBus = modeler.get('eventBus');
  
  const hadHistory = commandStack._stack.length > 0;
  
  // 히스토리 클리어
  commandStack._stack = [];
  commandStack._stackIdx = -1;
  
  if (fireEvents && hadHistory) {
    eventBus.fire('commandStack.cleared');
    eventBus.fire('commandStack.changed');
  }
}

/**
 * CommandStack 상태 정보 반환
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @returns {Object} CommandStack 상태 정보
 */
export function getCommandStackInfo(modeler) {
  const commandStack = modeler.get('commandStack');
  
  return {
    enabled: commandStack._enabled,
    stackSize: commandStack._stack.length,
    currentIndex: commandStack._stackIdx,
    maxStackSize: commandStack._maxStackSize,
    canUndo: commandStack.canUndo(),
    canRedo: commandStack.canRedo()
  };
}

/**
 * 두 개의 작업을 원자적으로 실행 (모두 성공하거나 모두 실패)
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @param {Function} operation1 - 첫 번째 작업
 * @param {Function} operation2 - 두 번째 작업
 * @returns {Array} [result1, result2] 또는 예외 발생
 */
export function executeAtomically(modeler, operation1, operation2) {
  const snapshot = createCommandStackSnapshot(modeler);
  
  try {
    const result1 = operation1();
    const result2 = operation2();
    return [result1, result2];
  } catch (error) {
    // 실패 시 CommandStack 상태 복원
    restoreCommandStackSnapshot(modeler, snapshot);
    throw error;
  }
}

/**
 * CommandStack 유틸리티 팩토리
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @returns {Object} CommandStack 유틸리티 객체
 */
export function createCommandStackUtils(modeler) {
  return {
    executeWithoutCommands: (operation) => executeWithoutCommands(modeler, operation),
    executeWithoutHistory: (operation) => executeWithoutHistory(modeler, operation),
    executeWithSuppressedEvents: (events, operation) => executeWithSuppressedEvents(modeler, events, operation),
    executeWithPausedCommandStack: (operation) => executeWithPausedCommandStack(modeler, operation),
    createSnapshot: () => createCommandStackSnapshot(modeler),
    restoreSnapshot: (snapshot) => restoreCommandStackSnapshot(modeler, snapshot),
    clearHistory: (fireEvents) => clearCommandStackHistory(modeler, fireEvents),
    getInfo: () => getCommandStackInfo(modeler),
    executeAtomically: (op1, op2) => executeAtomically(modeler, op1, op2)
  };
}