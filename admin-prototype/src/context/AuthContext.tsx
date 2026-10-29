import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, RoleCode } from '../types';
import { INITIAL_USER } from '../lib/api';
import { getPermissions, type Permissions } from '../lib/permissions';

interface AuthContextType {
  user: User | null;
  permissions: Permissions;
  isAuthenticated: boolean;
  requires2FA: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; requires2FA: boolean; error?: string }>;
  verify2FA: (code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchRole: (role: RoleCode) => void;
  branchScope?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(INITIAL_USER);
  const [requires2FA, setRequires2FA] = useState<boolean>(false);
  const [tempUser, setTempUser] = useState<User | null>(null);

  // Sync permissions whenever role changes
  const permissions = user ? getPermissions(user.role) : getPermissions('editor');

  const login = async (email: string, pass: string) => {
    // In dev / mock mode:
    if (!email || !pass) {
      return { success: false, requires2FA: false, error: 'Enter email and password' };
    }
    // Simulate real Argon2 verification followed by mandatory 2FA TOTP requirement
    const candidate: User = {
      ...INITIAL_USER,
      email,
    };
    setTempUser(candidate);
    setRequires2FA(true);
    return { success: true, requires2FA: true };
  };

  const verify2FA = async (code: string) => {
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      return { success: false, error: 'Enter a valid 6-digit Authenticator code' };
    }
    if (tempUser) {
      setUser(tempUser);
      setTempUser(null);
      setRequires2FA(false);
      return { success: true };
    }
    return { success: false, error: 'Session expired, please login again' };
  };

  const logout = () => {
    setUser(null);
    setTempUser(null);
    setRequires2FA(false);
  };

  const switchRole = (role: RoleCode) => {
    if (!user) return;
    const titles: Record<RoleCode, string> = {
      super_admin: 'Super Administrator',
      admin: 'Administrator',
      editor: 'Content Editor',
      finance_maker: 'Finance Officer (Maker)',
      finance_checker: 'General Manager (Checker)',
      branch_manager: 'Branch Manager (Solapur Main)',
      hr: 'HR Manager',
      auditor: 'Internal Auditor',
    };
    setUser({
      ...user,
      role,
      roleTitle: titles[role],
      branchId: role === 'branch_manager' ? 'br_solapur_main' : undefined,
      branchName: role === 'branch_manager' ? 'Solapur Main' : undefined,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isAuthenticated: !!user,
        requires2FA,
        login,
        verify2FA,
        logout,
        switchRole,
        branchScope: user?.branchName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
