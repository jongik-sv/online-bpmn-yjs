/**
 * 기본 어댑터
 * 모든 동기화 어댑터의 베이스 클래스
 */

import { Logger } from '../utils/Logger.js';

export class BaseAdapter {
  constructor(config = {}) {
    this.config = {
      enableCompression: false,
      retryOnError: true,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 10000,
      ...config
    };
    this.logger = new Logger();
    this.isInitialized = false;
    this.isConnected = false;
    this.remoteDiffCallback = null;
    this.connectionListeners = new Set();
  }

  /**
   * 어댑터 초기화 (추상 메서드)
   * @param {Object} context - 초기화 컨텍스트
   * @returns {Promise<void>}
   */
  async initialize(context) {
    throw new Error('BaseAdapter.initialize() must be implemented by subclass');
  }

  /**
   * Diff 전송 (추상 메서드)
   * @param {DocumentDiff} diff - 전송할 Diff
   * @returns {Promise<void>}
   */
  async sendDiff(diff) {
    throw new Error('BaseAdapter.sendDiff() must be implemented by subclass');
  }

  /**
   * 원격 Diff 수신 콜백 등록 (추상 메서드)
   * @param {Function} callback - 수신 콜백 함수
   */
  onRemoteDiff(callback) {
    throw new Error('BaseAdapter.onRemoteDiff() must be implemented by subclass');
  }

  /**
   * 연결 상태 리스너 등록
   * @param {Function} callback - 상태 변경 콜백
   * @returns {Function} 제거 함수
   */
  onConnectionChange(callback) {
    this.connectionListeners.add(callback);
    
    // 현재 상태 즉시 알림
    callback({
      status: this.isConnected ? 'connected' : 'disconnected',
      timestamp: Date.now()
    });

    // 제거 함수 반환
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * 연결 상태 변경 알림
   * @protected
   * @param {string} status - 연결 상태 ('connected', 'disconnected', 'connecting', 'error')
   * @param {Object} details - 추가 상세 정보
   */
  _notifyConnectionChange(status, details = {}) {
    const event = {
      status,
      timestamp: Date.now(),
      ...details
    };

    this.connectionListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Connection listener error:', error);
      }
    });

    this.logger.debug(`Connection status changed: ${status}`);
  }

  /**
   * 재시도 로직
   * @protected
   * @param {Function} operation - 재시도할 함수
   * @param {string} operationName - 작업 이름
   * @returns {Promise<any>}
   */
  async _retry(operation, operationName = 'operation') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.config.maxRetries) {
          this.logger.error(`${operationName} failed after ${attempt} attempts:`, error);
          break;
        }

        this.logger.warn(`${operationName} attempt ${attempt} failed, retrying in ${this.config.retryDelay}ms:`, error);
        await this._delay(this.config.retryDelay * attempt); // 지수 백오프
      }
    }

    throw lastError;
  }

  /**
   * 지연 함수
   * @protected
   * @param {number} ms - 지연 시간 (밀리초)
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 타임아웃 래퍼
   * @protected
   * @param {Promise} promise - 래핑할 Promise
   * @param {number} timeoutMs - 타임아웃 시간
   * @param {string} operationName - 작업 이름
   * @returns {Promise<any>}
   */
  _withTimeout(promise, timeoutMs = this.config.timeout, operationName = 'operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${operationName} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Diff 검증
   * @protected
   * @param {DocumentDiff} diff - 검증할 Diff
   * @returns {boolean}
   */
  _validateDiff(diff) {
    if (!diff || typeof diff !== 'object') {
      this.logger.error('Invalid diff: not an object');
      return false;
    }

    const requiredFields = ['id', 'timestamp', 'clientId', 'added', 'modified', 'removed'];
    for (const field of requiredFields) {
      if (!(field in diff)) {
        this.logger.error(`Invalid diff: missing field ${field}`);
        return false;
      }
    }

    // 배열 타입 검증
    if (!Array.isArray(diff.added) || !Array.isArray(diff.modified) || !Array.isArray(diff.removed)) {
      this.logger.error('Invalid diff: added, modified, removed must be arrays');
      return false;
    }

    return true;
  }

  /**
   * Diff 압축 (옵션)
   * @protected
   * @param {DocumentDiff} diff - 압축할 Diff
   * @returns {string|DocumentDiff}
   */
  _compressDiff(diff) {
    if (!this.config.enableCompression) {
      return diff;
    }

    try {
      // 간단한 JSON 압축 (실제로는 gzip 등 사용)
      const jsonString = JSON.stringify(diff);
      
      // 크기가 작으면 압축하지 않음
      if (jsonString.length < 1000) {
        return diff;
      }

      // 여기서는 단순히 JSON 문자열 반환 (실제로는 압축 알고리즘 적용)
      return {
        compressed: true,
        data: jsonString,
        originalSize: jsonString.length
      };
    } catch (error) {
      this.logger.warn('Compression failed, sending uncompressed:', error);
      return diff;
    }
  }

  /**
   * Diff 압축 해제
   * @protected
   * @param {string|DocumentDiff} data - 압축 해제할 데이터
   * @returns {DocumentDiff}
   */
  _decompressDiff(data) {
    if (!data || typeof data !== 'object' || !data.compressed) {
      return data;
    }

    try {
      return JSON.parse(data.data);
    } catch (error) {
      this.logger.error('Decompression failed:', error);
      throw new Error('Failed to decompress diff data');
    }
  }

  /**
   * 메시지 직렬화
   * @protected
   * @param {any} data - 직렬화할 데이터
   * @returns {string}
   */
  _serialize(data) {
    try {
      return JSON.stringify(data);
    } catch (error) {
      this.logger.error('Serialization failed:', error);
      throw new Error('Failed to serialize data');
    }
  }

  /**
   * 메시지 역직렬화
   * @protected
   * @param {string} data - 역직렬화할 데이터
   * @returns {any}
   */
  _deserialize(data) {
    try {
      return JSON.parse(data);
    } catch (error) {
      this.logger.error('Deserialization failed:', error);
      throw new Error('Failed to deserialize data');
    }
  }

  /**
   * 오류 분류
   * @protected
   * @param {Error} error - 분류할 오류
   * @returns {Object}
   */
  _categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('connection')) {
      return {
        type: 'network',
        recoverable: true,
        retryable: true
      };
    }
    
    if (message.includes('timeout')) {
      return {
        type: 'timeout',
        recoverable: true,
        retryable: true
      };
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return {
        type: 'validation',
        recoverable: false,
        retryable: false
      };
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return {
        type: 'permission',
        recoverable: false,
        retryable: false
      };
    }

    return {
      type: 'unknown',
      recoverable: false,
      retryable: true
    };
  }

  /**
   * 통계 정보 조회
   * @returns {Object}
   */
  getStatistics() {
    return {
      isInitialized: this.isInitialized,
      isConnected: this.isConnected,
      configuration: {
        enableCompression: this.config.enableCompression,
        retryOnError: this.config.retryOnError,
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeout
      }
    };
  }

  /**
   * 어댑터 상태 확인
   * @returns {Object}
   */
  getHealth() {
    return {
      status: this.isConnected ? 'healthy' : 'disconnected',
      isInitialized: this.isInitialized,
      isConnected: this.isConnected,
      timestamp: Date.now()
    };
  }

  /**
   * 리소스 정리 (추상 메서드)
   * @returns {Promise<void>}
   */
  async destroy() {
    this.isInitialized = false;
    this.isConnected = false;
    this.remoteDiffCallback = null;
    this.connectionListeners.clear();
    
    this.logger.info('BaseAdapter destroyed');
  }

  /**
   * 오류 처리
   * @protected
   * @param {Error} error - 오류 객체
   * @param {string} context - 오류 컨텍스트
   */
  _handleError(error, context = 'adapter') {
    this.logger.error(`${context} error:`, error);
    
    const errorInfo = this._categorizeError(error);
    
    // 연결 오류인 경우 상태 알림
    if (errorInfo.type === 'network') {
      this._notifyConnectionChange('error', { error: error.message });
    }
    
    throw error;
  }
}