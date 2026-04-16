import { useCallback, useEffect, useRef, useState } from 'react';
import { getUniqueItemIds } from './canvasHelpers';

export function useCanvasFrameAnimation() {
  const [frameItemAnimations, setFrameItemAnimations] = useState<
    Record<string, 'ingest' | 'eject'>
  >({});
  const frameAnimationTimersRef = useRef(new Map<string, number>());

  const triggerFrameItemAnimation = useCallback(
    (itemIds: string[], animation: 'ingest' | 'eject') => {
      const normalizedIds = getUniqueItemIds(itemIds);
      if (normalizedIds.length === 0) {
        return;
      }

      setFrameItemAnimations((current) => {
        const next = { ...current };
        for (const itemId of normalizedIds) {
          next[itemId] = animation;
        }
        return next;
      });

      for (const itemId of normalizedIds) {
        const currentTimer = frameAnimationTimersRef.current.get(itemId);
        if (currentTimer !== undefined) {
          window.clearTimeout(currentTimer);
        }

        const nextTimer = window.setTimeout(() => {
          frameAnimationTimersRef.current.delete(itemId);
          setFrameItemAnimations((current) => {
            if (current[itemId] === undefined) {
              return current;
            }

            const next = { ...current };
            delete next[itemId];
            return next;
          });
        }, 280);

        frameAnimationTimersRef.current.set(itemId, nextTimer);
      }
    },
    [],
  );

  useEffect(() => {
    const animationTimers = frameAnimationTimersRef.current;
    return () => {
      for (const timerId of animationTimers.values()) {
        window.clearTimeout(timerId);
      }
      animationTimers.clear();
    };
  }, []);

  return { frameItemAnimations, triggerFrameItemAnimation };
}
