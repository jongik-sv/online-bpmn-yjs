/**
 * 기본 상태 추출기
 * 모든 상태 추출기의 베이스 클래스
 */

import { Logger } from '../utils/Logger.js';

export class BaseExtractor {
  constructor(config = {}) {
    this.config = config;
    this.logger = new Logger();
  }

  /**
   * 현재 상태 추출 (추상 메서드)
   * @param {Object} context - 추출 컨텍스트
   * @returns {Promise<DocumentState>} 추출된 상태
   */
  async extract(context) {
    throw new Error('BaseExtractor.extract() must be implemented by subclass');
  }

  /**
   * 상태 검증
   * @param {Object} state - 검증할 상태
   * @returns {boolean} 검증 결과
   */
  validate(state) {
    if (!state || typeof state !== 'object') {
      return false;
    }

    // 필수 필드 검증
    const requiredFields = ['timestamp', 'version', 'elements'];
    for (const field of requiredFields) {
      if (!(field in state)) {
        this.logger.error(`Missing required field: ${field}`);
        return false;
      }
    }

    // elements 필드 검증
    if (!state.elements || typeof state.elements !== 'object') {
      this.logger.error('Invalid elements field');
      return false;
    }

    return true;
  }

  /**
   * 요소 필터링 (기본 구현)
   * @param {Object} element - BPMN 요소
   * @returns {boolean} 포함 여부
   */
  shouldIncludeElement(element) {
    // 기본적으로 모든 요소 포함
    return true;
  }

  /**
   * 요소 데이터 정규화
   * @param {Object} element - 원본 요소
   * @returns {Object} 정규화된 요소 데이터
   */
  normalizeElement(element) {
    return {
      id: element.id,
      type: element.type || 'unknown',
      x: this._roundNumber(element.x || 0),
      y: this._roundNumber(element.y || 0),
      width: this._roundNumber(element.width || 0),
      height: this._roundNumber(element.height || 0)
    };
  }

  /**
   * 메타데이터 추출 (기본 구현)
   * @param {Object} context - 컨텍스트
   * @returns {Object} 메타데이터
   */
  extractMetadata(context) {
    return {
      extractedAt: Date.now(),
      extractor: this.constructor.name
    };
  }

  /**
   * 숫자 반올림 (정밀도 적용)
   * @private
   * @param {number} value - 반올림할 값
   * @returns {number} 반올림된 값
   */
  _roundNumber(value) {
    const precision = this.config.positionPrecision || 0;
    if (precision > 0) {
      const factor = Math.pow(10, precision);
      return Math.round(value * factor) / factor;
    }
    return Math.round(value);
  }

  /**
   * 오류 처리
   * @protected
   * @param {Error} error - 오류 객체
   * @param {string} context - 오류 컨텍스트
   */
  _handleError(error, context = 'extraction') {
    this.logger.error(`${context} failed:`, error);
    throw new Error(`State extraction failed in ${context}: ${error.message}`);
  }
}