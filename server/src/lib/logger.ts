/**
 * Structured JSON Logger for AOD Backend
 *
 * 構造化されたJSON形式でログを出力するロガー。
 * ログレベル、タイムスタンプ、コンテキスト情報を含む。
 */

// ログレベルの定義
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ログレベルの優先度
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ログエントリの型定義
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  requestId?: string;
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
  duration?: number;
}

// ログコンテキストの型定義
export interface LogContext {
  module?: string;
  requestId?: string;
  agentId?: string;
  sessionId?: string;
  taskId?: string;
}

// 環境変数からログレベルを取得
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level && level in LOG_LEVELS) {
    return level as LogLevel;
  }
  // デフォルトは info
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

// グローバル設定
let currentLogLevel: LogLevel = getLogLevel();
let prettyPrint = process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV !== 'production';

/**
 * ログレベルを設定
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * 現在のログレベルを取得
 */
export function getConfiguredLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Pretty print設定を変更
 */
export function setPrettyPrint(enabled: boolean): void {
  prettyPrint = enabled;
}

/**
 * ログエントリを出力
 */
function writeLog(entry: LogEntry): void {
  const logLevelValue = LOG_LEVELS[entry.level];
  const currentLevelValue = LOG_LEVELS[currentLogLevel];

  // ログレベルフィルタリング
  if (logLevelValue < currentLevelValue) {
    return;
  }

  // JSONに変換
  const output = prettyPrint
    ? JSON.stringify(entry, null, 2)
    : JSON.stringify(entry);

  // エラーレベルはstderr、それ以外はstdout
  if (entry.level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}

/**
 * ログエントリを作成
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  metadata?: Record<string, unknown>,
  error?: Error | unknown
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  // コンテキスト情報を追加
  if (context) {
    if (context.module) entry.module = context.module;
    if (context.requestId) entry.requestId = context.requestId;
    if (context.agentId) entry.agentId = context.agentId;
    if (context.sessionId) entry.sessionId = context.sessionId;
    if (context.taskId) entry.taskId = context.taskId;
  }

  // エラー情報を追加
  if (error) {
    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else {
      entry.error = {
        name: 'UnknownError',
        message: String(error),
      };
    }
  }

  // メタデータを追加
  if (metadata && Object.keys(metadata).length > 0) {
    entry.metadata = metadata;
  }

  return entry;
}

/**
 * Loggerクラス - モジュール固有のコンテキストを持つロガー
 */
export class Logger {
  private context: LogContext;

  constructor(moduleOrContext: string | LogContext) {
    if (typeof moduleOrContext === 'string') {
      this.context = { module: moduleOrContext };
    } else {
      this.context = moduleOrContext;
    }
  }

  /**
   * コンテキストを拡張した新しいロガーを作成
   */
  child(additionalContext: Partial<LogContext>): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * デバッグログ
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    const entry = createLogEntry('debug', message, this.context, metadata);
    writeLog(entry);
  }

  /**
   * 情報ログ
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    const entry = createLogEntry('info', message, this.context, metadata);
    writeLog(entry);
  }

  /**
   * 警告ログ
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    const entry = createLogEntry('warn', message, this.context, metadata);
    writeLog(entry);
  }

  /**
   * エラーログ
   */
  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    const entry = createLogEntry('error', message, this.context, metadata, error);
    writeLog(entry);
  }

  /**
   * 処理時間を計測しながらログ出力
   */
  time<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.info(`${label} completed`, { duration: Math.round(duration * 100) / 100 });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, error, { duration: Math.round(duration * 100) / 100 });
      throw error;
    }
  }

  /**
   * 非同期処理時間を計測しながらログ出力
   */
  async timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.info(`${label} completed`, { duration: Math.round(duration * 100) / 100 });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, error, { duration: Math.round(duration * 100) / 100 });
      throw error;
    }
  }
}

/**
 * デフォルトのロガーインスタンス
 */
export const logger = new Logger('app');

/**
 * モジュール用のロガーを作成するファクトリー関数
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/**
 * リクエストIDを生成
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Honoミドルウェア用のリクエストロガー
 */
export function requestLogger(moduleName = 'http') {
  const log = createLogger(moduleName);

  return async (c: { req: { method: string; url: string; header: (name: string) => string | undefined }; set: (key: string, value: string) => void; res: { status: number } }, next: () => Promise<void>) => {
    const requestId = c.req.header('x-request-id') || generateRequestId();
    const start = performance.now();

    // リクエストIDをコンテキストに設定
    c.set('requestId', requestId);

    const requestLog = log.child({ requestId });
    const { method, url } = c.req;
    const path = new URL(url).pathname;

    requestLog.info('Request received', { method, path });

    try {
      await next();
      const duration = performance.now() - start;
      requestLog.info('Request completed', {
        method,
        path,
        status: c.res.status,
        duration: Math.round(duration * 100) / 100,
      });
    } catch (error) {
      const duration = performance.now() - start;
      requestLog.error('Request failed', error, {
        method,
        path,
        duration: Math.round(duration * 100) / 100,
      });
      throw error;
    }
  };
}

// 便利なシングルトン関数
export const debug = (message: string, metadata?: Record<string, unknown>) => logger.debug(message, metadata);
export const info = (message: string, metadata?: Record<string, unknown>) => logger.info(message, metadata);
export const warn = (message: string, metadata?: Record<string, unknown>) => logger.warn(message, metadata);
export const error = (message: string, err?: Error | unknown, metadata?: Record<string, unknown>) => logger.error(message, err, metadata);
