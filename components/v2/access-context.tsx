'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Permission, Role } from '@/lib/auth/permissions';
import { errorText, requestV2 } from '@/components/v2/api-client';

export type CurrentAccess = {
  userId: string;
  userName: string;
  organizationId: string;
  locationId: string;
  role: Role;
  permissions: Permission[];
  authMode: 'session' | 'feature-flag-disabled';
};

type AccessState = {
  access: CurrentAccess | null;
  loading: boolean;
  error: string | null;
  can: (permission: Permission) => boolean;
};

const AccessContext = createContext<AccessState | null>(null);

export function CurrentAccessProvider({
  children,
  enabled = true,
}: PropsWithChildren<{ enabled?: boolean }>) {
  const [access, setAccess] = useState<CurrentAccess | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    requestV2<CurrentAccess>('/api/v2/auth/me', { signal: controller.signal })
      .then((result) => {
        setAccess(result);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(errorText(requestError, 'Không thể xác minh quyền tài khoản.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled]);

  const value = useMemo<AccessState>(() => {
    const permissions = new Set(access?.permissions ?? []);
    return {
      access,
      loading,
      error,
      can: (permission) => !enabled || permissions.has(permission),
    };
  }, [access, enabled, error, loading]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useCurrentAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error('useCurrentAccess phải được dùng bên trong CurrentAccessProvider.');
  }
  return context;
}

export function roleLabel(role: Role | undefined) {
  if (role === 'owner') return 'Chủ quán';
  if (role === 'staff') return 'Nhân viên';
  if (role === 'viewer') return 'Chỉ xem';
  return 'Đang xác minh';
}
