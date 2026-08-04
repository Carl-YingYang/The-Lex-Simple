import React, { createContext, useContext, useState } from 'react';

const BackgroundProcessContext = createContext({
    isProcessing: false,
    startProcess: (p0: () => Promise<any>, p1: string) => { },
    endProcess: () => { }
});

export const BackgroundProcessProvider = ({ children }: any) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const startProcess = () => setIsProcessing(true);
    const endProcess = () => setIsProcessing(false);

    return (
        <BackgroundProcessContext.Provider value={{ isProcessing, startProcess, endProcess }}>
            {children}
        </BackgroundProcessContext.Provider>
    );
};

export const useBackgroundProcess = () => useContext(BackgroundProcessContext);