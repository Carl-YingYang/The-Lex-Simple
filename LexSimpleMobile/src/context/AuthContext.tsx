import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { enterGuest, leaveGuest, wasGuestSelected } from '../services/guestAccess';
import { migrateLegacyDataToGuest, setLocalOwner } from '../services/localDataScope';
import { waitForScanHistoryWrites } from '../services/scanHistoryStorage';
import { supabase } from '../services/supabaseClient';

type Phase = 'loading' | 'login' | 'guest' | 'user' | 'recovery' | 'error';
type AuthValue = {
    phase: Phase;
    user: User | null;
    continueAsGuest: () => Promise<void>;
    signOut: () => Promise<void>;
    beginRecovery: () => void;
    finishRecovery: () => Promise<void>;
    cancelRecovery: () => Promise<void>;
    retry: () => Promise<void>;
};
const Context = createContext<AuthValue | null>(null);

export const useAuth = (): AuthValue => {
    const context = useContext(Context);
    if (!context) throw new Error('AuthProvider missing');
    return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [phase, setPhase] = useState<Phase>('loading');
    const [user, setUser] = useState<User | null>(null);
    const recovery = useRef(false);
    const guest = useRef(false);
    const alive = useRef(true);
    const queue = useRef<Promise<unknown>>(Promise.resolve());

    const applySession = useCallback((session: Session | null, guestSelected: boolean): Promise<void> => {
        const isRecovery = recovery.current;
        const operation = queue.current.then(async () => {
            await migrateLegacyDataToGuest();
            await waitForScanHistoryWrites();
            if (!alive.current) return;
            const owner = session?.user ? `user:${session.user.id}` as const : 'guest';
            setLocalOwner(owner);
            setUser(session?.user || null);
            setPhase(isRecovery ? 'recovery' : session?.user ? 'user' : guestSelected ? 'guest' : 'login');
        });
        queue.current = operation.catch((error) => {
            console.warn('[Auth] Unable to prepare local data', error);
            if (alive.current) setPhase('error');
        });
        return operation;
    }, []);

    const initialize = useCallback(async () => {
        setPhase('loading');
        guest.current = await wasGuestSelected();
        const { data, error } = supabase
            ? await supabase.auth.getSession()
            : { data: { session: null }, error: null };
        if (error) throw error;
        await applySession(data.session, guest.current);
    }, [applySession]);

    useEffect(() => {
        alive.current = true;
        const listener = supabase?.auth.onAuthStateChange((_event, session) => {
            // Supabase auth calls must not be awaited in this callback.
            void applySession(session, guest.current);
        });
        void initialize().catch((error) => {
            console.warn('[Auth] Startup failed', error);
            if (alive.current) setPhase('error');
        });
        return () => {
            alive.current = false;
            listener?.data.subscription.unsubscribe();
        };
    }, [applySession, initialize]);

    const continueAsGuest = async () => {
        if (supabase) {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
            }
        }
        await enterGuest();
        guest.current = true;
        recovery.current = false;
        await applySession(null, true);
    };

    const signOut = async () => {
        const previous = phase;
        setPhase('loading');
        try {
            if (supabase && user) {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
            }
            await leaveGuest();
            guest.current = false;
            recovery.current = false;
            await applySession(null, false);
        } catch (error) {
            setPhase(previous);
            throw error;
        }
    };

    const finishRecovery = async () => {
        if (!supabase) throw new Error('Supabase is not configured');
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        recovery.current = false;
        guest.current = false;
        await leaveGuest();
        await applySession(null, false);
    };

    const value: AuthValue = {
        phase,
        user,
        continueAsGuest,
        signOut,
        beginRecovery: () => { recovery.current = true; setPhase('recovery'); },
        finishRecovery,
        cancelRecovery: async () => {
            if (supabase) {
                const { data } = await supabase.auth.getSession();
                if (data.session) {
                    const { error } = await supabase.auth.signOut();
                    if (error) throw error;
                }
            }
            recovery.current = false;
            await applySession(null, false);
        },
        retry: initialize,
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
}