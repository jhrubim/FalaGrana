import { DeviceEventEmitter } from 'react-native';

let __fg_error_guard_inited = false;

export function initErrorGuard() {
  if (__fg_error_guard_inited) return;
  __fg_error_guard_inited = true;

  const ErrorUtilsAny = global?.ErrorUtils;

  if (
    !ErrorUtilsAny ||
    typeof ErrorUtilsAny.getGlobalHandler !== 'function' ||
    typeof ErrorUtilsAny.setGlobalHandler !== 'function'
  ) {
    return;
  }

  const defaultHandler = ErrorUtilsAny.getGlobalHandler();

  ErrorUtilsAny.setGlobalHandler((error, isFatal) => {
    try {
      DeviceEventEmitter.emit('FG_APP_ERROR', { error, isFatal });
    } catch (_) {}
