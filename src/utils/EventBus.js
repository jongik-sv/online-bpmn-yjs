/**
 * 이벤트 버스
 * 모듈 간 이벤트 통신을 위한 중앙화된 이벤트 시스템
 */

export class EventBus {
  constructor() {
    this.events = new Map();
    this.maxListeners = 100;
    this.debug = false;
  }

  /**
   * 이벤트 리스너 등록
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 콜백 함수
   * @returns {Function} 제거 함수
   */
  on(event, callback) {
    this._validateEvent(event);
    this._validateCallback(callback);

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const listeners = this.events.get(event);
    
    // 최대 리스너 수 확인
    if (listeners.length >= this.maxListeners) {
      console.warn(`Maximum listeners (${this.maxListeners}) exceeded for event: ${event}`);
    }

    listeners.push(callback);

    if (this.debug) {
      console.log(`Event listener added: ${event} (${listeners.length} total)`);
    }

    // 제거 함수 반환
    return () => this.off(event, callback);
  }

  /**
   * 일회성 이벤트 리스너 등록
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 콜백 함수
   * @returns {Function} 제거 함수
   */
  once(event, callback) {
    this._validateEvent(event);
    this._validateCallback(callback);

    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      callback(...args);
    };

    return this.on(event, onceWrapper);
  }

  /**
   * 이벤트 리스너 제거
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 제거할 콜백 함수
   */
  off(event, callback) {
    this._validateEvent(event);

    if (!this.events.has(event)) {
      return;
    }

    const listeners = this.events.get(event);
    const index = listeners.indexOf(callback);

    if (index !== -1) {
      listeners.splice(index, 1);

      if (this.debug) {
        console.log(`Event listener removed: ${event} (${listeners.length} remaining)`);
      }

      // 리스너가 없으면 이벤트 제거
      if (listeners.length === 0) {
        this.events.delete(event);
      }
    }
  }

  /**
   * 이벤트 발생
   * @param {string} event - 이벤트 이름
   * @param {...any} args - 이벤트 인수
   * @returns {boolean} 리스너가 있었는지 여부
   */
  emit(event, ...args) {
    this._validateEvent(event);

    if (!this.events.has(event)) {
      if (this.debug) {
        console.log(`No listeners for event: ${event}`);
      }
      return false;
    }

    const listeners = this.events.get(event);
    const errors = [];

    if (this.debug) {
      console.log(`Emitting event: ${event} to ${listeners.length} listeners`);
    }

    // 리스너 배열 복사 (emit 중 리스너 변경 방지)
    const listenersCopy = [...listeners];

    for (const listener of listenersCopy) {
      try {
        listener(...args);
      } catch (error) {
        errors.push({
          listener,
          error,
          event,
          args
        });
        
        console.error(`Error in event listener for '${event}':`, error);
      }
    }

    // 오류가 있었다면 error 이벤트 발생
    if (errors.length > 0 && event !== 'error') {
      this.emit('error', {
        event,
        errors,
        timestamp: Date.now()
      });
    }

    return true;
  }

  /**
   * 비동기 이벤트 발생
   * @param {string} event - 이벤트 이름
   * @param {...any} args - 이벤트 인수
   * @returns {Promise<boolean>} 리스너가 있었는지 여부
   */
  async emitAsync(event, ...args) {
    this._validateEvent(event);

    if (!this.events.has(event)) {
      if (this.debug) {
        console.log(`No listeners for event: ${event}`);
      }
      return false;
    }

    const listeners = this.events.get(event);
    const errors = [];

    if (this.debug) {
      console.log(`Emitting async event: ${event} to ${listeners.length} listeners`);
    }

    // 리스너 배열 복사
    const listenersCopy = [...listeners];

    for (const listener of listenersCopy) {
      try {
        const result = listener(...args);
        
        // Promise인 경우 대기
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (error) {
        errors.push({
          listener,
          error,
          event,
          args
        });
        
        console.error(`Error in async event listener for '${event}':`, error);
      }
    }

    // 오류가 있었다면 error 이벤트 발생
    if (errors.length > 0 && event !== 'error') {
      this.emit('error', {
        event,
        errors,
        timestamp: Date.now()
      });
    }

    return true;
  }

  /**
   * 모든 이벤트 리스너 제거
   * @param {string} [event] - 특정 이벤트만 제거 (선택적)
   */
  removeAllListeners(event) {
    if (event) {
      this._validateEvent(event);
      this.events.delete(event);
      
      if (this.debug) {
        console.log(`All listeners removed for event: ${event}`);
      }
    } else {
      const eventCount = this.events.size;
      this.events.clear();
      
      if (this.debug) {
        console.log(`All listeners removed for ${eventCount} events`);
      }
    }
  }

  /**
   * 이벤트 리스너 수 조회
   * @param {string} event - 이벤트 이름
   * @returns {number} 리스너 수
   */
  listenerCount(event) {
    this._validateEvent(event);
    return this.events.has(event) ? this.events.get(event).length : 0;
  }

  /**
   * 등록된 이벤트 목록 조회
   * @returns {string[]} 이벤트 이름 배열
   */
  eventNames() {
    return Array.from(this.events.keys());
  }

  /**
   * 특정 이벤트의 리스너 목록 조회
   * @param {string} event - 이벤트 이름
   * @returns {Function[]} 리스너 배열
   */
  listeners(event) {
    this._validateEvent(event);
    return this.events.has(event) ? [...this.events.get(event)] : [];
  }

  /**
   * 이벤트가 등록되어 있는지 확인
   * @param {string} event - 이벤트 이름
   * @returns {boolean} 등록 여부
   */
  hasEvent(event) {
    this._validateEvent(event);
    return this.events.has(event) && this.events.get(event).length > 0;
  }

  /**
   * 최대 리스너 수 설정
   * @param {number} max - 최대 리스너 수
   */
  setMaxListeners(max) {
    if (typeof max !== 'number' || max < 0) {
      throw new Error('Max listeners must be a non-negative number');
    }
    this.maxListeners = max;
  }

  /**
   * 디버그 모드 설정
   * @param {boolean} enabled - 디버그 활성화 여부
   */
  setDebug(enabled) {
    this.debug = Boolean(enabled);
  }

  /**
   * 이벤트 통계 조회
   * @returns {Object} 통계 정보
   */
  getStatistics() {
    const stats = {
      totalEvents: this.events.size,
      totalListeners: 0,
      events: {}
    };

    for (const [event, listeners] of this.events) {
      stats.totalListeners += listeners.length;
      stats.events[event] = listeners.length;
    }

    return stats;
  }

  /**
   * 이벤트 버스 상태 정리
   */
  reset() {
    this.removeAllListeners();
    this.maxListeners = 100;
    this.debug = false;
  }

  /**
   * 이벤트 이름 검증
   * @private
   * @param {string} event - 이벤트 이름
   */
  _validateEvent(event) {
    if (typeof event !== 'string' || event.length === 0) {
      throw new Error('Event name must be a non-empty string');
    }
  }

  /**
   * 콜백 함수 검증
   * @private
   * @param {Function} callback - 콜백 함수
   */
  _validateCallback(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
  }

  /**
   * 프라미스 기반 이벤트 대기
   * @param {string} event - 대기할 이벤트
   * @param {number} [timeout] - 타임아웃 (밀리초)
   * @returns {Promise<any>} 이벤트 데이터
   */
  waitFor(event, timeout) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      
      const cleanup = this.once(event, (data) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(data);
      });

      if (timeout) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Event '${event}' timeout after ${timeout}ms`));
        }, timeout);
      }
    });
  }

  /**
   * 이벤트 파이프라인 생성
   * 여러 이벤트를 순차적으로 처리
   * @param {string[]} events - 이벤트 이름 배열
   * @param {Function} handler - 처리 함수
   * @returns {Function} 파이프라인 제거 함수
   */
  pipeline(events, handler) {
    const removeListeners = events.map((event, index) => {
      return this.on(event, (...args) => {
        handler(event, index, ...args);
      });
    });

    // 모든 리스너 제거 함수 반환
    return () => {
      removeListeners.forEach(remove => remove());
    };
  }
}