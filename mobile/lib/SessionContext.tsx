import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

type SessionState = {
  activeSessionId: string | null;
  activeSessionType: string;
  activeSessionStart: number | null; // timestamp ms
  pendingPostSurveyId: string | null;
};

type SessionContextType = SessionState & {
  startSession: (id: string, type: string) => void;
  endSession: (id: string) => void;
  clearPendingPostSurvey: () => void;
  resetSession: () => void;
};

const STORAGE_KEY = 'focus_ai_session_state';

const defaultState: SessionState = {
  activeSessionId: null,
  activeSessionType: 'OTHER',
  activeSessionStart: null,
  pendingPostSurveyId: null,
};

const SessionContext = createContext<SessionContextType>({
  ...defaultState,
  startSession: () => {},
  endSession: () => {},
  clearPendingPostSurvey: () => {},
  resetSession: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(defaultState);

  // Load persisted state on mount — apply cache immediately, validate in background
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved: SessionState = JSON.parse(raw);
        // Set state immediately from cache — don't wait for backend
        setState(saved);

        // Validate in background — update if stale
        if (saved.pendingPostSurveyId) {
          api.get<{ session: { post_survey: any } }>(
            `/sessions/${saved.pendingPostSurveyId}`
          ).then((data: { session: { post_survey: any } }) => {
            if (data.session?.post_survey) {
              persist({ ...defaultState });
            }
          }).catch(() => {});
        }

        if (saved.activeSessionId) {
          api.get<{ session: { status: string; post_survey: any } }>(
            `/sessions/${saved.activeSessionId}`
          ).then((data: { session: { status: string; post_survey: any } }) => {
            if (data.session?.status === 'COMPLETED' && !data.session?.post_survey) {
              persist({ ...defaultState, pendingPostSurveyId: saved.activeSessionId });
            } else if (data.session?.status === 'COMPLETED' && data.session?.post_survey) {
              persist({ ...defaultState });
            }
          }).catch(() => {});
        }
      } catch {}
    });
  }, []);

  function persist(newState: SessionState) {
    setState(newState);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  }

  function startSession(id: string, type: string) {
    persist({
      activeSessionId: id,
      activeSessionType: type,
      activeSessionStart: Date.now(),
      pendingPostSurveyId: null,
    });
  }

  function endSession(id: string) {
    persist({
      activeSessionId: null,
      activeSessionType: 'OTHER',
      activeSessionStart: null,
      pendingPostSurveyId: id,
    });
  }

  function clearPendingPostSurvey() {
    persist(defaultState);
  }

  function resetSession() {
    persist(defaultState);
  }

  return (
    <SessionContext.Provider value={{ ...state, startSession, endSession, clearPendingPostSurvey, resetSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  return useContext(SessionContext);
}
