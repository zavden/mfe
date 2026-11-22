import { useEffect, useState } from 'react';
import { canEncodeAac } from '../../export/audio';

/** Whether this browser encodes AAC: `null` until it has answered (at once, in practice). */
export function useAacSupport(): boolean | null {
  const [aac, setAac] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void canEncodeAac().then((answer) => {
      if (current) setAac(answer);
    });
    return () => {
      current = false;
    };
  }, []);
  return aac;
}
