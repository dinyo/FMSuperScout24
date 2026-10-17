'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createInterface } = require('readline');

// Keep the native FM-process query worker warm between manually requested batches.
// Each request still validates the active club and executable code.
let queue = Promise.resolve();
let worker = null;
let pending = null;
let idleTimer = null;
function stopNativeTransferWorker() {
  clearTimeout(idleTimer);
  const child = worker;
  worker = null;
  if (child) child.kill();
}
function getWorker() {
  if (worker) return worker;
  const root = path.join(__dirname, '..');
  const exe = [process.env.FMSS_NATIVE_QUERY,
    path.join(root, 'reader', 'bin', 'native-query', 'FMSuperScout24.NativeQuery.exe'),
    path.join(root, 'reader', 'FMSuperScout24.NativeQuery.exe'),
  ].filter(Boolean).find((file) => fs.existsSync(file));
  const command = exe || process.env.FMSS_NATIVE_PYTHON || 'python';
  const args = exe ? ['--serve'] : ['-X', 'utf8', path.join(root, 'reader', 'native_query', 'query.py'), '--serve'];
  const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  worker = child;
  let stderr = '';
  child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-400); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (worker !== child || !pending) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    try {
      const result = JSON.parse(line);
      if (!result.ok) throw new Error(result.error || 'FM native query failed.');
      current.resolve(result);
    } catch (error) { current.reject(error); }
  });
  const fail = (error) => {
    if (worker !== child) return;
    worker = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = null;
    }
    lines.close();
  };
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.on('exit', () => fail(new Error(stderr || 'FM native worker stopped.')));
  return child;
}
function queryNativeTransfer(ids = null) {
  const task = queue.then(() => new Promise((resolve, reject) => {
    clearTimeout(idleTimer);
    const child = getWorker();
    const timeoutMs = ids ? Math.min(10 * 60 * 1000, Math.max(60000, ids.length * 2500)) : 60000;
    const timer = setTimeout(() => {
      pending = null;
      stopNativeTransferWorker();
      reject(new Error('FM native query timed out.'));
    }, timeoutMs);
    pending = { resolve, reject, timer };
    child.stdin.write(JSON.stringify({ ids }) + '\n');
  })).finally(() => {
    idleTimer = setTimeout(stopNativeTransferWorker, 60000);
    idleTimer.unref();
  });
  queue = task.catch(() => {});
  return task;
}
process.once('exit', stopNativeTransferWorker);
module.exports = { queryNativeTransfer, stopNativeTransferWorker };
