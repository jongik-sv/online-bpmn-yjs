/**
 * CommandStack Manager
 * 
 * bpmn-js의 CommandStack을 우회하여 사용자 액션과 협업 액션을 분리하는 매니저입니다.
 * 사용자 액션은 일반 CommandStack을 통해 undo/redo가 가능하고,
 * 협업 액션은 별도 CommandStack을 통해 undo/redo에 영향을 주지 않습니다.
 */
export class CommandStackManager {
  constructor(modeler) {
    this.modeler = modeler;
    this.userCommandStack = modeler.get('commandStack');
    
    // 협업용 별도 CommandStack 생성
    this.collaborationCommandStack = this.createSilentCommandStack();
    
    // CommandStack 상태 관리
    this.isUserAction = true;
    this.pendingCollaborationCommands = [];
  }

  /**
   * 협업용 Silent CommandStack 생성
   * @returns {Object} Silent CommandStack 인스턴스
   */
  createSilentCommandStack() {
    // bpmn-js의 CommandStack을 기반으로 한 Silent 버전
    const CommandStack = this.modeler.get('commandStack').constructor;
    
    class SilentCommandStack extends CommandStack {
      constructor(eventBus) {
        super(eventBus);
        this._isSilent = true;
      }

      // 이벤트 발생 억제
      fire(event, context) {
        if (this._isSilent) {
          // Silent 모드에서는 특정 이벤트만 발생
          const allowedEvents = ['commandStack.execute', 'commandStack.changed'];
          if (!allowedEvents.includes(event)) {
            return;
          }
        }
        
        return super.fire ? super.fire(event, context) : null;
      }

      // Undo/Redo 기록에서 제외
      execute(command, context) {
        if (this._isSilent) {
          // 직접 실행하되 스택에 저장하지 않음
          return this._execute(command, context);
        }
        
        return super.execute(command, context);
      }

      _execute(command, context) {
        try {
          return command.execute ? command.execute(context) : null;
        } catch (error) {
          console.error('SilentCommandStack: Command execution failed:', error);
          return null;
        }
      }
    }

    const eventBus = this.modeler.get('eventBus');
    return new SilentCommandStack(eventBus);
  }

  /**
   * 사용자 액션 모드로 전환
   */
  enableUserMode() {
    this.isUserAction = true;
  }

  /**
   * 협업 액션 모드로 전환
   */
  enableCollaborationMode() {
    this.isUserAction = false;
  }

  /**
   * 현재 모드에 따라 적절한 CommandStack 반환
   * @returns {Object} CommandStack 인스턴스
   */
  getCurrentCommandStack() {
    return this.isUserAction ? this.userCommandStack : this.collaborationCommandStack;
  }

  /**
   * CommandStack을 임시로 비활성화
   * @param {Function} operation - 실행할 작업
   * @returns {*} 작업 결과
   */
  executeWithoutCommands(operation) {
    const commandStack = this.userCommandStack;
    const originalEnabled = commandStack._enabled;
    
    commandStack._enabled = false;
    
    try {
      return operation();
    } finally {
      commandStack._enabled = originalEnabled;
    }
  }

  /**
   * 협업 명령을 Silent CommandStack으로 실행
   * @param {Object} command - 실행할 명령
   * @param {Object} context - 명령 컨텍스트
   * @returns {*} 실행 결과
   */
  executeCollaborationCommand(command, context) {
    this.enableCollaborationMode();
    
    try {
      return this.collaborationCommandStack.execute(command, context);
    } finally {
      this.enableUserMode();
    }
  }

  /**
   * 여러 협업 명령을 배치로 실행
   * @param {Array} commands - 명령 배열
   */
  executeBatchCollaborationCommands(commands) {
    if (!Array.isArray(commands) || commands.length === 0) {
      return;
    }

    this.enableCollaborationMode();
    
    try {
      commands.forEach(({ command, context }) => {
        this.collaborationCommandStack.execute(command, context);
      });
    } finally {
      this.enableUserMode();
    }
  }

  /**
   * CommandStack의 활성/비활성 상태 제어
   * @param {boolean} enabled - 활성화 여부
   */
  setCommandStackEnabled(enabled) {
    if (this.userCommandStack._enabled !== undefined) {
      this.userCommandStack._enabled = enabled;
    }
  }

  /**
   * 사용자 CommandStack의 상태 확인
   * @returns {boolean} CommandStack 활성화 여부
   */
  isCommandStackEnabled() {
    return this.userCommandStack._enabled !== false;
  }

  /**
   * Undo/Redo 가능 여부 확인
   * @returns {Object} Undo/Redo 가능 여부
   */
  getUndoRedoStatus() {
    return {
      canUndo: this.userCommandStack.canUndo(),
      canRedo: this.userCommandStack.canRedo(),
      stackSize: this.userCommandStack._stack ? this.userCommandStack._stack.length : 0
    };
  }

  /**
   * 협업 CommandStack의 통계 정보
   * @returns {Object} 협업 CommandStack 통계
   */
  getCollaborationStats() {
    return {
      executedCommands: this.pendingCollaborationCommands.length,
      isSilent: this.collaborationCommandStack._isSilent
    };
  }

  /**
   * CommandStack 상태 리셋
   */
  reset() {
    this.pendingCollaborationCommands = [];
    this.enableUserMode();
    this.setCommandStackEnabled(true);
  }

  /**
   * 매니저 정리 및 리소스 해제
   */
  destroy() {
    this.reset();
    this.modeler = null;
    this.userCommandStack = null;
    this.collaborationCommandStack = null;
  }
}

/**
 * Silent CommandStack Module
 * bpmn-js 모듈로 등록하여 사용할 수 있는 형태
 */
export const SilentCommandStackModule = {
  __init__: ['commandStackManager'],
  commandStackManager: ['type', CommandStackManager]
};

export default CommandStackManager;