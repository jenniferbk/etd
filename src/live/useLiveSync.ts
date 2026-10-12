import { useEffect } from 'react';
import { useAuthStore } from '../api/authStore';
import { useCloudStore } from '../store/cloudStore';
import { LiveSession } from './liveSession';

/** Run a live-collaboration session while a signed-in user has a library
 *  diagram open on the canvas. Signed-out and not-in-library diagrams keep
 *  the local-only behavior (browser autosave + file save). */
export function useLiveSync(): void {
  const signedIn = useAuthStore((s) => s.user !== null);
  const diagramId = useCloudStore((s) => s.diagramId);
  const onCanvas = useCloudStore((s) => s.view === 'canvas');

  useEffect(() => {
    if (!signedIn || diagramId === null || !onCanvas) return;
    const session = new LiveSession(diagramId);
    session.start();
    return () => {
      void session.stop();
    };
  }, [signedIn, diagramId, onCanvas]);
}
