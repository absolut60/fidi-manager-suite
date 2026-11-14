import { createContext, useContext } from "react";

/** Published by AppShell: consumers never install a second scroll listener. */
export const BarraBluContext = createContext(false);
export const useBarraBluNascosta = () => useContext(BarraBluContext);