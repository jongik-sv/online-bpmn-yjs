/**
 * Command Stack Module
 * 
 * CommandStack 우회 시스템의 모든 컴포넌트를 내보내는 인덱스 파일
 */

export { SilentCommandStackModule, SilentCommandStack } from './SilentCommandStackModule.js';
export { SilentModeling } from './SilentModeling.js';
export * from './CommandStackUtils.js';

/**
 * CommandStack 서비스 팩토리
 * bpmn-js modeler 인스턴스를 받아 CommandStack 관련 서비스들을 초기화
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @returns {Object} CommandStack 관련 서비스들
 */
export function createCommandStackServices(modeler) {
  // SilentCommandStack 모듈이 이미 로드되어 있는지 확인
  let silentModeling;
  let silentCommandStack;
  
  try {
    silentModeling = modeler.get('silentModeling');
    silentCommandStack = modeler.get('silentCommandStack');
  } catch (error) {
    console.warn('SilentCommandStack module not found. Regular services will be used for silent operations.');
  }

  // 일반 CommandStack 서비스들
  const commandStack = modeler.get('commandStack');
  const modeling = modeler.get('modeling');
  
  return {
    // 일반 서비스들
    commandStack,
    modeling,
    
    // Silent 서비스들 (있는 경우)
    silentCommandStack,
    silentModeling,
    
    // 유틸리티
    utils: createCommandStackUtils(modeler),
    
    // 편의 메서드들
    executeSilently: (operation) => {
      if (silentModeling) {
        return operation(silentModeling);
      } else {
        // SilentModeling이 없는 경우 CommandStack을 우회하여 실행
        return executeWithoutCommands(modeler, () => operation(modeling));
      }
    },
    
    executeWithoutHistory: (operation) => {
      return executeWithoutHistory(modeler, operation);
    },
    
    executeWithSuppressedEvents: (events, operation) => {
      return executeWithSuppressedEvents(modeler, events, operation);
    },
    
    // CommandStack 상태 관리
    pauseCommandStack: () => {
      const originalEnabled = commandStack._enabled;
      commandStack._enabled = false;
      return () => { commandStack._enabled = originalEnabled; };
    },
    
    getCommandStackState: () => {
      return {
        enabled: commandStack._enabled,
        canUndo: commandStack.canUndo(),
        canRedo: commandStack.canRedo(),
        stackSize: commandStack._stack ? commandStack._stack.length : 0
      };
    },
    
    // 정리 메서드
    destroy: () => {
      // 필요한 경우 정리 작업 수행
      if (silentModeling && silentModeling.destroy) {
        silentModeling.destroy();
      }
    }
  };
}

// CommandStack 우회 관련 유틸리티들 재내보내기
import { 
  executeWithoutCommands, 
  executeWithoutHistory, 
  executeWithSuppressedEvents,
  createCommandStackUtils 
} from './CommandStackUtils.js';