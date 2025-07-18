/**
 * Silent CommandStack Module
 * 
 * 사용자 액션용과 협업용 CommandStack을 분리하는 bpmn-js 모듈
 * 협업 업데이트는 undo/redo 히스토리에 포함되지 않도록 처리
 */

import CommandStack from 'diagram-js/lib/command/CommandStack';
import { SilentModeling } from './SilentModeling.js';

/**
 * Silent CommandStack 클래스
 * 기본 CommandStack과 동일하지만 undo/redo 히스토리를 유지하지 않음
 */
class SilentCommandStack extends CommandStack {
  constructor(eventBus) {
    super(eventBus);
    
    // Silent CommandStack은 히스토리를 유지하지 않음
    this._stack = [];
    this._stackIdx = -1;
    this._maxStackSize = 0; // 히스토리 비활성화
    
    // Silent 모드 플래그
    this._silentMode = true;
  }

  /**
   * 명령 실행 (히스토리에 저장하지 않음)
   * @param {string} command - 명령 이름
   * @param {Object} context - 명령 컨텍스트
   */
  execute(command, context) {
    const action = this._getHandler(command);
    
    if (!action) {
      throw new Error('no command handler registered for <' + command + '>');
    }

    this._fire('commandStack.preExecute', { command, context });

    try {
      // 명령 실행 (히스토리에 저장하지 않음)
      const result = action.execute(context);
      
      this._fire('commandStack.execute', { 
        command, 
        context,
        trigger: 'execute',
        silent: true
      });

      this._fire('commandStack.changed', {
        trigger: 'execute',
        command,
        context,
        silent: true
      });

      return result;
    } catch (error) {
      this._fire('commandStack.rejected', { command, context, error });
      throw error;
    } finally {
      this._fire('commandStack.postExecute', { command, context });
    }
  }

  /**
   * undo 기능 비활성화 (Silent CommandStack에서는 사용하지 않음)
   */
  undo() {
    console.warn('Undo is not supported in SilentCommandStack');
    return;
  }

  /**
   * redo 기능 비활성화 (Silent CommandStack에서는 사용하지 않음)
   */
  redo() {
    console.warn('Redo is not supported in SilentCommandStack');
    return;
  }

  /**
   * clear 기능 오버라이드 (아무것도 하지 않음)
   */
  clear() {
    // Silent CommandStack은 항상 비어있음
    return;
  }

  /**
   * canUndo는 항상 false 반환
   */
  canUndo() {
    return false;
  }

  /**
   * canRedo는 항상 false 반환
   */
  canRedo() {
    return false;
  }

  /**
   * 이벤트 발생 (Silent 플래그 추가)
   */
  _fire(type, event = {}) {
    this._eventBus.fire(type, { ...event, silent: true });
  }
}

/**
 * SilentCommandStack 모듈 정의
 */
export const SilentCommandStackModule = {
  __init__: ['silentCommandStack', 'silentModeling'],
  silentCommandStack: ['type', SilentCommandStack],
  silentModeling: ['type', SilentModeling]
};

export { SilentCommandStack };