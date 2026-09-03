import { Disc3 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Artwork({ artwork, className = '' }: { artwork?: Blob; className?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!artwork) return;
    const next = URL.createObjectURL(artwork);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artwork]);
  return <span className={`artwork ${className}`} style={url ? { backgroundImage: `url(${url})` } : undefined}>{!url && <Disc3 />}</span>;
}
