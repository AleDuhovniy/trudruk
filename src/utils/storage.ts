export interface ScenarioProgress {
  completedStepIds: string[];
  downloadedTemplateIds: string[];
  answers: Record<string, string>;
  questionnaireCompleted: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'disciplinary-assistant-progress';

export type ProgressState = Record<string, ScenarioProgress>;

export const loadProgress = (): ProgressState => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as ProgressState;
    return parsed ?? {};
  } catch {
    return {};
  }
};

export const saveProgress = (state: ProgressState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const emptyScenarioProgress = (): ScenarioProgress => ({
  completedStepIds: [],
  downloadedTemplateIds: [],
  answers: {},
  questionnaireCompleted: false,
  updatedAt: new Date().toISOString(),
});
