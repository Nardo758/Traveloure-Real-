import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { SignInModal } from "@/components/SignInModal";

interface SignInModalOptions {
  title?: string;
  description?: string;
}

interface SignInModalContextType {
  openSignInModal: (options?: SignInModalOptions) => void;
  closeSignInModal: () => void;
  isOpen: boolean;
}

const SignInModalContext = createContext<SignInModalContextType | undefined>(undefined);

export function SignInModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<SignInModalOptions>({});

  const openSignInModal = useCallback((opts?: SignInModalOptions) => {
    setOptions(opts || {});
    setIsOpen(true);
  }, []);

  const closeSignInModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <SignInModalContext.Provider value={{ openSignInModal, closeSignInModal, isOpen }}>
      {children}
      <SignInModal
        open={isOpen}
        onOpenChange={setIsOpen}
        title={options.title}
        description={options.description}
      />
    </SignInModalContext.Provider>
  );
}

export function useSignInModal() {
  const context = useContext(SignInModalContext);
  if (context === undefined) {
    throw new Error("useSignInModal must be used within a SignInModalProvider");
  }
  return context;
}
