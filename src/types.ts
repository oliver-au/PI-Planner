export type Sprint = {
  id: string;
  name: string;
  order: number;
  capacityPerDevSP?: number;
};

export type Developer = {
  id: string;
  name: string;
};

export type Feature = {
  id: string;
  name: string;
};

export type Ticket = {
  id: string;
  key: string;
  name: string;
  storyPoints: number;
  developerId: string;
  featureId: string;
  sprintIds: string[];
  dependencies: string[];
  createdAt: number;
};
