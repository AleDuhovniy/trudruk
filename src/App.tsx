import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { allTemplates, referenceResources, scenarios } from './data/scenarios';
import {
  BranchCondition,
  BranchRisk,
  ReferenceResource,
  Scenario,
  ScenarioQuestion,
  ScenarioRecommendation,
  Step,
  TemplateResource,
} from './types';
import { emptyScenarioProgress, loadProgress, saveProgress, type ProgressState } from './utils/storage';

const getProgressForScenario = (progressState: ProgressState, scenarioId: string) => {
  const stored = progressState[scenarioId];

  if (!stored) {
    return emptyScenarioProgress();
  }

  return {
    ...emptyScenarioProgress(),
    ...stored,
    answers: stored.answers ?? {},
  };
};

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const matchesConditions = (
  conditions: BranchCondition[] | undefined,
  answers: Record<string, string>,
) => {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => condition.values.includes(answers[condition.questionId] ?? ''));
};

const getMatchedBranchRules = (scenario: Scenario, answers: Record<string, string>) =>
  (scenario.branchRules ?? []).filter((rule) => matchesConditions(rule.whenAll, answers));

const getVisibleTemplatesFromStep = (step: Step, answers: Record<string, string>) =>
  [step.templateFile, ...(step.relatedTemplates ?? [])].filter(
    (template): template is TemplateResource => {
      if (!template) {
        return false;
      }

      return matchesConditions(template.visibleWhen, answers);
    },
  );

const getVisibleSteps = (scenario: Scenario, answers: Record<string, string>) => {
  const hiddenStepIds = new Set(
    getMatchedBranchRules(scenario, answers).flatMap((rule) => rule.effects.hiddenStepIds ?? []),
  );

  return scenario.steps.filter(
    (step) => matchesConditions(step.visibleWhen, answers) && !hiddenStepIds.has(step.id),
  );
};

const getVisibleRouteTemplates = (steps: Step[], answers: Record<string, string>) =>
  Array.from(
    new Map(
      steps
        .flatMap((step) => getVisibleTemplatesFromStep(step, answers))
        .map((template) => [template.id, template]),
    ).values(),
  );

const getCompletionPercent = (steps: Step[], completedIds: string[]) => {
  if (steps.length === 0) {
    return 0;
  }

  return Math.round((completedIds.length / steps.length) * 100);
};

const getFirstOpenStepIndex = (steps: Step[], completedIds: string[]) => {
  if (steps.length === 0) {
    return 0;
  }

  const firstIncomplete = steps.findIndex((step) => !completedIds.includes(step.id));
  return firstIncomplete === -1 ? steps.length - 1 : firstIncomplete;
};

const isStepUnlocked = (steps: Step[], stepIndex: number, completedIds: string[]) =>
  stepIndex === 0 || completedIds.includes(steps[stepIndex - 1].id);

const riskLevelClassMap: Record<Scenario['riskLevel'], string> = {
  'Низкий риск': 'risk-low',
  'Средний риск': 'risk-medium',
  'Высокий риск': 'risk-high',
  'Критический риск': 'risk-critical',
};

const branchRiskClassMap: Record<BranchRisk, string> = {
  green: 'signal-green',
  yellow: 'signal-yellow',
  red: 'signal-red',
};

const branchRiskLabelMap: Record<BranchRisk, string> = {
  green: 'Зеленый уровень',
  yellow: 'Желтый уровень',
  red: 'Красный уровень',
};

const serviceOffers = [
  'Пошаговая схема действий по типовой дисциплинарной ситуации',
  'Подбор обязательных документов и шаблонов на каждом этапе',
  'Подсказки по срокам, рискам и дальнейшим действиям',
];

const legalBasisItems = [
  'Статьи 192–194 ТК РФ',
  'Локальные акты и правила внутреннего трудового распорядка',
  'Внутренний порядок дисциплинарной процедуры в вашей организации',
];

type AppStage = 'landing' | 'catalog' | 'workspace';

const App = () => {
  const [appStage, setAppStage] = useState<AppStage>('landing');
  const [catalogScenarioId, setCatalogScenarioId] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarios[0].id);
  const [progressState, setProgressState] = useState<ProgressState>({});
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isEditingAnswers, setIsEditingAnswers] = useState(false);
  const [shouldScrollToCurrentStep, setShouldScrollToCurrentStep] = useState(false);

  useEffect(() => {
    const stored = loadProgress();
    setProgressState(stored);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveProgress(progressState);
  }, [isHydrated, progressState]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (appStage === 'landing') {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [appStage]);

  useEffect(() => {
    if (appStage !== 'catalog') {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById('scenario-catalog')?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [appStage]);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [selectedScenarioId],
  );

  const catalogScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === catalogScenarioId) ?? null,
    [catalogScenarioId],
  );

  const scenarioProgress = useMemo(
    () => getProgressForScenario(progressState, selectedScenario.id),
    [progressState, selectedScenario.id],
  );

  const branchQuestions = selectedScenario.questions ?? [];
  const branchAnswers = scenarioProgress.answers;
  const allQuestionsAnswered = branchQuestions.every((question) => branchAnswers[question.id]);
  const matchedBranchRules = useMemo(
    () => getMatchedBranchRules(selectedScenario, branchAnswers),
    [branchAnswers, selectedScenario],
  );

  const visibleSteps = useMemo(
    () => getVisibleSteps(selectedScenario, branchAnswers),
    [branchAnswers, selectedScenario],
  );

  const visibleRouteTemplates = useMemo(
    () => getVisibleRouteTemplates(visibleSteps, branchAnswers),
    [branchAnswers, visibleSteps],
  );

  useEffect(() => {
    if (branchQuestions.length === 0) {
      setIsEditingAnswers(false);
      return;
    }

    if (!scenarioProgress.questionnaireCompleted || !allQuestionsAnswered) {
      setIsEditingAnswers(true);
    } else {
      setIsEditingAnswers(false);
    }
  }, [
    allQuestionsAnswered,
    branchQuestions.length,
    scenarioProgress.questionnaireCompleted,
    selectedScenario.id,
  ]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    setProgressState((current) => {
      const currentScenarioProgress = getProgressForScenario(current, selectedScenario.id);
      const visibleStepIds = new Set(visibleSteps.map((step) => step.id));
      const visibleTemplateIds = new Set(visibleRouteTemplates.map((template) => template.id));

      const nextCompletedIds = currentScenarioProgress.completedStepIds.filter((id) =>
        visibleStepIds.has(id),
      );
      const nextDownloadedIds = currentScenarioProgress.downloadedTemplateIds.filter((id) =>
        visibleTemplateIds.has(id),
      );

      if (
        arraysEqual(nextCompletedIds, currentScenarioProgress.completedStepIds) &&
        arraysEqual(nextDownloadedIds, currentScenarioProgress.downloadedTemplateIds)
      ) {
        return current;
      }

      return {
        ...current,
        [selectedScenario.id]: {
          ...currentScenarioProgress,
          completedStepIds: nextCompletedIds,
          downloadedTemplateIds: nextDownloadedIds,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, [isHydrated, selectedScenario.id, visibleRouteTemplates, visibleSteps]);

  const completedIds = useMemo(
    () => scenarioProgress.completedStepIds.filter((id) => visibleSteps.some((step) => step.id === id)),
    [scenarioProgress.completedStepIds, visibleSteps],
  );
  const downloadedIds = scenarioProgress.downloadedTemplateIds;

  useEffect(() => {
    setActiveStepIndex((currentIndex) => {
      if (visibleSteps.length === 0) {
        return 0;
      }

      const safeIndex = Math.min(currentIndex, visibleSteps.length - 1);

      if (isStepUnlocked(visibleSteps, safeIndex, completedIds)) {
        return safeIndex;
      }

      return getFirstOpenStepIndex(visibleSteps, completedIds);
    });
  }, [completedIds, visibleSteps]);

  const activeStep = visibleSteps[activeStepIndex] ?? visibleSteps[0] ?? null;

  const routeRecommendation: ScenarioRecommendation | null =
    matchedBranchRules.find((rule) => rule.effects.recommendation)?.effects.recommendation ??
    selectedScenario.defaultRecommendation ??
    null;

  const routeRedFlags = Array.from(
    new Set([
      ...selectedScenario.redFlags,
      ...matchedBranchRules.flatMap((rule) => rule.effects.additionalRedFlags ?? []),
    ]),
  );

  const routeTips = Array.from(
    new Set([
      ...selectedScenario.tips,
      ...matchedBranchRules.flatMap((rule) => rule.effects.additionalTips ?? []),
    ]),
  );

  const highlightedTemplateIds = new Set(
    matchedBranchRules.flatMap((rule) => rule.effects.highlightedTemplateIds ?? []),
  );

  const currentStepTemplates = activeStep
    ? getVisibleTemplatesFromStep(activeStep, branchAnswers).sort((left, right) => {
        const leftWeight = highlightedTemplateIds.has(left.id) ? 0 : 1;
        const rightWeight = highlightedTemplateIds.has(right.id) ? 0 : 1;
        return leftWeight - rightWeight;
      })
    : [];

  const scenarioReferences = referenceResources.filter((resource) =>
    resource.id === 'disciplinary-algorithm' ? true : selectedScenario.id === 'intoxication',
  );

  const showQuestionnaire =
    branchQuestions.length > 0 &&
    (!allQuestionsAnswered || isEditingAnswers || !scenarioProgress.questionnaireCompleted);

  useEffect(() => {
    if (!shouldScrollToCurrentStep || appStage !== 'workspace' || showQuestionnaire) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById('current-step-card')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      setShouldScrollToCurrentStep(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [appStage, shouldScrollToCurrentStep, showQuestionnaire]);

  const catalogProgress = useMemo(
    () => (catalogScenario ? getProgressForScenario(progressState, catalogScenario.id) : emptyScenarioProgress()),
    [catalogScenario, progressState],
  );

  const catalogVisibleSteps = useMemo(
    () => (catalogScenario ? getVisibleSteps(catalogScenario, catalogProgress.answers) : []),
    [catalogProgress.answers, catalogScenario],
  );

  const catalogVisibleTemplates = useMemo(
    () => (catalogScenario ? getVisibleRouteTemplates(catalogVisibleSteps, catalogProgress.answers) : []),
    [catalogProgress.answers, catalogScenario, catalogVisibleSteps],
  );

  const markStep = (scenarioId: string, stepId: string, checked: boolean) => {
    setProgressState((current) => {
      const scenarioData = scenarios.find((scenario) => scenario.id === scenarioId);
      if (!scenarioData) {
        return current;
      }

      const visibleScenarioSteps = getVisibleSteps(
        scenarioData,
        getProgressForScenario(current, scenarioId).answers,
      );
      const currentScenarioProgress = getProgressForScenario(current, scenarioId);
      const stepOrder = visibleScenarioSteps.map((step) => step.id);
      const stepIndex = stepOrder.indexOf(stepId);

      let nextCompletedIds = currentScenarioProgress.completedStepIds.filter((id) =>
        stepOrder.includes(id),
      );

      if (checked) {
        nextCompletedIds = Array.from(new Set([...nextCompletedIds, stepId]));
      } else {
        nextCompletedIds = nextCompletedIds.filter((id) => stepOrder.indexOf(id) < stepIndex);
      }

      return {
        ...current,
        [scenarioId]: {
          ...currentScenarioProgress,
          completedStepIds: nextCompletedIds,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const setScenarioAnswer = (questionId: string, value: string) => {
    setProgressState((current) => {
      const currentScenarioProgress = getProgressForScenario(current, selectedScenario.id);

      return {
        ...current,
        [selectedScenario.id]: {
          ...currentScenarioProgress,
          answers: {
            ...currentScenarioProgress.answers,
            [questionId]: value,
          },
          questionnaireCompleted: false,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const buildRoute = () => {
    if (!allQuestionsAnswered) {
      return;
    }

    setProgressState((current) => {
      const currentScenarioProgress = getProgressForScenario(current, selectedScenario.id);

      return {
        ...current,
        [selectedScenario.id]: {
          ...currentScenarioProgress,
          questionnaireCompleted: true,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    setIsEditingAnswers(false);
    setActiveStepIndex(0);
  };

  const trackDownload = (template: TemplateResource) => {
    setProgressState((current) => {
      const currentScenarioProgress = getProgressForScenario(current, selectedScenario.id);
      const nextDownloadedIds = Array.from(
        new Set([...currentScenarioProgress.downloadedTemplateIds, template.id]),
      );

      return {
        ...current,
        [selectedScenario.id]: {
          ...currentScenarioProgress,
          downloadedTemplateIds: nextDownloadedIds,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const resetScenarioProgress = () => {
    const shouldReset = window.confirm(
      'Сбросить весь прогресс по этой ситуации? Отметки этапов, ответы и история документов будут очищены.',
    );

    if (!shouldReset) {
      return;
    }

    setProgressState((current) => ({
      ...current,
      [selectedScenario.id]: emptyScenarioProgress(),
    }));
    setActiveStepIndex(0);
    setIsEditingAnswers(branchQuestions.length > 0);
  };

  const answerSummary = branchQuestions
    .map((question) => {
      const selectedValue = branchAnswers[question.id];
      const option = question.options.find((item) => item.value === selectedValue);

      if (!option) {
        return null;
      }

      return {
        question: question.title,
        answer: option.label,
      };
    })
    .filter((item): item is { question: string; answer: string } => Boolean(item));

  const nextAction =
    completedIds.length === visibleSteps.length
      ? 'Процедура завершена'
      : visibleSteps[getFirstOpenStepIndex(visibleSteps, completedIds)]?.title ?? 'Заполните опрос';
  const scenarioCompletionPercent = getCompletionPercent(visibleSteps, completedIds);
  const currentStepNumber = activeStep ? activeStepIndex + 1 : 0;
  const canGoToPreviousStep = activeStepIndex > 0;
  const canGoToNextStep =
    activeStepIndex < visibleSteps.length - 1 &&
    isStepUnlocked(visibleSteps, activeStepIndex + 1, completedIds);
  const isCurrentStepCompleted = activeStep ? completedIds.includes(activeStep.id) : false;
  const shouldHighlightNextStep = isCurrentStepCompleted && canGoToNextStep;
  const stepNavigationLabel =
    completedIds.length === visibleSteps.length
      ? 'Статус процедуры'
      : isCurrentStepCompleted
        ? 'Следующий шаг'
        : 'Что нужно сделать';
  const stepNavigationHint =
    completedIds.length === visibleSteps.length
      ? 'Все этапы уже отмечены как выполненные.'
      : isCurrentStepCompleted
        ? nextAction
        : 'Сначала отметьте текущий этап как выполненный.';
  const hasCurrentStepTemplates = currentStepTemplates.length > 0;

  const openCatalog = () => {
    setCatalogScenarioId(null);
    setAppStage('catalog');
  };

  const returnToLanding = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setCatalogScenarioId(null);
    setAppStage('landing');
  };

  const openWorkspace = () => {
    if (!catalogScenarioId) {
      return;
    }

    setSelectedScenarioId(catalogScenarioId);
    setActiveStepIndex(0);
    setAppStage('workspace');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const returnToCatalog = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setCatalogScenarioId(selectedScenario.id);
    setAppStage('catalog');
  };

  const goToPreviousStep = () => {
    if (!canGoToPreviousStep) {
      return;
    }

    setShouldScrollToCurrentStep(true);
    setActiveStepIndex((current) => Math.max(0, current - 1));
  };

  const goToNextStep = () => {
    if (!canGoToNextStep) {
      return;
    }

    setShouldScrollToCurrentStep(true);
    setActiveStepIndex((current) => Math.min(visibleSteps.length - 1, current + 1));
  };

  return (
    <div className={`page-shell ${appStage === 'landing' ? 'page-shell--landing' : ''}`}>
      <div className="page-backdrop" />
      {appStage === 'landing' ? (
        <header className="hero hero--landing">
          <div className="hero-copy">
            <span className="eyebrow">Трудовая дисциплина</span>
            <h1>Дисциплинарная процедура без ошибок</h1>
            <p className="hero-lead">
              Инструмент для руководителя и HR, который помогает пройти дисциплинарную процедуру
              по шагам, не пропустить сроки и вовремя подготовить нужные документы.
            </p>
            <div className="hero-dashboard">
              <section className="hero-info-card">
                <strong>Что предлагает сервис</strong>
                <div className="hero-info-list">
                  {serviceOffers.map((item) => (
                    <div className="hero-info-item" key={item}>
                      <span className="hero-info-mark" />
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="hero-info-card">
                <strong>Нормативная база</strong>
                <div className="hero-info-list">
                  {legalBasisItems.map((item) => (
                    <div className="hero-info-item" key={item}>
                      <span className="hero-info-mark hero-info-mark--neutral" />
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="hero-actions">
              <button className="primary-button" onClick={openCatalog}>
                Перейти к ситуациям
              </button>
              <span className="hero-note">
                Основа: статьи 192–194 ТК РФ и внутренний порядок процедуры
              </span>
            </div>
          </div>
          <div className="hero-panel">
            <div className="metric-card">
              <strong>{scenarios.length}</strong>
              <span>типовых ситуаций с понятным порядком работы</span>
            </div>
            <div className="metric-card">
              <strong>{allTemplates.length}</strong>
              <span>видов документов уже включено в систему</span>
            </div>
            <div className="metric-card">
              <strong>1</strong>
              <span>главное ограничение: не начинать процедуру во время отпуска и больничного</span>
            </div>
            <div className="metric-card metric-card--accent">
              <strong>Единый порядок работы</strong>
              <span>вместо заметок и разрозненных файлов у вас один понятный порядок действий</span>
            </div>
          </div>
        </header>
      ) : null}

      {appStage === 'catalog' ? (
        <main className="layout layout--revealed">
          <section className="zone-bar">
            <div className="zone-steps">
              <span className="zone-chip is-complete">1. Главная</span>
              <span className="zone-chip is-active">2. Каталог ситуаций</span>
              <span className="zone-chip">3. Порядок действий</span>
            </div>
            <div className="zone-actions">
              <button className="secondary-button" onClick={returnToLanding}>
                Назад на главную
              </button>
              <button className="primary-button" onClick={openWorkspace} disabled={!catalogScenario}>
                Перейти к порядку действий
              </button>
            </div>
          </section>

          <section className="catalog-stage" id="scenario-catalog">
            <div className="catalog-stage-header section-heading">
              <span className="eyebrow">Выбор ситуации</span>
              <h2>Сначала выберите ситуацию, затем откройте порядок действий</h2>
              <p>
                Здесь открыт только каталог. Пошаговый порядок действий появится после того, как вы
                выберете нужную ситуацию и подтвердите переход.
              </p>
              <div className="catalog-flow">
                <span className="flow-step is-active">1. Выберите ситуацию</span>
                <span className="flow-step">2. Перейдите к порядку действий</span>
              </div>
            </div>

            <div className="catalog-stage-layout">
              <section className="catalog-section">
                <div className="section-heading">
                  <span className="eyebrow">Каталог ситуаций</span>
                  <h3>Выберите типовую ситуацию</h3>
                </div>

                <div className="scenario-grid">
                  {scenarios.map((scenario) => {
                    const scenarioRouteSteps = getVisibleSteps(
                      scenario,
                      getProgressForScenario(progressState, scenario.id).answers,
                    );
                    const progress = getProgressForScenario(progressState, scenario.id);
                    const completedForScenario = progress.completedStepIds.filter((id) =>
                      scenarioRouteSteps.some((step) => step.id === id),
                    );
                    const percent = getCompletionPercent(scenarioRouteSteps, completedForScenario);
                    const isCatalogSelected = catalogScenarioId === scenario.id;

                    return (
                      <button
                        key={scenario.id}
                        className={`scenario-card ${isCatalogSelected ? 'is-active' : ''}`}
                        onClick={() => setCatalogScenarioId(scenario.id)}
                        aria-pressed={isCatalogSelected}
                        style={{ '--scenario-accent': scenario.accent } as CSSProperties}
                      >
                        <div className="scenario-card-top">
                          <span className={`risk-pill ${riskLevelClassMap[scenario.riskLevel]}`}>
                            {scenario.riskLevel}
                          </span>
                          <span className="scenario-short">{scenario.shortTitle}</span>
                        </div>
                        <h3>{scenario.title}</h3>
                        <p>{scenario.description}</p>
                        <ul>
                          {scenario.whenToUse.slice(0, 2).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        <div className="scenario-card-footer">
                          <div className="scenario-progress">
                            <span>Прогресс</span>
                            <strong>{percent}%</strong>
                          </div>
                          <span className={`scenario-select ${isCatalogSelected ? 'is-selected' : ''}`}>
                            {isCatalogSelected ? 'Выбрано' : 'Выбрать'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="catalog-preview-card">
                {catalogScenario ? (
                  <>
                    <span className="eyebrow">Выбранная ситуация</span>
                    <h3>{catalogScenario.title}</h3>
                    <p>{catalogScenario.intro}</p>
                    <div className="summary-line">
                      <span>Шагов в порядке действий</span>
                      <strong>{catalogVisibleSteps.length}</strong>
                    </div>
                    <div className="summary-line">
                      <span>Документов по ситуации</span>
                      <strong>{catalogVisibleTemplates.length}</strong>
                    </div>
                    <div className="summary-line">
                      <span>Прогресс по ситуации</span>
                      <strong>
                        {getCompletionPercent(catalogVisibleSteps, catalogProgress.completedStepIds)}%
                      </strong>
                    </div>
                    <button className="primary-button" onClick={openWorkspace}>
                      Открыть порядок действий
                    </button>
                  </>
                ) : (
                  <>
                    <span className="eyebrow">Следующий шаг</span>
                    <h3>После выбора ситуации откроется порядок действий</h3>
                    <p>
                      Сейчас вы находитесь в каталоге. Выберите нужную ситуацию, и после этого
                      можно будет открыть порядок действий.
                    </p>
                  </>
                )}
              </aside>
            </div>
          </section>
        </main>
      ) : null}

      {appStage === 'workspace' ? (
        <main className="layout layout--revealed">
        <section className="zone-bar">
          <div className="zone-steps">
            <span className="zone-chip is-complete">1. Главная</span>
            <span className="zone-chip is-complete">2. Каталог ситуаций</span>
            <span className="zone-chip is-active">3. Порядок действий</span>
          </div>
          <div className="zone-actions">
            <button className="secondary-button" onClick={returnToCatalog}>
              Назад к ситуациям
            </button>
            <button className="secondary-button" onClick={returnToLanding}>
              На главную
            </button>
          </div>
        </section>

        <section className="workspace-entry-card">
          <span className="eyebrow">Порядок действий</span>
          <h2>{selectedScenario.title}</h2>
          <p>
            Здесь открыт порядок действий только по выбранной ситуации. Чтобы перейти к другой
            ситуации, сначала вернитесь в каталог.
          </p>
          {!showQuestionnaire && activeStep ? (
            <div className="workspace-progress-card">
              <div className="workspace-progress-top">
                <div>
                  <span className="workspace-progress-label">Текущий шаг</span>
                  <strong>
                    Шаг {currentStepNumber} из {visibleSteps.length}
                  </strong>
                </div>
                <div className="workspace-progress-meta">
                  <span>{scenarioCompletionPercent}% выполнено</span>
                  <strong>{activeStep.title}</strong>
                </div>
              </div>
              <div className="workspace-progress-bar" aria-hidden="true">
                <span style={{ width: `${scenarioCompletionPercent}%` }} />
              </div>
            </div>
          ) : null}
        </section>

        <section className="workspace-section">
          <aside className="workspace-sidebar">
            <div className="sidebar-card scenario-summary">
              <span className="eyebrow">Выбранная ситуация</span>
              <h2>{selectedScenario.title}</h2>
              <p>{selectedScenario.intro}</p>
              <div className="summary-line">
                <span>Шагов в порядке действий</span>
                <strong>{visibleSteps.length}</strong>
              </div>
              <div className="summary-line">
                <span>Документов по ситуации</span>
                <strong>{visibleRouteTemplates.length}</strong>
              </div>
              <div className="summary-line">
                <span>Завершено</span>
                <strong>{completedIds.length}</strong>
              </div>
              <button className="secondary-button" onClick={resetScenarioProgress}>
                Сбросить прогресс по этой ситуации
              </button>
            </div>

            <div className="sidebar-card red-flag-card">
              <span className="eyebrow">Критичные моменты</span>
              <h3>На что обратить особое внимание</h3>
              <ul>
                {routeRedFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>

            <div className="sidebar-card">
              <span className="eyebrow">Подсказки</span>
              <h3>Что важно учесть</h3>
              <ul>
                {routeTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>

            <div className="sidebar-card">
              <span className="eyebrow">Справочные материалы</span>
              <h3>Что полезно держать под рукой</h3>
              <div className="reference-list">
                {scenarioReferences.map((resource) => (
                  <ReferenceCard key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
          </aside>

          <div className="workspace-main">
            {showQuestionnaire ? (
              <section className="questionnaire-card">
                <div className="section-heading compact">
                  <span className="eyebrow">Уточните ситуацию</span>
                  <h2>Сервис уточнит порядок действий с учетом ваших ответов</h2>
                  <p>
                    Этот мини-опрос нужен только для самых рискованных ситуаций. Он помогает
                    уточнить шаги, подсказки и рекомендации по документам.
                  </p>
                </div>

                <div className="question-list">
                  {branchQuestions.map((question) => (
                    <QuestionBlock
                      key={question.id}
                      question={question}
                      selectedValue={branchAnswers[question.id]}
                      onSelect={setScenarioAnswer}
                    />
                  ))}
                </div>

                <div className="questionnaire-actions">
                  <button
                    className="primary-button"
                    onClick={buildRoute}
                    disabled={!allQuestionsAnswered}
                  >
                    Сформировать порядок действий
                  </button>
                  <span className="questionnaire-note">
                    Ответы сохранятся в браузере и останутся после обновления страницы.
                  </span>
                </div>
              </section>
            ) : null}

            {!showQuestionnaire && routeRecommendation ? (
              <section className={`route-outcome-card ${branchRiskClassMap[routeRecommendation.risk]}`}>
                <div className="route-outcome-top">
                  <div>
                    <span className="eyebrow">Итог мини-опроса</span>
                    <h2>{routeRecommendation.title}</h2>
                  </div>
                  <span className={`signal-pill ${branchRiskClassMap[routeRecommendation.risk]}`}>
                    {branchRiskLabelMap[routeRecommendation.risk]}
                  </span>
                </div>

                <div className="route-outcome-grid">
                  <div className="route-outcome-body">
                    {routeRecommendation.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>

                  {answerSummary.length > 0 ? (
                    <div className="answer-summary">
                      <h3>Как сервис понял ситуацию</h3>
                      <div className="answer-summary-list">
                        {answerSummary.map((item) => (
                          <div className="answer-chip" key={item.question}>
                            <strong>{item.question}</strong>
                            <span>{item.answer}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="route-outcome-actions">
                  <button className="secondary-button" onClick={() => setIsEditingAnswers(true)}>
                    Изменить ответы
                  </button>
                </div>
              </section>
            ) : null}

            {!showQuestionnaire && activeStep ? (
              <>
                <div className="stepper-card">
                  <div className="section-heading compact">
                    <span className="eyebrow">Порядок действий</span>
                    <h2>Чек-лист по процедуре</h2>
                  </div>

                  <div className="stepper-list">
                    {visibleSteps.map((step, index) => {
                      const checked = completedIds.includes(step.id);
                      const unlocked = isStepUnlocked(visibleSteps, index, completedIds);

                      return (
                        <button
                          key={step.id}
                          className={`stepper-item ${checked ? 'is-complete' : ''} ${
                            activeStepIndex === index ? 'is-current' : ''
                          } ${!unlocked ? 'is-locked' : ''}`}
                          onClick={() => {
                            if (!unlocked) {
                              return;
                            }

                            setShouldScrollToCurrentStep(true);
                            setActiveStepIndex(index);
                          }}
                          disabled={!unlocked}
                        >
                          <span className="step-index">{index + 1}</span>
                          <div>
                            <strong>{step.title}</strong>
                            <span>{step.goal}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <article className="step-detail-card" id="current-step-card">
                  <div className="step-detail-header">
                    <div>
                      <span className="eyebrow">Текущий этап</span>
                      <h2>{activeStep.title}</h2>
                      <p>{activeStep.goal}</p>
                    </div>
                    <label className="check-toggle">
                      <input
                        type="checkbox"
                        checked={completedIds.includes(activeStep.id)}
                        onChange={(event) =>
                          markStep(selectedScenario.id, activeStep.id, event.target.checked)
                        }
                      />
                      <span>Этап выполнен</span>
                    </label>
                  </div>

                  <div className="step-navigation">
                    <button
                      className="secondary-button"
                      onClick={goToPreviousStep}
                      disabled={!canGoToPreviousStep}
                    >
                      Предыдущий шаг
                    </button>
                    <div className="step-navigation-note">
                      <span>Следующее действие</span>
                      <strong>{stepNavigationHint}</strong>
                    </div>
                    <button
                      className={`primary-button step-next-button ${
                        shouldHighlightNextStep ? 'step-next-button--highlighted' : ''
                      }`}
                      onClick={goToNextStep}
                      disabled={!canGoToNextStep}
                    >
                      Следующий шаг
                    </button>
                  </div>

                  <div className="detail-grid">
                    <section className="detail-panel">
                      <h3>Что сделать на этом шаге</h3>
                      <ul>
                        {activeStep.instructions.map((instruction) => (
                          <li key={instruction}>{instruction}</li>
                        ))}
                      </ul>
                    </section>

                    <section className="detail-panel">
                      <h3>Что должно быть готово перед переходом</h3>
                      <p>{activeStep.requiredBeforeNext}</p>
                      <div className="law-basis">
                        <span>Правовая опора</span>
                        <strong>{activeStep.legalBasis}</strong>
                      </div>
                      {activeStep.warning ? (
                        <div className="warning-box">
                          <strong>Внимание</strong>
                          <p>{activeStep.warning}</p>
                        </div>
                      ) : null}
                    </section>
                  </div>

                  <section className="documents-panel">
                    <div className="section-heading compact">
                      <span className="eyebrow">Документы по этапу</span>
                      <h3>Что можно скачать или подготовить</h3>
                    </div>

                    <div className="document-list">
                      {!hasCurrentStepTemplates ? (
                        <div className="empty-documents-state">
                          <strong>На этом этапе отдельный шаблон не нужен</strong>
                          <p>
                            Выполните действия по чек-листу и переходите дальше, когда этот этап
                            будет завершен.
                          </p>
                        </div>
                      ) : null}
                      {currentStepTemplates.map((template) => {
                        const alreadyTracked = downloadedIds.includes(template.id);
                        const isHighlighted = highlightedTemplateIds.has(template.id);
                          const templateBadge =
                            activeStep.templateFile?.id === template.id
                              ? { label: 'Основной документ этапа', className: 'template-main' }
                              : isHighlighted
                                ? { label: 'Особенно важен в этой ситуации', className: 'template-branch' }
                                : { label: 'Связанный документ', className: 'template-related' };

                        return (
                          <div className="document-card" key={template.id}>
                            <div className="document-header">
                              <div>
                                <strong>{template.title}</strong>
                                <span className={`template-status ${templateBadge.className}`}>
                                  {templateBadge.label}
                                </span>
                                <span>
                                  {template.isAvailable
                                    ? 'Шаблон доступен'
                                    : 'Шаблон пока не загружен'}
                                </span>
                              </div>
                              {template.isAvailable && template.filePath ? (
                                <a
                                  href={template.filePath}
                                  download
                                  className="download-link"
                                  onClick={() => trackDownload(template)}
                                >
                                  Скачать .docx
                                </a>
                              ) : (
                                <span className="pending-chip">
                                  {template.filePath ?? 'Путь будет назначен позже'}
                                </span>
                              )}
                            </div>
                            <div className="document-guide">
                              <h4>Что заполнить в этом файле</h4>
                              <ul>
                                {template.fillGuide.map((guide) => (
                                  <li key={guide}>{guide}</li>
                                ))}
                              </ul>
                            </div>
                            <p className="document-note">{template.notes}</p>
                            {alreadyTracked ? (
                              <div className="tracked-chip">
                                Этот документ уже открывался
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="result-panel">
                    <div className="section-heading compact">
                      <span className="eyebrow">Итог по ситуации</span>
                      <h3>Текущий статус прохождения</h3>
                    </div>

                    <div className="result-grid">
                      <div className="result-card">
                        <span>Пройдено шагов</span>
                        <strong>
                          {completedIds.length} из {visibleSteps.length}
                        </strong>
                      </div>
                      <div className="result-card">
                        <span>Отмечено документов</span>
                        <strong>{downloadedIds.length}</strong>
                      </div>
                      <div className="result-card">
                        <span>Следующее действие</span>
                        <strong>{nextAction}</strong>
                      </div>
                    </div>

                    <div className="final-reminder">
                      <strong>Напоминание после применения взыскания</strong>
                      <p>
                        Взыскание действует 1 год, если не снято досрочно приказом. При отсутствии
                        новых взысканий считается снятым автоматически.
                      </p>
                    </div>
                  </section>
                </article>
              </>
            ) : null}
          </div>
        </section>

        <section className="template-catalog">
          <div className="section-heading">
            <span className="eyebrow">Шаблоны документов</span>
            <h2>Какие документы поддерживает система</h2>
            <p>
              Сейчас структура уже знает, какие `.docx` должны лежать в проекте. Когда вы передадите
              готовые файлы, их достаточно будет положить в `public/templates`.
            </p>
          </div>

          <div className="template-grid">
            {allTemplates.map((template) => (
              <div className="template-tile" key={template.id}>
                <strong>{template.title}</strong>
                <span>{template.filePath ?? 'Путь еще не указан'}</span>
              </div>
            ))}
          </div>
        </section>
        </main>
      ) : null}
    </div>
  );
};

const QuestionBlock = ({
  question,
  selectedValue,
  onSelect,
}: {
  question: ScenarioQuestion;
  selectedValue?: string;
  onSelect: (questionId: string, value: string) => void;
}) => (
  <div className="question-block">
    <div className="question-head">
      <h3>{question.title}</h3>
      <p>{question.description}</p>
    </div>
    <div className="option-grid">
      {question.options.map((option) => (
        <button
          type="button"
          key={option.id}
          className={`option-card ${selectedValue === option.value ? 'is-selected' : ''}`}
          onClick={() => onSelect(question.id, option.value)}
        >
          <strong>{option.label}</strong>
          <span>{option.description}</span>
        </button>
      ))}
    </div>
  </div>
);

const ReferenceCard = ({ resource }: { resource: ReferenceResource }) => (
  <div className="reference-card">
    <strong>{resource.title}</strong>
    <span>{resource.audience}</span>
    <p>{resource.description}</p>
    <a className="download-link" href={resource.filePath} download>
      Скачать материал
    </a>
  </div>
);

export default App;
