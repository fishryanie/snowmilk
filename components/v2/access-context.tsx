'use client';

import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import type { Permission, Role } from '@/lib/auth/permissions';
import { errorText } from '@/components/v2/api-client';
import { useApiQuery } from '@/hooks/use-api-data';

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
  const query = useApiQuery<CurrentAccess>(enabled ? '/api/v2/auth/me' : null);
  const access = query.data ?? null;
  const loading = query.loading;
  const error = query.error ? errorText(query.error, 'Không thể xác minh quyền tài khoản.') : null;

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
