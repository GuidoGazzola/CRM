import React, { createContext, useContext, useState } from 'react';

type Role = 'admin' | 'user';

interface User {
  name: string;
  role: Role;
  email?: string;
  id?: string;
  isLoading?: boolean;
}

interface UserContextType {
  user: User;
  setUser: (user: User) => void;
  isAdmin: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>({ name: 'Usuario', role: 'admin', isLoading: true });

  // Si está cargando, asumimos true para no deshabilitar botones de forma abrupta
  const isAdmin = user.isLoading || user.role === 'admin';

  return (
    <UserContext.Provider value={{ user, setUser, isAdmin }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
