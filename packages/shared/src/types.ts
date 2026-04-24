export type VolunteerStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';
export type TaskStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export interface Volunteer {
  id: string;
  name: string;
  email: string;
  bio?: string;
  skills: string[];
  location?: string;
  status: VolunteerStatus;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  description?: string;
  location?: string;
  contactEmail: string;
  createdAt: string;
}

export interface Task {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  requiredSkills: string[];
  location?: string;
  startDate?: string;
  endDate?: string;
  maxVolunteers: number;
  status: TaskStatus;
  createdAt: string;
}

export interface Application {
  id: string;
  volunteerId: string;
  taskId: string;
  status: ApplicationStatus;
  matchScore?: number;
  matchReason?: string;
  createdAt: string;
}
