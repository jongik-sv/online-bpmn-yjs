/**
 * CommandStack Utilities
 * 
 * CommandStack 관련 유틸리티 함수들을 제공합니다.
 * CommandStack을 임시로 비활성화하거나 명령을 조작하는 기능을 포함합니다.
 */

/**
 * CommandStack을 임시로 비활성화하고 작업 실행
 * @param {Object} modeler - BPMN 모델러 인스턴스
 * @param {Function} operation - 실행할 작업
 * @returns {*} 작업 결과
 */
export function executeWithoutCommands(modeler, operation) {
  const commandStack = modeler.get('commandStack');
  const originalEnabled = commandStack._enabled;
  
  commandStack._enabled = false;
  
  try {
    return operation();
  } finally {
    commandStack._enabled = originalEnabled;
  }
}

/**
 * 비동기 작업을 CommandStack 비활성화 상태에서 실행
 * @param {Object} modeler - BPMN 모델러 인스턴스
 * @param {Function} asyncOperation - 실행할 비동기 작업
 * @returns {Promise} 작업 결과
 */
export async function executeWithoutCommandsAsync(modeler, asyncOperation) {
  const commandStack = modeler.get('commandStack');
  const originalEnabled = commandStack._enabled;
  
  commandStack._enabled = false;
  
  try {
    return await asyncOperation();
  } finally {
    commandStack._enabled = originalEnabled;
  }
}

/**
 * CommandStack의 실행 히스토리를 무시하고 명령 실행
 * @param {Object} commandStack - CommandStack 인스턴스
 * @param {Object} command - 실행할 명령
 * @param {Object} context - 명령 컨텍스트
 * @returns {*} 실행 결과
 */
export function executeCommandWithoutHistory(commandStack, command, context) {
  // 스택 크기 백업
  const originalStackLength = commandStack._stack ? commandStack._stack.length : 0;
  
  try {
    const result = commandStack.execute(command, context);
    
    // 실행 후 스택에서 해당 명령 제거 (히스토리에 남기지 않음)
    if (commandStack._stack && commandStack._stack.length > originalStackLength) {
      commandStack._stack.pop();
    }
    
    return result;
  } catch (error) {
    console.error('CommandStackUtils: Error executing command without history:', error);
    return null;
  }
}

/**
 * 여러 명령을 하나의 트랜잭션으로 실행
 * @param {Object} commandStack - CommandStack 인스턴스
 * @param {Array} commands - 명령 배열 [{command, context}, ...]
 * @param {string} transactionName - 트랜잭션 이름
 * @returns {Array} 실행 결과 배열
 */
export function executeCommandTransaction(commandStack, commands, transactionName = 'Transaction') {
  if (!Array.isArray(commands) || commands.length === 0) {
    return [];
  }

  const results = [];
  
  try {
    // 트랜잭션 시작 마커
    const transactionCommand = {
      execute: () => {
        console.log(`CommandStackUtils: Starting transaction '${transactionName}'`);
      },
      revert: () => {
        console.log(`CommandStackUtils: Reverting transaction '${transactionName}'`);
      }
    };
    
    commandStack.execute(transactionCommand, {});
    
    // 각 명령 실행
    commands.forEach(({ command, context }) => {
      const result = commandStack.execute(command, context);
      results.push(result);
    });
    
    return results;
  } catch (error) {
    console.error('CommandStackUtils: Transaction failed:', error);
    
    // 실패 시 가능한 롤백 시도
    try {
      while (commandStack.canUndo() && results.length > 0) {
        commandStack.undo();
        results.pop();
      }
    } catch (rollbackError) {
      console.error('CommandStackUtils: Rollback failed:', rollbackError);
    }
    
    return results;
  }
}

/**
 * CommandStack의 상태 정보 반환
 * @param {Object} commandStack - CommandStack 인스턴스
 * @returns {Object} 상태 정보
 */
export function getCommandStackState(commandStack) {
  return {
    enabled: commandStack._enabled !== false,
    canUndo: commandStack.canUndo(),
    canRedo: commandStack.canRedo(),
    stackSize: commandStack._stack ? commandStack._stack.length : 0,
    currentIndex: commandStack._stackIdx || 0
  };
}

/**
 * CommandStack을 특정 상태로 초기화
 * @param {Object} commandStack - CommandStack 인스턴스
 * @param {boolean} clearHistory - 히스토리 삭제 여부
 */
export function resetCommandStack(commandStack, clearHistory = false) {
  commandStack._enabled = true;
  
  if (clearHistory) {
    commandStack._stack = [];
    commandStack._stackIdx = -1;
    
    // 이벤트 발생 (필요시)
    if (commandStack._eventBus && commandStack._eventBus.fire) {
      commandStack._eventBus.fire('commandStack.changed', {
        trigger: 'clear'
      });
    }
  }
}

/**
 * 특정 시점까지 Undo 실행
 * @param {Object} commandStack - CommandStack 인스턴스
 * @param {number} targetIndex - 목표 인덱스
 * @returns {boolean} 성공 여부
 */
export function undoToIndex(commandStack, targetIndex) {
  if (targetIndex < 0 || !commandStack._stack) {
    return false;
  }

  const currentIndex = commandStack._stackIdx || 0;
  
  if (targetIndex >= currentIndex) {
    return true; // 이미 목표 인덱스이거나 그 이후
  }

  try {
    const undoCount = currentIndex - targetIndex;
    
    for (let i = 0; i < undoCount; i++) {
      if (!commandStack.canUndo()) {
        break;
      }
      commandStack.undo();
    }
    
    return true;
  } catch (error) {
    console.error('CommandStackUtils: Error during undo to index:', error);
    return false;
  }
}

/**
 * CommandStack의 메모리 사용량 모니터링
 * @param {Object} commandStack - CommandStack 인스턴스
 * @returns {Object} 메모리 사용량 정보
 */
export function getCommandStackMemoryUsage(commandStack) {
  if (!commandStack._stack) {
    return { commandCount: 0, estimatedSize: 0 };
  }

  const commandCount = commandStack._stack.length;
  let estimatedSize = 0;

  // 대략적인 메모리 사용량 계산
  commandStack._stack.forEach(command => {
    if (command && typeof command === 'object') {
      estimatedSize += JSON.stringify(command).length;
    }
  });

  return {
    commandCount,
    estimatedSize: Math.round(estimatedSize / 1024), // KB 단위
    averageCommandSize: commandCount > 0 ? Math.round(estimatedSize / commandCount) : 0
  };
}

/**
 * CommandStack 이벤트 리스너 관리
 */
export class CommandStackEventManager {
  constructor(commandStack) {
    this.commandStack = commandStack;
    this.eventBus = commandStack._eventBus;
    this.listeners = new Map();
    this.isMonitoring = false;
  }

  /**
   * 이벤트 리스너 추가
   * @param {string} event - 이벤트 이름
   * @param {Function} listener - 리스너 함수
   */
  addListener(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event).push(listener);
    
    if (this.eventBus) {
      this.eventBus.on(event, listener);
    }
  }

  /**
   * 이벤트 리스너 제거
   * @param {string} event - 이벤트 이름
   * @param {Function} listener - 리스너 함수
   */
  removeListener(event, listener) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    
    if (this.eventBus) {
      this.eventBus.off(event, listener);
    }
  }

  /**
   * 모든 리스너 제거
   */
  removeAllListeners() {
    this.listeners.forEach((listeners, event) => {
      listeners.forEach(listener => {
        if (this.eventBus) {
          this.eventBus.off(event, listener);
        }
      });
    });
    
    this.listeners.clear();
  }

  /**
   * CommandStack 모니터링 시작
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    this.addListener('commandStack.execute', (event) => {
      console.log('CommandStack executed:', event);
    });
    
    this.addListener('commandStack.revert', (event) => {
      console.log('CommandStack reverted:', event);
    });
    
    this.addListener('commandStack.changed', (event) => {
      console.log('CommandStack changed:', event);
    });
  }

  /**
   * CommandStack 모니터링 중지
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    this.removeAllListeners();
  }

  /**
   * 매니저 정리
   */
  destroy() {
    this.stopMonitoring();
    this.commandStack = null;
    this.eventBus = null;
  }
}

export default {
  executeWithoutCommands,
  executeWithoutCommandsAsync,
  executeCommandWithoutHistory,
  executeCommandTransaction,
  getCommandStackState,
  resetCommandStack,
  undoToIndex,
  getCommandStackMemoryUsage,
  CommandStackEventManager
};