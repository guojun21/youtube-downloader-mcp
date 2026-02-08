import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: number;
}

/**
 * Why: reusable spinning loader icon — avoids repeating
 * <Loader2 className="spin" /> + size prop across many components.
 */
export function Spinner({ size = 18 }: SpinnerProps) {
  return <Loader2 className="spin" size={size} />;
}
