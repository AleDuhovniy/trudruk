export interface ScenarioProgress {
  completedStepIds: string[];
  downloadedTemplateIds: string[];
  answers: Record<string, string>;
  questionnaireCompleted: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'disciplinary-assistant-progress';

export type ProgressState = Record<string, ScenarioProgress>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const asStringRecord = (value: unknown): Record<string, string> => {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
};

const sanitizeScenarioProgress = (value: unknown): ScenarioProgress => {
  if (!isPlainObject(value)) {
    return emptyScenarioProgress();
  }

  const updatedAt =
    typeof value.updatedAt === 'string' && value.updatedAt.length > 0
      ? value.updatedAt
      : new Date().toISOString();

  return {
    completedStepIds: asStringArray(value.completedStepIds),
    downloadedTemplateIds: asStringArray(value.downloadedTemplateIds),
    answers: asStringRecord(value.answers),
    questionnaireCompleted: value.questionnaireCompleted === true,
    updatedAt,
  };
};

export const loadProgress = (): ProgressState => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isPlainObject(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([scenarioId, scenarioProgress]) => [
        scenarioId,
        sanitizeScenarioProgress(scenarioProgress),
      ]),
    );
  } catch {
    return {};
  }
};

export const saveProgress = (state: ProgressState) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // If the browser blocks storage or the quota is exceeded, the app keeps working without crashing.
  }
};

export const emptyScenarioProgress = (): ScenarioProgress => ({
  completedStepIds: [],
  downloadedTemplateIds: [],
  answers: {},
  questionnaireCompleted: false,
  updatedAt: new Date().toISOString(),
});
