import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export const useHelpMeDecideCleanup = () => {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    const currentPath = pathname;
    const previousPath = previousPathRef.current;

    // Skip the first mount to avoid cleanup on initial load
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousPathRef.current = currentPath;
      return;
    }

    // Check if we're navigating away from help-me-decide
    const wasInHelpMeDecide = previousPath.startsWith('/help-me-decide');
    const isInHelpMeDecide = currentPath.startsWith('/help-me-decide');

    // If we were in help-me-decide but now we're not, clean up localStorage
    if (wasInHelpMeDecide && !isInHelpMeDecide) {
      // Remove all help-me-decide related localStorage items
      const itemsToRemove = [
        'savedActivities',
        'savedPlaces',
        'savedActivities', // This appears twice in the user's request, keeping it for consistency
        'selectedEventDate',
        'selectedDateEvents'
      ];

      itemsToRemove.forEach(item => {
        if (localStorage.getItem(item)) {
          localStorage.removeItem(item);
        }
      });

      // Dispatch custom events to notify other components about the cleanup
      window.dispatchEvent(new CustomEvent('helpMeDecideCleanup', {
        detail: { 
          action: 'cleanup',
          removedItems: itemsToRemove,
          fromPath: previousPath,
          toPath: currentPath
        }
      }));
    }

    // Update the previous path reference
    previousPathRef.current = currentPath;
  }, [pathname]);

  // Also handle cleanup on component unmount if we're still in help-me-decide
  useEffect(() => {
    return () => {
      // If the component is unmounting and we're in help-me-decide, 
      // it might mean the user is navigating away
      if (pathname.startsWith('/help-me-decide')) {
        // Add a small delay to check if we're actually navigating away
        setTimeout(() => {
          const currentPath = window.location.pathname;
          if (!currentPath.startsWith('/help-me-decide')) {
            
            const itemsToRemove = [
              'savedActivities',
              'savedPlaces',
              'savedActivities',
              'selectedEventDate',
              'selectedDateEvents'
            ];

            itemsToRemove.forEach(item => {
              if (localStorage.getItem(item)) {
                localStorage.removeItem(item);
              }
            });

            window.dispatchEvent(new CustomEvent('helpMeDecideCleanup', {
              detail: { 
                action: 'cleanup',
                removedItems: itemsToRemove,
                fromPath: pathname,
                toPath: currentPath,
                source: 'unmount'
              }
            }));
          }
        }, 100);
      }
    };
  }, [pathname]);
}; 