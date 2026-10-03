"use client";

import { createContext, useContext, type ReactNode } from "react";

const UserContext = createContext("me");

export function UserProvider({ user, children }: { user: string; children: ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** The signed-in username; keys this person's data in the browser. */
export const useUser = () => useContext(UserContext);
