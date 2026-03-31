export type RiskLevel = 'Низкий риск' | 'Средний риск' | 'Высокий риск' | 'Критический риск';
export type BranchRisk = 'green' | 'yellow' | 'red';
export type TemplatePriority = 'required' | 'recommended' | 'related';

export interface BranchCondition {
  questionId: string;
  values: string[];
}

export interface ScenarioQuestionOption {
  id: string;
  label: string;
  value: string;
  description: string;
}

export interface ScenarioQuestion {
  id: string;
  title: string;
  description: string;
  options: ScenarioQuestionOption[];
}

export interface ScenarioRecommendation {
  risk: BranchRisk;
  title: string;
  body: string[];
}

export interface BranchRuleEffect {
  additionalRedFlags?: string[];
  additionalTips?: string[];
  hiddenStepIds?: string[];
  highlightedTemplateIds?: string[];
  recommendation?: ScenarioRecommendation;
}

export interface BranchRule {
  id: string;
  whenAll: BranchCondition[];
  effects: BranchRuleEffect;
}

export interface TemplateResource {
  id: string;
  title: string;
  filePath?: string;
  isAvailable?: boolean;
  priority?: TemplatePriority;
  visibleWhen?: BranchCondition[];
  fillGuide: string[];
  notes: string;
}

export interface Step {
  id: string;
  title: string;
  goal: string;
  legalBasis: string;
  instructions: string[];
  requiredBeforeNext: string;
  warning?: string;
  visibleWhen?: BranchCondition[];
  templateFile?: TemplateResource;
  relatedTemplates?: TemplateResource[];
}

export interface Scenario {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  whenToUse: string[];
  riskLevel: RiskLevel;
  accent: string;
  intro: string;
  redFlags: string[];
  tips: string[];
  documents: TemplateResource[];
  steps: Step[];
  questions?: ScenarioQuestion[];
  branchRules?: BranchRule[];
  defaultRecommendation?: ScenarioRecommendation;
}

export interface ReferenceResource {
  id: string;
  title: string;
  description: string;
  filePath: string;
  audience: string;
}
