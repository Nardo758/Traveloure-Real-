import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Train } from 'lucide-react';

interface TwelveGoWidgetProps {
  type?: 'search' | 'timetable' | 'city';
  from?: string;
  to?: string;
  language?: string;
  className?: string;
}

export function TwelveGoWidget({
  type = 'search',
  from,
  to,
  language = 'en',
  className = ''
}: TwelveGoWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const affiliateId = '13805109';

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    if (type === 'search') {
      const iframe = document.createElement('iframe');
      let src = `https://12go.asia/en/searchwidget?z=0&marker=${affiliateId}`;
      if (from) src += `&from=${encodeURIComponent(from)}`;
      if (to) src += `&to=${encodeURIComponent(to)}`;
      
      iframe.src = src;
      iframe.width = '100%';
      iframe.height = '400';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '8px';
      iframe.title = '12Go Transportation Search';
      container.appendChild(iframe);
    } else if (type === 'timetable') {
      const iframe = document.createElement('iframe');
      let src = `https://12go.asia/en/timetable?marker=${affiliateId}`;
      if (from && to) {
        src = `https://12go.asia/en/travel/${encodeURIComponent(from)}/${encodeURIComponent(to)}?marker=${affiliateId}`;
      }
      iframe.src = src;
      iframe.width = '100%';
      iframe.height = '500';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '8px';
      iframe.title = '12Go Timetable';
      container.appendChild(iframe);
    } else if (type === 'city') {
      const iframe = document.createElement('iframe');
      const city = from || 'bangkok';
      iframe.src = `https://12go.asia/en/travel/${encodeURIComponent(city)}?marker=${affiliateId}`;
      iframe.width = '100%';
      iframe.height = '500';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '8px';
      iframe.title = `Transportation from ${city}`;
      container.appendChild(iframe);
    }

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [type, from, to, language]);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Train className="h-5 w-5" />
          Book Transportation with 12Go
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div 
          ref={containerRef} 
          className="min-h-[400px] rounded-lg overflow-hidden"
          data-testid="twelve-go-widget-container"
        />
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Powered by 12Go Asia - Trains, buses, ferries & flights across Asia
        </p>
      </CardContent>
    </Card>
  );
}

export function TwelveGoDeepLink({
  from,
  to,
  children,
  className = ''
}: {
  from: string;
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  const affiliateId = '13805109';
  const url = `https://12go.asia/en/travel/${encodeURIComponent(from)}/${encodeURIComponent(to)}?marker=${affiliateId}`;
  
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className={className}
      data-testid={`twelve-go-link-${from}-${to}`}
    >
      {children}
    </a>
  );
}
