/**
 * 로거 유틸리티
 * 애플리케이션 전반의 로깅을 담당하는 통합 로깅 시스템
 */

export class Logger {
  constructor(options = {}) {
    this.options = {
      level: 'info',
      enableConsole: true,
      enableFile: false,
      enableRemote: false,
      timestampFormat: 'ISO',
      maxLogSize: 100,
      contextSeparator: '::',
      colors: {
        error: '\x1b[31m',
        warn: '\x1b[33m',
        info: '\x1b[36m',
        debug: '\x1b[37m',
        reset: '\x1b[0m'
      },
      ...options
    };

    // 로그 레벨 정의
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // 메모리 로그 버퍼
    this.logBuffer = [];
    this.logListeners = new Set();
    
    // 컨텍스트 스택
    this.contextStack = [];
    
    // 통계
    this.stats = {
      total: 0,
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      startTime: Date.now()
    };
  }

  /**
   * 오류 로그
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인수
   */
  error(message, ...args) {
    this._log('error', message, ...args);
  }

  /**
   * 경고 로그
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인수
   */
  warn(message, ...args) {
    this._log('warn', message, ...args);
  }

  /**
   * 정보 로그
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인수
   */
  info(message, ...args) {
    this._log('info', message, ...args);
  }

  /**
   * 디버그 로그
   * @param {string} message - 로그 메시지
   * @param {...any} args - 추가 인수
   */
  debug(message, ...args) {
    this._log('debug', message, ...args);
  }

  /**
   * 컨텍스트 설정
   * @param {string} context - 컨텍스트 이름
   * @returns {Function} 컨텍스트 해제 함수
   */
  withContext(context) {
    this.contextStack.push(context);
    
    return () => {
      const index = this.contextStack.lastIndexOf(context);
      if (index !== -1) {
        this.contextStack.splice(index, 1);
      }
    };
  }

  /**
   * 그룹 로그 시작
   * @param {string} label - 그룹 레이블
   */
  group(label) {
    if (this.options.enableConsole) {
      console.group(this._formatMessage('info', label));
    }
  }

  /**
   * 그룹 로그 종료
   */
  groupEnd() {
    if (this.options.enableConsole) {
      console.groupEnd();
    }
  }

  /**
   * 성능 측정 시작
   * @param {string} label - 측정 레이블
   * @returns {Function} 측정 종료 함수
   */
  time(label) {
    const startTime = performance.now();
    
    this.debug(`⏱️ ${label} started`);
    
    return () => {
      const duration = performance.now() - startTime;
      this.info(`⏱️ ${label} completed in ${duration.toFixed(2)}ms`);
      return duration;
    };
  }

  /**
   * 테이블 형태 로그
   * @param {Array|Object} data - 테이블 데이터
   */
  table(data) {
    if (this.options.enableConsole && console.table) {
      console.table(data);
    } else {
      this.info('Table data:', data);
    }
  }

  /**
   * 조건부 로그
   * @param {boolean} condition - 조건
   * @param {string} level - 로그 레벨
   * @param {string} message - 메시지
   * @param {...any} args - 추가 인수
   */
  assert(condition, level, message, ...args) {
    if (!condition) {
      this._log(level, `Assertion failed: ${message}`, ...args);
    }
  }

  /**
   * 로그 리스너 등록
   * @param {Function} listener - 리스너 함수
   * @returns {Function} 제거 함수
   */
  addListener(listener) {
    this.logListeners.add(listener);
    
    return () => {
      this.logListeners.delete(listener);
    };
  }

  /**
   * 로그 레벨 설정
   * @param {string} level - 로그 레벨
   */
  setLevel(level) {
    if (level in this.levels) {
      this.options.level = level;
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  }

  /**
   * 로그 버퍼 조회
   * @param {number} count - 가져올 로그 수
   * @returns {Array} 로그 엔트리 배열
   */
  getRecentLogs(count = 50) {
    return this.logBuffer.slice(-count);
  }

  /**
   * 로그 버퍼 지우기
   */
  clearBuffer() {
    this.logBuffer = [];
    this.info('Log buffer cleared');
  }

  /**
   * 통계 정보 조회
   * @returns {Object} 로그 통계
   */
  getStatistics() {
    const runtime = Date.now() - this.stats.startTime;
    
    return {
      ...this.stats,
      runtime,
      averageLogsPerSecond: this.stats.total / (runtime / 1000),
      bufferSize: this.logBuffer.length,
      memoryUsage: this._estimateMemoryUsage()
    };
  }

  /**
   * 로그 필터링
   * @param {Object} filters - 필터 조건
   * @returns {Array} 필터된 로그 배열
   */
  filter(filters = {}) {
    return this.logBuffer.filter(entry => {
      if (filters.level && entry.level !== filters.level) {
        return false;
      }
      if (filters.context && !entry.context.includes(filters.context)) {
        return false;
      }
      if (filters.since && entry.timestamp < filters.since) {
        return false;
      }
      if (filters.until && entry.timestamp > filters.until) {
        return false;
      }
      if (filters.message && !entry.message.includes(filters.message)) {
        return false;
      }
      return true;
    });
  }

  /**
   * 로그 내보내기
   * @param {string} format - 내보내기 형식 ('json', 'csv', 'text')
   * @param {Object} filters - 필터 조건
   * @returns {string} 내보낸 로그 데이터
   */
  export(format = 'json', filters = {}) {
    const logs = this.filter(filters);
    
    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);
      case 'csv':
        return this._exportToCsv(logs);
      case 'text':
        return this._exportToText(logs);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * 실제 로깅 구현
   * @private
   * @param {string} level - 로그 레벨
   * @param {string} message - 메시지
   * @param {...any} args - 추가 인수
   */
  _log(level, message, ...args) {
    // 레벨 체크
    if (this.levels[level] > this.levels[this.options.level]) {
      return;
    }

    const timestamp = new Date();
    const context = this.contextStack.join(this.options.contextSeparator);
    
    // 로그 엔트리 생성
    const logEntry = {
      level,
      message,
      args: this._serializeArgs(args),
      context,
      timestamp: timestamp.getTime(),
      iso: timestamp.toISOString()
    };

    // 통계 업데이트
    this.stats.total++;
    this.stats[level]++;

    // 버퍼에 추가
    this.logBuffer.push(logEntry);
    
    // 버퍼 크기 제한
    if (this.logBuffer.length > this.options.maxLogSize) {
      this.logBuffer.shift();
    }

    // 콘솔 출력
    if (this.options.enableConsole) {
      this._outputToConsole(logEntry, args);
    }

    // 리스너들에게 알림
    this.logListeners.forEach(listener => {
      try {
        listener(logEntry);
      } catch (error) {
        console.error('Log listener error:', error);
      }
    });
  }

  /**
   * 콘솔 출력
   * @private
   * @param {Object} logEntry - 로그 엔트리
   * @param {Array} originalArgs - 원본 인수들
   */
  _outputToConsole(logEntry, originalArgs) {
    const formattedMessage = this._formatMessage(logEntry.level, logEntry.message, logEntry.context, logEntry.iso);
    
    const consoleMethod = console[logEntry.level] || console.log;
    
    if (originalArgs.length > 0) {
      consoleMethod(formattedMessage, ...originalArgs);
    } else {
      consoleMethod(formattedMessage);
    }
  }

  /**
   * 메시지 포매팅
   * @private
   * @param {string} level - 로그 레벨
   * @param {string} message - 메시지
   * @param {string} context - 컨텍스트
   * @param {string} timestamp - 타임스탬프
   * @returns {string} 포맷된 메시지
   */
  _formatMessage(level, message, context, timestamp) {
    const color = this.options.colors[level] || '';
    const reset = this.options.colors.reset || '';
    const timeStr = this._formatTimestamp(timestamp);
    const contextStr = context ? ` [${context}]` : '';
    const levelStr = level.toUpperCase().padEnd(5);
    
    return `${color}${timeStr} ${levelStr}${contextStr} ${message}${reset}`;
  }

  /**
   * 타임스탬프 포매팅
   * @private
   * @param {string} timestamp - ISO 타임스탬프
   * @returns {string} 포맷된 타임스탬프
   */
  _formatTimestamp(timestamp) {
    if (this.options.timestampFormat === 'ISO') {
      return new Date(timestamp).toISOString();
    } else {
      return new Date(timestamp).toLocaleTimeString();
    }
  }

  /**
   * 인수 직렬화
   * @private
   * @param {Array} args - 인수 배열
   * @returns {Array} 직렬화된 인수 배열
   */
  _serializeArgs(args) {
    return args.map(arg => {
      if (arg instanceof Error) {
        return {
          name: arg.name,
          message: arg.message,
          stack: arg.stack
        };
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return '[Circular or non-serializable object]';
        }
      }
      return arg;
    });
  }

  /**
   * CSV 내보내기
   * @private
   * @param {Array} logs - 로그 배열
   * @returns {string} CSV 문자열
   */
  _exportToCsv(logs) {
    const headers = ['timestamp', 'level', 'context', 'message'];
    const csvLines = [headers.join(',')];
    
    logs.forEach(log => {
      const row = [
        log.iso,
        log.level,
        log.context,
        `"${log.message.replace(/"/g, '""')}"`
      ];
      csvLines.push(row.join(','));
    });
    
    return csvLines.join('\n');
  }

  /**
   * 텍스트 내보내기
   * @private
   * @param {Array} logs - 로그 배열
   * @returns {string} 텍스트 문자열
   */
  _exportToText(logs) {
    return logs.map(log => 
      this._formatMessage(log.level, log.message, log.context, log.iso)
    ).join('\n');
  }

  /**
   * 메모리 사용량 추정
   * @private
   * @returns {number} 추정 메모리 사용량 (바이트)
   */
  _estimateMemoryUsage() {
    const jsonString = JSON.stringify(this.logBuffer);
    return jsonString.length * 2; // UTF-16 문자당 2바이트
  }

  /**
   * 로거 정리
   */
  destroy() {
    this.logListeners.clear();
    this.logBuffer = [];
    this.contextStack = [];
    this.stats = {
      total: 0,
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      startTime: Date.now()
    };
  }
}