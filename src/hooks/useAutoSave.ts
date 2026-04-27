import { useEffect, useRef } from 'react';
import { useDiagramStore } from '../store';
import type { Transcript, StyleConfig } from '../types';

const AUTO_SAVE_KEY = 'toulmin-diagram-autosave';
const AUTO_SAVE_INTERVAL = 60000; // 60 seconds

interface AutoSaveData {
  elements: ReturnType<typeof useDiagramStore.getState>['elements'];
  connections: ReturnType<typeof useDiagramStore.getState>['connections'];
  transcript: Transcript | null;
  styleConfig: StyleConfig;
  timestamp: number;
}

export function useAutoSave() {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Start auto-save interval
    intervalRef.current = window.setInterval(() => {
      const state = useDiagramStore.getState();

      // Save if there's any work in progress: diagram content or a loaded transcript.
      if (state.elements.length > 0 || state.connections.length > 0 || state.transcript !== null) {
        const data: AutoSaveData = {
          elements: state.elements,
          connections: state.connections,
          transcript: state.transcript,
          styleConfig: state.styleConfig,
          timestamp: Date.now(),
        };

        try {
          localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data));
          console.log('Auto-saved diagram at', new Date().toLocaleTimeString());
        } catch (e) {
          console.error('Failed to auto-save:', e);
        }
      }
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}

export function getAutoSavedData(): AutoSaveData | null {
  try {
    const saved = localStorage.getItem(AUTO_SAVE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to parse auto-save data:', e);
  }
  return null;
}

export function clearAutoSave(): void {
  try {
    localStorage.removeItem(AUTO_SAVE_KEY);
  } catch (e) {
    console.error('Failed to clear auto-save:', e);
  }
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}
