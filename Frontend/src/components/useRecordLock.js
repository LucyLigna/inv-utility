import { useEffect, useRef } from 'react';
import api, { errorMessage, getToken } from '../api';

// One page at a time per record (a trip sheet in Trip Sheet - Bill Details, a trip route in Trip Route Wise
// Customers). The page takes the record's lock on Process, renews it every 30 s, and releases it when it processes
// another record, moves to another screen or closes. Every request from the page carries its lock id
// (X-Record-Lock), and the server refuses changes from a page that doesn't hold the lock.
//
//   const { take, lockedCode } = useRecordLock('/trip-sheet-bills', openCode, onLost)
//   take(code) -> { ok: true } | { ok: false, message }   (ok without a lock for users who may only view)
//   openCode: the record open on the page now (renewed while set); onLost(message): another page took it

const RENEW_MS = 30000;
// Not crypto.randomUUID: that needs https
const newLockId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// keepalive lets the request finish while the page is closing
const releaseLock = (basePath, code, lockId) => fetch(`/api${basePath}/${code}/lock`, {
  method: 'DELETE',
  keepalive: true,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, 'X-Record-Lock': lockId },
  body: JSON.stringify({ lockId }),
}).catch(() => { /* it expires by itself */ });

export default function useRecordLock(basePath, openCode, onLost) {
  const lockId = useRef(newLockId());
  const lockedCode = useRef(null);
  const lost = useRef(onLost);
  lost.current = onLost;

  useEffect(() => {
    api.defaults.headers.common['X-Record-Lock'] = lockId.current;
    const onUnload = () => { if (lockedCode.current != null) releaseLock(basePath, lockedCode.current, lockId.current); };
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      onUnload();
      lockedCode.current = null;
      if (api.defaults.headers.common['X-Record-Lock'] === lockId.current) delete api.defaults.headers.common['X-Record-Lock'];
    };
  }, [basePath]);

  // Keep the lock while the record is open here; if it was lost (e.g. the PC slept and another page took it), say so
  useEffect(() => {
    if (openCode == null) return undefined;
    const timer = setInterval(async () => {
      try {
        await api.post(`${basePath}/${openCode}/lock`, { lockId: lockId.current });
      } catch (err) {
        if (err.response?.status === 409) {
          lockedCode.current = null;
          lost.current(errorMessage(err));
        }
      }
    }, RENEW_MS);
    return () => clearInterval(timer);
  }, [basePath, openCode]);

  const take = async (code) => {
    try {
      await api.post(`${basePath}/${code}/lock`, { lockId: lockId.current });
    } catch (err) {
      if (err.response?.status === 403) return { ok: true }; // may only view: no lock needed, changes are refused anyway
      return { ok: false, message: errorMessage(err) };
    }
    if (lockedCode.current != null && lockedCode.current !== code) releaseLock(basePath, lockedCode.current, lockId.current);
    lockedCode.current = code;
    return { ok: true };
  };

  return { take, lockedCode };
}
