import type { Project, Study, Feedback } from "../types";
export type SourcePage = { number: number; text: string };
export type PrivateStudy = Study & {
  assessment?: Feedback;
  firstAssessment?: Feedback;
  hintPlan?: string[];
  archives?: PrivateStudy[];
};
export type PrivateProject = Omit<Project, "studies"> & {
  activity?: Record<string, number>;
  studies: Record<string, PrivateStudy>;
  receipts: { id: string; fingerprint: string }[];
};
export type StoredProject = {
  owner: string;
  project: PrivateProject;
  pages: SourcePage[];
  filePath?: string;
};
