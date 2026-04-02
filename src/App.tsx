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

const App = () => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarios[0].id);
  const [progressState, setProgressState] = useState<ProgressState>({});
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isEditingAnswers, setIsEditingAnswers] = useState(false);

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

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [selectedScenarioId],
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
    setActiveStepIndex(getFirstOpenStepIndex(visibleSteps, completedIds));
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
      ? 'Маршрут завершен'
      : visibleSteps[getFirstOpenStepIndex(visibleSteps, completedIds)]?.title ?? 'Заполните опрос';

  return (
    <div className="page-shell">
      <div className="page-backdrop" />
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Дисциплина труда</span>
          <h1>Дисциплинарная процедура без ошибок</h1>
          <p>
            Выберите ситуацию, пройдите процедуру по этапам и скачивайте нужные шаблоны
            документов. Прогресс сохраняется прямо в браузере.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => {
                document.getElementById('scenario-catalog')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Перейти к сценариям
            </button>
            <span className="hero-note">Основа: ст. 192–194 ТК РФ и ваш алгоритм процедуры</span>
          </div>
        </div>
        <div className="hero-panel">
          <div className="metric-card">
            <strong>{scenarios.length}</strong>
            <span>сценариев для первой версии</span>
          </div>
          <div className="metric-card">
            <strong>{allTemplates.length}</strong>
            <span>типов документов поддерживает структура</span>
          </div>
          <div className="metric-card">
            <strong>1</strong>
            <span>критичный принцип: не работать во время отпуска и больничного</span>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="catalog-section" id="scenario-catalog">
          <div className="section-heading">
            <span className="eyebrow">Каталог ситуаций</span>
            <h2>Выберите типовую ситуацию</h2>
            <p>
              Все сценарии построены вокруг одного безопасного юридического маршрута, но адаптированы
              под конкретные риски и документы.
            </p>
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

              return (
                <button
                  key={scenario.id}
                  className={`scenario-card ${selectedScenario.id === scenario.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedScenarioId(scenario.id)}
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
                  <div className="scenario-progress">
                    <span>Прогресс</span>
                    <strong>{percent}%</strong>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="workspace-section">
          <aside className="workspace-sidebar">
            <div className="sidebar-card scenario-summary">
              <span className="eyebrow">Выбранный сценарий</span>
              <h2>{selectedScenario.title}</h2>
              <p>{selectedScenario.intro}</p>
              <div className="summary-line">
                <span>Шагов в маршруте</span>
                <strong>{visibleSteps.length}</strong>
              </div>
              <div className="summary-line">
                <span>Документов в ветке</span>
                <strong>{visibleRouteTemplates.length}</strong>
              </div>
              <div className="summary-line">
                <span>Завершено</span>
                <strong>{completedIds.length}</strong>
              </div>
              <button className="secondary-button" onClick={resetScenarioProgress}>
                Сбросить прогресс по сценарию
              </button>
            </div>

            <div className="sidebar-card red-flag-card">
              <span className="eyebrow">Красные флаги</span>
              <h3>Что нельзя пропускать</h3>
              <ul>
                {routeRedFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>

            <div className="sidebar-card">
              <span className="eyebrow">Подсказки</span>
              <h3>Практические ориентиры</h3>
              <ul>
                {routeTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>

            <div className="sidebar-card">
              <span className="eyebrow">Справочные материалы</span>
              <h3>Что можно открыть рядом</h3>
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
                  <h2>Сервис подстроит маршрут под ваши ответы</h2>
                  <p>
                    Этот мини-опрос нужен только для самых рискованных сценариев. Он помогает
                    поменять шаги, подсказки и рекомендации по документам.
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
                    Построить маршрут
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
                    <span className="eyebrow">Пошаговый маршрут</span>
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
                          onClick={() => unlocked && setActiveStepIndex(index)}
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

                <article className="step-detail-card">
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
                      {currentStepTemplates.map((template) => {
                        const alreadyTracked = downloadedIds.includes(template.id);
                        const isHighlighted = highlightedTemplateIds.has(template.id);
                        const templateBadge =
                          activeStep.templateFile?.id === template.id
                            ? { label: 'Основной документ этапа', className: 'template-main' }
                            : isHighlighted
                              ? { label: 'Рекомендуем для этой ветки', className: 'template-branch' }
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
                                    ? 'Шаблон подключен'
                                    : 'Шаблон будет добавлен'}
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
                                Документ уже открывался в этом сценарии
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="result-panel">
                    <div className="section-heading compact">
                      <span className="eyebrow">Итог по сценарию</span>
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
            <span className="eyebrow">Библиотека шаблонов</span>
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
