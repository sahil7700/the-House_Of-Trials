"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type AuthProviderComponent = ComponentType<{ children: ReactNode }>;

export function ConditionalAuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [AuthProvider, setAuthProvider] = useState<AuthProviderComponent | null>(null);

  const shouldLoadAuth = pathname !== "/";

  useEffect(() => {
    let isMounted = true;

    if (!shouldLoadAuth) {
      setAuthProvider(null);
      return () => {
        isMounted = false;
      };
    }

    import("@/lib/auth-context").then((mod) => {
      if (isMounted) {
        setAuthProvider(() => mod.AuthProvider);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [shouldLoadAuth]);

  if (!shouldLoadAuth || !AuthProvider) {
    return <>{children}</>;
  }

  return <AuthProvider>{children}</AuthProvider>;
}
